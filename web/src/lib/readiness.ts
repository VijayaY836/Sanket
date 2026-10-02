/**
 * Quantum Readiness Check: is it worth running quantum kernels on this dataset?
 *  1. encode up to 12 features on qubits (PCA when more are selected), couplings from the feature correlation graph
 *  2. quantum headroom: geometric difference g between quantum and the closest classical kernel (Huang et al. 2021)
 *  3. demonstration: engineered quantum-structured labels on these features (synthetic by construction)
 *  4. real test (if an outcome is given): quantum vs classical kernels vs a linear model, repeated cross-validation
 *  5. plain-language verdict
 */
import { angleOf, blochVectors, DEFAULT_SPEC, simulate, Vec3 } from "./quantum";
import { eigSym, Mat, matmul, spectralMap, zeros } from "./linalg";
import { shuffle, tuned } from "./advantage";
import { mulberry32 } from "./rng";

export interface Table { headers: string[]; rows: string[][] }

export function parseCSV(text: string): Table {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur.trim()); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim()); cur = "";
      if (row.some((x) => x !== "")) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur.trim());
  if (row.some((x) => x !== "")) out.push(row);
  const headers = (out.shift() ?? []).map((h, i) => h || `column ${i + 1}`);
  return { headers, rows: out.filter((r) => r.length >= Math.min(2, headers.length)) };
}

const num = (s: string | undefined) => { if (s === undefined || s === "" || /^(na|nan|null|none|\?)$/i.test(s)) return NaN; const v = Number(s); return Number.isFinite(v) ? v : NaN; };
export function numericColumns(t: Table) {
  return t.headers.map((h, j) => ({ h, j, frac: t.rows.reduce((s, r) => s + (Number.isFinite(num(r[j])) ? 1 : 0), 0) / Math.max(t.rows.length, 1) }))
    .filter((c) => c.frac >= 0.8).map((c) => c.j);
}
export function distinctValues(t: Table, j: number) { return Array.from(new Set(t.rows.map((r) => r[j]).filter((v) => v !== undefined && v !== ""))).slice(0, 50); }

export type Outcome =
  | { kind: "none" }
  | { kind: "binary"; col: number; positive: string }
  | { kind: "survival"; timeCol: number; eventCol: number; eventPositive: string; horizon: number };

export interface ReadinessInput { table: Table; features: number[]; outcome: Outcome; name: string; maxN?: number }

export interface ReadinessReport {
  name: string;
  n: number; nFeatures: number; qubits: number; usedPCA: boolean; explained?: number;
  edges: [number, number][]; qubitLabels: string[];
  scan: { scale: number; g: number; closest: number }[];
  gBest: number; headroom: "low" | "moderate" | "substantial";
  demo: { size: number; quantum: number; classical: number }[];
  real: null | { n: number; positives: number; quantum: { mean: number; sd: number }; classical: { mean: number; sd: number }; linear: { mean: number; sd: number }; diff: number };
  verdict: { title: string; text: string; recommend: "classical" | "quantum" | "explore" };
  circuits: { projected: number; fidelity: number };
}

const SCALES = [0.25, 0.55, 1.0];
const MULTS = [0.25, 0.5, 1, 2, 4];
const tick = () => new Promise((r) => setTimeout(r, 0));
const sqd = (a: number[], b: number[]) => a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0);
const sqd3 = (a: Vec3[], b: Vec3[]) => a.reduce((s, v, k) => s + (v[0] - b[k][0]) ** 2 + (v[1] - b[k][1]) ** 2 + (v[2] - b[k][2]) ** 2, 0);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 1; };
function pairMedian(n: number, d: (i: number, j: number) => number) { const v: number[] = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) v.push(d(i, j)); return median(v); }
const normalise = (K: Mat) => { const n = K.length, tr = K.reduce((s, r, i) => s + r[i], 0); return K.map((r) => r.map((x) => (x * n) / tr)); };

function zscore(X: number[][]) {
  const p = X[0].length;
  for (let k = 0; k < p; k++) {
    const col = X.map((r) => r[k]).filter(Number.isFinite);
    const m = col.reduce((a, b) => a + b, 0) / Math.max(col.length, 1);
    const med = median(col);
    const sd = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(col.length - 1, 1)) || 1;
    X.forEach((r) => { const v = Number.isFinite(r[k]) ? r[k] : med; r[k] = (v - m) / sd; });
  }
  return X;
}

