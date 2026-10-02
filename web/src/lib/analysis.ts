import { Cohort } from "./cohort";
import { angleOf, blochVectors, DEFAULT_SPEC, FeatureMapSpec, overlap2, SCALE_GRID, simulate, State, Vec3 } from "./quantum";
import { Mat, zeros } from "./linalg";
import { beran, bootstrapCI, cIndex, Curve, effectiveN, kaplanMeier, survivalAt, topK } from "./survival";
import { mulberry32, normal } from "./rng";

export const NEIGHBOURS = 15;
export const RBF_GRID = [0.25, 0.5, 1, 2, 4];
export type KernelKind = "proj" | "fid" | "rbf";
export const KERNEL_LABEL: Record<KernelKind, string> = {
  proj: "Projected quantum kernel",
  fid: "Fidelity quantum kernel",
  rbf: "Classical RBF kernel",
};

export interface Prediction {
  curve: Curve;
  risk: number;
  neighbours: { j: number; w: number }[];
  effN: number;
  tier: "high" | "intermediate" | "low" | "uncertain";
}

export interface Model {
  cohort: Cohort;
  n: number;
  q: number;
  angles: number[][];   // unscaled angleOf(z)
  spec: FeatureMapSpec; // feature map used for the projected kernel (bandwidth chosen by CV)
  states: State[];
  bloch: Vec3[][];
  gammaQ: number;
  K: Record<KernelKind, Mat>;
  chosen: Record<KernelKind, number>; // selected bandwidth per kernel
  candidates: Record<KernelKind, { param: number; K: Mat }[]>;
  times: number[];
  events: number[];
  km: Curve;
  loo: Record<KernelKind, number[]>;
  cidx: Record<KernelKind, { c: number; ci: [number, number] }>;
}

/** Mean Bloch-vector length over patients and qubits: 1 means unentangled product states, lower means more entanglement. */
export const meanBlochLength = (bloch: Vec3[][]) => {
  let s = 0, c = 0;
  for (const b of bloch) for (const v of b) { s += Math.hypot(v[0], v[1], v[2]); c++; }
  return c ? s / c : 1;
};
/** Bloch vectors of one patient at another bandwidth. */
export const blochAt = (m: Model, i: number, scale: number) => blochVectors(simulate(m.angles[i], m.cohort.edges, { ...m.spec, scale }));
/** Mean Bloch length if the cohort were encoded at another bandwidth (up to `cap` evenly spaced patients). */
export function meanBlochLengthAt(m: Model, scale: number, cap = 150) {
  const step = Math.max(1, Math.ceil(m.n / cap)), out: Vec3[][] = [];
  for (let i = 0; i < m.n; i += step) out.push(blochAt(m, i, scale));
  return meanBlochLength(out);
}
export const sqDist3 = (a: Vec3[], b: Vec3[]) => a.reduce((s, v, k) => s + (v[0] - b[k][0]) ** 2 + (v[1] - b[k][1]) ** 2 + (v[2] - b[k][2]) ** 2, 0);
const sqDist = (a: number[], b: number[]) => a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0);

function medianSq<T>(pts: T[], d: (a: T, b: T) => number) {
  const ds: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) ds.push(d(pts[i], pts[j]));
  ds.sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)] || 1;
}

export function tierOf(risk: number, effN: number): Prediction["tier"] {
  if (effN < 5) return "uncertain";
  if (risk >= 0.5) return "high";
  if (risk >= 0.25) return "intermediate";
  return "low";
}

/** Kernel row -> Beran survival curve over the k most similar patients. `exclude` lists indices to ignore. */
function riskFromRow(row: number[], times: number[], events: number[], _horizon: number, exclude: number[]) {
  const w0 = row.slice();
  exclude.forEach((e) => (w0[e] = 0));
  const w = topK(w0, NEIGHBOURS);
  return { w, curve: beran(w, times, events) };
}

