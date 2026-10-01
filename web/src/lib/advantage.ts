/**
 * Engineered quantum-advantage benchmark (Huang et al., Nat. Commun. 2021), computed live in the browser.
 * Mirrors engine/advantage.py on a subset of patients. Engineered labels are synthetic by construction.
 */
import { Model, sqDist3 } from "./analysis";
import { blochVectors, DEFAULT_SPEC, SCALE_GRID, simulate } from "./quantum";
import { eigSym, Mat, matmul, spectralMap, zeros } from "./linalg";
import { mulberry32 } from "./rng";

export const ADV_SCALE = 1.0;
const RBF_MULTS = [0.25, 0.5, 1, 2, 4];
const ALPHAS = [1e-3, 1e-2, 1e-1, 1];

export function auc(score: number[], y: number[]) {
  const idx = score.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]);
  let rank = 0, sumPos = 0, nPos = 0;
  for (let k = 0; k < idx.length; ) {
    let j = k;
    while (j < idx.length && idx[j][0] === idx[k][0]) j++;
    const avg = (k + j + 1) / 2;
    for (let m = k; m < j; m++) if (y[idx[m][1]]) { sumPos += avg; nPos++; }
    rank = j; k = j;
  }
  const nNeg = rank - nPos;
  return nPos && nNeg ? (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : 0.5;
}

/** Solve (A) x = b for symmetric positive-definite A (Cholesky). */
function solveSPD(A: Mat, b: number[]) {
  const n = A.length, L = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
  }
  const z = new Array(n).fill(0), x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

function krr(K: Mat, tr: number[], te: number[], target: number[], alpha: number) {
  const mu = tr.reduce((s, i) => s + target[i], 0) / tr.length;
  const A = tr.map((i, a) => tr.map((j, b) => K[i][j] + (a === b ? alpha : 0)));
  const coef = solveSPD(A, tr.map((i) => target[i] - mu));
  return te.map((i) => tr.reduce((s, j, b) => s + K[i][j] * coef[b], 0));
}

function shuffle<T>(a: T[], rand: () => number) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function tuned(Ks: Mat[], tr: number[], te: number[], y: number[], target: number[], rand: () => number) {
  const folds = 3, order = shuffle(tr, rand);
  let best: [Mat, number] = [Ks[0], ALPHAS[0]], bestA = -1;
  for (const K of Ks) for (const a of ALPHAS) {
    let s = 0, c = 0;
    for (let f = 0; f < folds; f++) {
      const ite = order.filter((_, k) => k % folds === f), itr = order.filter((_, k) => k % folds !== f);
      if (new Set(ite.map((i) => y[i])).size < 2) continue;
      s += auc(krr(K, itr, ite, target, a), ite.map((i) => y[i])); c++;
    }
    if (c && s / c > bestA) { bestA = s / c; best = [K, a]; }
  }
  return auc(krr(best[0], tr, te, target, best[1]), te.map((i) => y[i]));
}

export interface AdvCurveRow { size: number; quantum: { mean: number; sd: number }; classical: { mean: number; sd: number } }
export interface AdvResult {
  n: number;
  g: number;
  scan: { mult: number; g: number }[];
  engineered: AdvCurveRow[];
  real: AdvCurveRow[];
  realN: number;
}

function normalise(K: Mat) { const n = K.length, tr = K.reduce((s, r, i) => s + r[i], 0); return K.map((r) => r.map((x) => (x * n) / tr)); }