function pca(X: number[][], q: number) {
  const n = X.length, p = X[0].length;
  const C = zeros(p);
  for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { let s = 0; for (let i = 0; i < n; i++) s += X[i][a] * X[i][b]; C[a][b] = C[b][a] = s / (n - 1); }
  const e = eigSym(C);
  const order = e.values.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).slice(0, q).map((x) => x[1]);
  const total = e.values.reduce((s, v) => s + Math.max(v, 0), 0) || 1;
  const explained = order.reduce((s, i) => s + Math.max(e.values[i], 0), 0) / total;
  const Y = X.map((r) => order.map((i) => r.reduce((s, v, k) => s + v * e.vectors[k][i], 0)));
  return { Y: zscore(Y), explained };
}

/** Label-free coupling graph: strongest feature correlations, max degree 3, at most 14 edges. */
function corrEdges(Z: number[][]) {
  const q = Z[0].length, n = Z.length, pairs: [number, number, number][] = [];
  for (let a = 0; a < q; a++) for (let b = a + 1; b < q; b++) { let s = 0; for (let i = 0; i < n; i++) s += Z[i][a] * Z[i][b]; pairs.push([Math.abs(s / (n - 1)), a, b]); }
  pairs.sort((x, y) => y[0] - x[0]);
  const deg = new Array(q).fill(0), edges: [number, number][] = [];
  for (const [, a, b] of pairs) { if (edges.length >= 14) break; if (deg[a] < 3 && deg[b] < 3) { edges.push([a, b]); deg[a]++; deg[b]++; } }
  return edges;
}

function kernelFromBloch(B: Vec3[][]) { const n = B.length, g = 1 / pairMedian(n, (i, j) => sqd3(B[i], B[j])); return B.map((a) => B.map((b) => Math.exp(-g * sqd3(a, b)))); }