export function predictFromRow(row: number[], m: Pick<Model, "times" | "events" | "cohort">, exclude = -1): Prediction {
  const { w, curve } = riskFromRow(row, m.times, m.events, m.cohort.horizon, exclude >= 0 ? [exclude] : []);
  const risk = 1 - survivalAt(curve, m.cohort.horizon);
  const effN = effectiveN(w);
  const neighbours = w.map((x, j) => ({ j, w: x })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  return { curve, risk, neighbours, effN, tier: tierOf(risk, effN) };
}

function looRisks(K: Mat, times: number[], events: number[], horizon: number) {
  return K.map((row, i) => 1 - survivalAt(riskFromRow(row, times, events, horizon, [i]).curve, horizon));
}

export function buildModel(cohort: Cohort): Model {
  const n = cohort.patients.length, q = cohort.pathways.length;
  const angles = cohort.patients.map((p) => p.pathways.map(angleOf));
  const times = cohort.patients.map((p) => p.time), events = cohort.patients.map((p) => p.event);
  const H = cohort.horizon;

  const candidates: Model["candidates"] = { proj: [], fid: [], rbf: [] };
  const projCache: { states: State[]; bloch: Vec3[][]; gamma: number }[] = [];
  const fidelityFor = (states: State[]) => {
    const Kf = zeros(n);
    for (let i = 0; i < n; i++) { Kf[i][i] = 1; for (let j = i + 1; j < n; j++) Kf[i][j] = Kf[j][i] = overlap2(states[i], states[j]); }
    return Kf;
  };
  for (const scale of SCALE_GRID) {
    const spec = { ...DEFAULT_SPEC, scale };
    const states = angles.map((a) => simulate(a, cohort.edges, spec));
    const bloch = states.map(blochVectors);
    const gamma = 1 / medianSq(bloch, sqDist3);
    const Kp = zeros(n);
    for (let i = 0; i < n; i++) {
      Kp[i][i] = 1;
      for (let j = i + 1; j < n; j++) Kp[i][j] = Kp[j][i] = Math.exp(-gamma * sqDist3(bloch[i], bloch[j]));
    }
    candidates.proj.push({ param: scale, K: Kp });
    // fidelity kernels cost O(n^2 * 4096): for large cohorts only the projected kernel's chosen bandwidth is computed (below)
    if (n <= 150) candidates.fid.push({ param: scale, K: fidelityFor(states) });
    projCache.push({ states, bloch, gamma });
  }
  if (n > 150) {
    let best = 0, bestC = -1;
    candidates.proj.forEach((c, idx) => { const ci = cIndex(looRisks(c.K, times, events, H), times, events); if (ci > bestC) { bestC = ci; best = idx; } });
    candidates.fid.push({ param: SCALE_GRID[best], K: fidelityFor(projCache[best].states) });
  }
  const med = medianSq(angles, sqDist);
  for (const mult of RBF_GRID) {
    const g = mult / med, Kr = zeros(n);
    for (let i = 0; i < n; i++) { Kr[i][i] = 1; for (let j = i + 1; j < n; j++) Kr[i][j] = Kr[j][i] = Math.exp(-g * sqDist(angles[i], angles[j])); }
    candidates.rbf.push({ param: mult, K: Kr });
  }

  // Deployed model: bandwidth with the best leave-one-out C-index (performance is reported with nested CV separately).
  const K = {} as Model["K"], chosen = {} as Model["chosen"], loo = {} as Model["loo"], cidx = {} as Model["cidx"];
  const rand = mulberry32(7);
  let projIdx = 0;
  (Object.keys(candidates) as KernelKind[]).forEach((kind) => {
    let best = -1, bestC = -1, bestR: number[] = [];
    candidates[kind].forEach((c, idx) => {
      const r = looRisks(c.K, times, events, H);
      const ci = cIndex(r, times, events);
      if (ci > bestC) { bestC = ci; best = idx; bestR = r; }
    });
    K[kind] = candidates[kind][best].K;
    chosen[kind] = candidates[kind][best].param;
    loo[kind] = bestR;
    cidx[kind] = { c: bestC, ci: bootstrapCI(bestR, times, events, rand) };
    if (kind === "proj") projIdx = best;
  });
  const spec = { ...DEFAULT_SPEC, scale: SCALE_GRID[projIdx] };
  const pc = projCache[projIdx];
  return { cohort, n, q, angles, spec, states: pc.states, bloch: pc.bloch, gammaQ: pc.gamma, K, chosen, candidates, times, events, km: kaplanMeier(times, events), loo, cidx };
}

/**
 * Nested cross-validation: for each held-out patient, the bandwidth is chosen using only the other patients.
 * Runs in chunks so the UI stays responsive; calls onProgress(0..1).
 */
export async function nestedCV(m: Model, onProgress: (p: number) => void) {
  const H = m.cohort.horizon, n = m.n;
  const out = {} as Record<KernelKind, { c: number; ci: [number, number]; picks: number[] }>;
  const kinds: KernelKind[] = ["proj", "fid", "rbf"];
  let done = 0;
  for (const kind of kinds) {
    const risks: number[] = [], picks: number[] = [];
    for (let i = 0; i < n; i++) {
      let bestC = -1, bestIdx = 0;
      m.candidates[kind].forEach((c, idx) => {
        const r: number[] = [], t: number[] = [], e: number[] = [];
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          r.push(1 - survivalAt(riskFromRow(c.K[j], m.times, m.events, H, [i, j]).curve, H));
          t.push(m.times[j]); e.push(m.events[j]);
        }
        const ci = cIndex(r, t, e);
        if (ci > bestC) { bestC = ci; bestIdx = idx; }
      });
      picks.push(m.candidates[kind][bestIdx].param);
      risks.push(1 - survivalAt(riskFromRow(m.candidates[kind][bestIdx].K[i], m.times, m.events, H, [i]).curve, H));
      done++;
      if (i % 4 === 0) { onProgress(done / (n * kinds.length)); await new Promise((r) => setTimeout(r, 0)); }
    }
    out[kind] = { c: cIndex(risks, m.times, m.events), ci: bootstrapCI(risks, m.times, m.events, mulberry32(13)), picks };
  }
  onProgress(1);
  return out;
}