export async function runAdvantage(m: Model, maxN: number, onProgress: (p: number, msg: string) => void): Promise<AdvResult> {
  const rand0 = mulberry32(42);
  const all = m.cohort.patients.map((_, i) => i);
  const pick = all.length > maxN ? shuffle(all, rand0).slice(0, maxN).sort((a, b) => a - b) : all;
  const n = pick.length;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  onProgress(0.02, "Simulating patients at a wide bandwidth");
  await tick();
  const bloch = pick.map((i) => blochVectors(simulate(m.angles[i], m.cohort.edges, { ...DEFAULT_SPEC, scale: ADV_SCALE })));
  const med = (D: number[][]) => { const v: number[] = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) v.push(D[i][j]); v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 1; };
  const DB = bloch.map((a) => bloch.map((b) => sqDist3(a, b)));
  const mb = med(DB);
  const Kq = DB.map((r) => r.map((d) => Math.exp(-d / mb)));
  // for the real outcome the quantum kernel gets its full bandwidth grid, matching the classical kernel's tuning budget
  const KqGrid = SCALE_GRID.map((sc) => {
    if (sc === ADV_SCALE) return Kq;
    const b = pick.map((i) => blochVectors(simulate(m.angles[i], m.cohort.edges, { ...DEFAULT_SPEC, scale: sc })));
    const D = b.map((x) => b.map((y) => sqDist3(x, y))), md = med(D);
    return D.map((r) => r.map((d) => Math.exp(-d / md)));
  });
  const A = pick.map((i) => m.angles[i]);
  const DA = A.map((a) => A.map((b) => a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0)));
  const ma = med(DA);
  const Kcs = RBF_MULTS.map((mult) => DA.map((r) => r.map((d) => Math.exp((-mult * d) / ma))));

  onProgress(0.08, "Constructing quantum-structured labels");
  await tick();
  const sqQ = spectralMap(eigSym(normalise(Kq)), (x) => Math.sqrt(Math.max(x, 0)));
  const lam = 0.01;
  const scan: { mult: number; g: number; v: number[] }[] = [];
  for (let c = 0; c < Kcs.length; c++) {
    const C = normalise(Kcs[c]).map((r, i) => r.map((x, j) => (i === j ? x + lam : x)));
    const inv = spectralMap(eigSym(C), (x) => 1 / x);
    const M = matmul(matmul(sqQ, inv), sqQ);
    const e = eigSym(M.map((r, i) => r.map((x, j) => (x + M[j][i]) / 2)));
    let top = 0; e.values.forEach((v, k) => { if (v > e.values[top]) top = k; });
    scan.push({ mult: RBF_MULTS[c], g: Math.sqrt(Math.max(e.values[top], 0)), v: e.vectors.map((row) => row[top]) });
    onProgress(0.08 + 0.12 * ((c + 1) / Kcs.length), "Scanning classical kernels");
    await tick();
  }
  const worst = scan.reduce((a, b) => (b.g < a.g ? b : a));
  const yc = sqQ.map((row) => row.reduce((s, x, k) => s + x * worst.v[k], 0));
  const mu = yc.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(yc.reduce((a, b) => a + (b - mu) ** 2, 0) / n) || 1;
  const target = yc.map((v) => (v - mu) / sd);
  const medY = [...target].sort((a, b) => a - b)[Math.floor(n / 2)];
  const yEng = target.map((v) => (v > medY ? 1 : 0));

  // real outcome: event before the horizon vs event-free beyond it
  const H = m.cohort.horizon;
  const known = pick.map((i, a) => ((m.events[i] && m.times[i] <= H) || m.times[i] > H ? a : -1)).filter((a) => a >= 0);
  const yReal = pick.map((i) => (m.events[i] && m.times[i] <= H ? 1 : 0));

  const curve = async (idxPool: number[], y: number[], tgt: number[], label: string, p0: number, p1: number, qKernels: Mat[]) => {
    const sizes = [10, 20, 40, 80].filter((s) => s <= Math.floor(idxPool.length * 0.7));
    const reps = 12, rows: AdvCurveRow[] = [];
    const res: Record<number, { q: number[]; c: number[] }> = {};
    sizes.forEach((s) => (res[s] = { q: [], c: [] }));
    for (let r = 0; r < reps; r++) {
      const rand = mulberry32(1000 + r);
      const order = shuffle(idxPool, rand), nTest = Math.max(15, Math.floor(idxPool.length * 0.3));
      const te = order.slice(0, nTest), pool = order.slice(nTest);
      for (const s of sizes) {
        const tr = pool.slice(0, s);
        const pos = tr.filter((i) => y[i]).length;
        if (pos < 3 || s - pos < 3 || new Set(te.map((i) => y[i])).size < 2) continue;
        res[s].q.push(tuned(qKernels, tr, te, y, tgt, rand));
        res[s].c.push(tuned(Kcs, tr, te, y, tgt, rand));
      }
      onProgress(p0 + (p1 - p0) * ((r + 1) / reps), label);
      await tick();
    }
    const st = (v: number[]) => { const mu = v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1); return { mean: mu, sd: Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(v.length - 1, 1)) }; };
    sizes.forEach((s) => { if (res[s].q.length) rows.push({ size: s, quantum: st(res[s].q), classical: st(res[s].c) }); });
    return rows;
  };
  const engineered = await curve(pick.map((_, a) => a), yEng, target, "Learning engineered labels", 0.2, 0.62, [Kq]);
  const real = await curve(known, yReal, yReal, "Learning the real outcome", 0.62, 1, KqGrid);
  onProgress(1, "Done");
  return { n, g: worst.g, scan: scan.map(({ mult, g }) => ({ mult, g })), engineered, real, realN: known.length };
}