export async function runReadiness(inp: ReadinessInput, onProgress: (p: number, msg: string) => void): Promise<ReadinessReport> {
  const { table, features, outcome } = inp;
  const rand0 = mulberry32(7);
  // rows usable for features (and outcome, if any)
  let label: (number | null)[] = table.rows.map(() => null);
  if (outcome.kind === "binary") label = table.rows.map((r) => (r[outcome.col] === undefined || r[outcome.col] === "" ? null : r[outcome.col] === outcome.positive ? 1 : 0));
  if (outcome.kind === "survival") label = table.rows.map((r) => {
    const t = num(r[outcome.timeCol]), ev = r[outcome.eventCol] === outcome.eventPositive;
    if (!Number.isFinite(t)) return null;
    if (ev && t <= outcome.horizon) return 1;
    if (t > outcome.horizon) return 0;
    return null; // censored before the horizon: outcome unknown
  });
  let idx = table.rows.map((_, i) => i).filter((i) => features.filter((j) => Number.isFinite(num(table.rows[i][j]))).length >= Math.ceil(features.length * 0.5));
  const cap = inp.maxN ?? 200;
  if (idx.length > cap) idx = shuffle(idx, rand0).slice(0, cap).sort((a, b) => a - b);
  const n = idx.length;
  if (n < 30) throw new Error(`Only ${n} usable rows. The check needs at least 30.`);
  onProgress(0.03, "Standardising features");
  await tick();
  let Z = zscore(idx.map((i) => features.map((j) => num(table.rows[i][j]))));
  let usedPCA = false, explained: number | undefined, qubitLabels = features.map((j) => table.headers[j]);
  if (features.length > 12) {
    if (features.length > 200) throw new Error("Select at most 200 feature columns.");
    const r = pca(Z, 12); Z = r.Y; usedPCA = true; explained = r.explained; qubitLabels = Z[0].map((_, k) => `PC${k + 1}`);
  }
  const q = Z[0].length;
  const edges = corrEdges(Z);
  const A = Z.map((r) => r.map(angleOf));

  // kernels: quantum at three bandwidths, classical RBF at five
  onProgress(0.08, `Simulating ${n} rows on ${q} qubits`);
  await tick();
  const Kq: Mat[] = [];
  for (const sc of SCALES) { Kq.push(kernelFromBloch(A.map((a) => blochVectors(simulate(a, edges, { ...DEFAULT_SPEC, scale: sc }))))); await tick(); }
  const ma = pairMedian(n, (i, j) => sqd(A[i], A[j]));
  const DA = A.map((a) => A.map((b) => sqd(a, b)));
  const Kc = MULTS.map((m) => DA.map((r) => r.map((d) => Math.exp((-m * d) / ma))));

  // headroom on up to 120 rows (eigendecompositions)
  onProgress(0.2, "Measuring quantum headroom");
  await tick();
  const hIdx = n > 120 ? shuffle(A.map((_, i) => i), rand0).slice(0, 120) : A.map((_, i) => i);
  const sub = (K: Mat) => hIdx.map((i) => hIdx.map((j) => K[i][j]));
  const lam = 0.01;
  const invC = Kc.map((K) => spectralMap(eigSym(normalise(sub(K)).map((r, i) => r.map((x, j) => (i === j ? x + lam : x)))), (x) => 1 / x));
  const scan: ReadinessReport["scan"] = [];
  let best = { g: -1, s: 0, c: 0, v: [] as number[], sq: [] as Mat };
  for (let s = 0; s < SCALES.length; s++) {
    const sq = spectralMap(eigSym(normalise(sub(Kq[s]))), (x) => Math.sqrt(Math.max(x, 0)));
    let gMin = Infinity, cMin = 0, vMin: number[] = [];
    for (let c = 0; c < Kc.length; c++) {
      const M = matmul(matmul(sq, invC[c]), sq);
      const e = eigSym(M.map((r, i) => r.map((x, j) => (x + M[j][i]) / 2)));
      let top = 0; e.values.forEach((v, k) => { if (v > e.values[top]) top = k; });
      const g = Math.sqrt(Math.max(e.values[top], 0));
      if (g < gMin) { gMin = g; cMin = c; vMin = e.vectors.map((row) => row[top]); }
      onProgress(0.2 + 0.25 * ((s * Kc.length + c + 1) / (SCALES.length * Kc.length)), "Measuring quantum headroom");
      await tick();
    }
    scan.push({ scale: SCALES[s], g: gMin, closest: MULTS[cMin] });
    if (gMin > best.g) best = { g: gMin, s, c: cMin, v: vMin, sq };
  }
  const gBest = best.g;
  const headroom: ReadinessReport["headroom"] = gBest < 1.5 ? "low" : gBest < 3 ? "moderate" : "substantial";

  // demonstration on the headroom subset: engineered labels from the quantum kernel
  const yc = best.sq.map((row) => row.reduce((s, x, k) => s + x * best.v[k], 0));
  const mu = yc.reduce((a, b) => a + b, 0) / yc.length, sd = Math.sqrt(yc.reduce((a, b) => a + (b - mu) ** 2, 0) / yc.length) || 1;
  const tgt = yc.map((v) => (v - mu) / sd), medY = median(tgt), yEng = tgt.map((v) => (v > medY ? 1 : 0));
  const KqS = sub(Kq[best.s]), KcS = Kc.map(sub);
  const demo: ReadinessReport["demo"] = [];
  const sizes = [10, 20, 40, 80].filter((s) => s <= Math.floor(hIdx.length * 0.65));
  const reps = 8;
  const acc: Record<number, { q: number[]; c: number[] }> = {};
  sizes.forEach((s) => (acc[s] = { q: [], c: [] }));
  for (let r = 0; r < reps; r++) {
    const rand = mulberry32(300 + r), order = shuffle(hIdx.map((_, i) => i), rand), nTest = Math.max(15, Math.floor(hIdx.length * 0.3));
    const te = order.slice(0, nTest), pool = order.slice(nTest);
    for (const s of sizes) {
      const tr = pool.slice(0, s), pos = tr.filter((i) => yEng[i]).length;
      if (pos < 3 || s - pos < 3) continue;
      acc[s].q.push(tuned([KqS], tr, te, yEng, tgt, rand));
      acc[s].c.push(tuned(KcS, tr, te, yEng, tgt, rand));
    }
    onProgress(0.45 + 0.25 * ((r + 1) / reps), "Running the engineered demonstration");
    await tick();
  }
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1);
  sizes.forEach((s) => { if (acc[s].q.length) demo.push({ size: s, quantum: mean(acc[s].q), classical: mean(acc[s].c) }); });

  // real outcome
  let real: ReadinessReport["real"] = null;
  const lab = idx.map((i) => label[i]);
  const known = lab.map((v, a) => (v === null ? -1 : a)).filter((a) => a >= 0);
  if (outcome.kind !== "none") {
    const y = lab.map((v) => (v ?? 0) as number), pos = known.filter((a) => y[a]).length;
    if (known.length < 30 || pos < 6 || known.length - pos < 6) throw new Error(`The outcome has too few usable cases (${known.length} rows, ${pos} positive). The real test needs at least 30 rows with 6 of each class.`);
    const Lin = (() => { const L = Z.map((a) => Z.map((b) => a.reduce((s, v, k) => s + v * b[k], 0))); const d = L.reduce((s, r, i) => s + r[i], 0) / L.length; return L.map((r) => r.map((x) => x / d)); })();
    const res = { q: [] as number[], c: [] as number[], l: [] as number[] };
    const folds = 5, repeats = 3;
    for (let r = 0; r < repeats; r++) {
      const rand = mulberry32(900 + r);
      const posI = shuffle(known.filter((a) => y[a]), rand), negI = shuffle(known.filter((a) => !y[a]), rand);
      for (let f = 0; f < folds; f++) {
        const te = [...posI.filter((_, k) => k % folds === f), ...negI.filter((_, k) => k % folds === f)];
        const tr = known.filter((a) => !te.includes(a));
        res.q.push(tuned(Kq, tr, te, y, y, rand));
        res.c.push(tuned(Kc, tr, te, y, y, rand));
        res.l.push(tuned([Lin], tr, te, y, y, rand));
        onProgress(0.7 + 0.28 * ((r * folds + f + 1) / (folds * repeats)), "Testing your real outcome");
        await tick();
      }
    }
    const st = (v: number[]) => { const m = mean(v); return { mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(v.length - 1, 1)) }; };
    real = { n: known.length, positives: pos, quantum: st(res.q), classical: st(res.c), linear: st(res.l), diff: mean(res.q) - Math.max(mean(res.c), mean(res.l)) };
  }

  // verdict
  const demoGain = demo.length ? demo[0].quantum - demo[0].classical : 0;
  let verdict: ReadinessReport["verdict"];
  if (headroom === "low") verdict = { recommend: "classical", title: "Classical models are the right choice for this data", text: `The quantum headroom is low (g = ${gBest.toFixed(2)}): a classical kernel can reproduce what the quantum kernel computes on these features, so quantum hardware would add cost without benefit.` };
  else if (!real) verdict = { recommend: "explore", title: `There is ${headroom} room for a quantum advantage`, text: `With g = ${gBest.toFixed(2)}, patterns exist in this feature space that the quantum kernel learns far faster than classical models (demonstration: ${demoGain >= 0 ? "+" : ""}${demoGain.toFixed(2)} AUC with ${demo[0]?.size ?? "few"} training rows). Whether your outcome uses that room can only be answered with outcome labels: add an outcome column and run again.` };
  else if (real.diff > 0.02) verdict = { recommend: "quantum", title: "The quantum kernel leads on your outcome: confirm it properly", text: `Headroom is ${headroom} (g = ${gBest.toFixed(2)}) and the quantum kernel scored ${real.diff.toFixed(3)} AUC above the best classical model in this quick check. Before claiming an advantage, run a pre-registered analysis with corrected significance tests in the SANKET engine.` };
  else if (real.diff > -0.02) verdict = { recommend: "classical", title: "Quantum matches classical on your outcome: choose classical", text: `Your data has ${headroom} quantum headroom (g = ${gBest.toFixed(2)}), but your outcome does not use it: quantum and the best classical model are within 0.02 AUC. Classical models give the same result at a fraction of the cost.` };
  else verdict = { recommend: "classical", title: "Classical models do better on your outcome", text: `Despite ${headroom} headroom (g = ${gBest.toFixed(2)}), the best classical model beat the quantum kernel by ${(-real.diff).toFixed(3)} AUC. The signal in your outcome is better captured classically.` };
  onProgress(1, "Done");
  return { name: inp.name, n, nFeatures: features.length, qubits: q, usedPCA, explained, edges, qubitLabels, scan, gBest, headroom, demo, real, verdict, circuits: { projected: n, fidelity: (n * (n - 1)) / 2 } };
}