/** Projected-kernel row for an arbitrary set of (unscaled) angles. */
export function projRow(m: Model, angles: number[]) {
  const b = blochVectors(simulate(angles, m.cohort.edges, m.spec));
  return { bloch: b, row: m.bloch.map((bj) => Math.exp(-m.gammaQ * sqDist3(b, bj))) };
}

export function predictPatient(m: Model, i: number, kind: KernelKind = "proj") {
  return predictFromRow(m.K[kind][i], m, i);
}

/** Occlusion attribution: change in risk when one pathway is set to the cohort average. */
export function attribution(m: Model, i: number) {
  const base = predictPatient(m, i).risk;
  return m.cohort.pathways.map((_, k) => {
    const a = m.angles[i].slice();
    a[k] = 0;
    return base - predictFromRow(projRow(m, a).row, m, i).risk;
  });
}

export function whatIf(m: Model, i: number, zScores: number[]) {
  const { row, bloch } = projRow(m, zScores.map(angleOf));
  return { pred: predictFromRow(row, m, i), bloch };
}

/** Data-size experiment: repeated random subsamples, LOO C-index, bandwidths fixed at the deployed values. */
export function sizeCurve(m: Model, sizes: number[], reps: number, seed = 11) {
  const rand = mulberry32(seed);
  return sizes.map((size) => {
    const res: Record<"proj" | "rbf", number[]> = { proj: [], rbf: [] };
    for (let r = 0; r < reps; r++) {
      const idx = m.times.map((_, i) => i).sort(() => rand() - 0.5).slice(0, size);
      const t = idx.map((i) => m.times[i]), e = idx.map((i) => m.events[i]);
      if (e.reduce((a, b) => a + b, 0) < 3) continue;
      (["proj", "rbf"] as const).forEach((k) => {
        const risk = idx.map((i, a) => {
          const row = idx.map((j, b) => (a === b ? 0 : m.K[k][i][j]));
          const w = topK(row, Math.min(NEIGHBOURS, size - 1));
          return 1 - survivalAt(beran(w, t, e), m.cohort.horizon);
        });
        res[k].push(cIndex(risk, t, e));
      });
    }
    const stat = (v: number[]) => { const mu = v.reduce((a, b) => a + b, 0) / v.length; return { mean: mu, sd: Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, v.length - 1)) }; };
    return { size, proj: stat(res.proj), rbf: stat(res.rbf) };
  });
}

/** Fidelity kernel as a QPU would estimate it from finite shots (entry-wise sampling noise). */
export function shotNoisyFidelity(K: Mat, shots: number, seed: number) {
  const rand = mulberry32(seed), n = K.length, out = zeros(n);
  for (let i = 0; i < n; i++) {
    out[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const p = K[i][j];
      out[i][j] = out[j][i] = p + normal(rand) * Math.sqrt(Math.max(p * (1 - p), 1e-4) / shots);
    }
  }
  return out;
}

/** Global-depolarising approximation: each qubit's Bloch vector shrinks with the gates acting on it. */
export function depolarisedBloch(m: Model, p2: number, p1 = p2 / 10) {
  const deg = m.cohort.pathways.map((_, k) => m.cohort.edges.filter(([a, b]) => a === k || b === k).length);
  const reps = m.spec.reps;
  const f = deg.map((d) => Math.pow(1 - p1, 1 + 2 * reps) * Math.pow(1 - p2, 2 * reps * d));
  return { shrink: f, bloch: m.bloch.map((b) => b.map((v, k) => [v[0] * f[k], v[1] * f[k], v[2] * f[k]] as Vec3)) };
}

export function projKernelFrom(bloch: Vec3[][], gamma: number): Mat {
  const n = bloch.length, K = zeros(n);
  for (let i = 0; i < n; i++) { K[i][i] = 1; for (let j = i + 1; j < n; j++) K[i][j] = K[j][i] = Math.exp(-gamma * sqDist3(bloch[i], bloch[j])); }
  return K;
}

/** Bloch vector estimated from `shots` measurements in each of the X, Y, Z bases. */
export function shotEstimate(b: Vec3, shots: number, rand: () => number): Vec3 {
  return b.map((v) => {
    const p = (1 + v) / 2;
    let ones = 0;
    if (shots <= 2048) { for (let s = 0; s < shots; s++) if (rand() < p) ones++; }
    else ones = Math.round(shots * p + normal(rand) * Math.sqrt(shots * p * (1 - p)));
    return Math.max(-1, Math.min(1, (2 * ones) / shots - 1));
  }) as Vec3;
}

/** LOO C-index for an arbitrary kernel matrix (used by the noise lab). */
export function looCIndex(K: Mat, m: Model) {
  return cIndex(looRisks(K, m.times, m.events, m.cohort.horizon), m.times, m.events);
}

/** Plain-language comparison of quantum vs classical from nested CV results. */
export function verdict(q: { c: number; ci: [number, number] }, c: { c: number; ci: [number, number] }) {
  const d = q.c - c.c;
  const overlap = q.ci[0] <= c.ci[1] && c.ci[0] <= q.ci[1];
  if (overlap && Math.abs(d) < 0.03) return { kind: "parity" as const, text: "Quantum and classical kernels perform at parity on this cohort." };
  if (overlap) return { kind: d > 0 ? ("lean-q" as const) : ("lean-c" as const), text: `The ${d > 0 ? "quantum" : "classical"} kernel scores higher, but the confidence intervals overlap, so this is not evidence of a real difference.` };
  return { kind: d > 0 ? ("q" as const) : ("c" as const), text: `The ${d > 0 ? "quantum" : "classical"} kernel performs better, with non-overlapping confidence intervals.` };
}