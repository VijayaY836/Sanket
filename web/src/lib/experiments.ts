/** Browser versions of engine/qubits.py and engine/noise.py (leave-one-out, deployed bandwidths). */
import { Model, looCIndex, projKernelFrom } from "./analysis";
import { blochVectors, simulate, Vec3 } from "./quantum";
import { mulberry32, normal } from "./rng";
import { Mat } from "./linalg";

const tick = () => new Promise((r) => setTimeout(r, 0));
const sqd3 = (a: Vec3[], b: Vec3[]) => a.reduce((s, v, k) => s + (v[0] - b[k][0]) ** 2 + (v[1] - b[k][1]) ** 2 + (v[2] - b[k][2]) ** 2, 0);
function medianGamma(B: Vec3[][]) { const v: number[] = []; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) v.push(sqd3(B[i], B[j])); v.sort((a, b) => a - b); return 1 / (v[Math.floor(v.length / 2)] || 1); }

export function priorityOrder(groups: string[]) {
  const by: Record<string, number[]> = {}, seen: string[] = [];
  groups.forEach((g, i) => { if (!by[g]) { by[g] = []; seen.push(g); } by[g].push(i); });
  const out: number[] = [];
  for (let d = 0; out.length < groups.length; d++) for (const g of seen) if (d < by[g].length) out.push(by[g][d]);
  return out;
}

export async function qubitCurve(m: Model, onProgress: (p: number) => void) {
  const order = priorityOrder(m.cohort.pathways.map((p) => p.group));
  const sizes = [2, 4, 6, 8, 10, 12].filter((s) => s <= order.length);
  const rows: { qubits: number; quantum: number; classical: number; couplings: number }[] = [];
  for (const [si, q] of sizes.entries()) {
    const keep = order.slice(0, q), pos = new Map(keep.map((k, i) => [k, i]));
    const edges = m.cohort.edges.filter(([a, b]) => pos.has(a) && pos.has(b)).map(([a, b]) => [pos.get(a)!, pos.get(b)!] as [number, number]);
    const A = m.angles.map((a) => keep.map((k) => a[k]));
    const B = A.map((a) => blochVectors(simulate(a, edges, m.spec)));
    const Kq = projKernelFrom(B, medianGamma(B));
    const D = A.map((x) => A.map((y) => x.reduce((s, v, k) => s + (v - y[k]) ** 2, 0)));
    const flat: number[] = []; D.forEach((r, i) => r.forEach((v, j) => { if (j > i) flat.push(v); })); flat.sort((a, b) => a - b);
    const med = flat[Math.floor(flat.length / 2)] || 1;
    const Kc: Mat = D.map((r) => r.map((d) => Math.exp((-m.chosen.rbf * d) / med)));
    rows.push({ qubits: q, quantum: looCIndex(Kq, m), classical: looCIndex(Kc, m), couplings: edges.length });
    onProgress((si + 1) / sizes.length);
    await tick();
  }
  return rows;
}

export const NOISE_ENCODINGS: { scale: number; reps: number }[] = [{ scale: 0.1, reps: 1 }, { scale: 0.25, reps: 1 }, { scale: 0.25, reps: 2 }, { scale: 0.55, reps: 2 }, { scale: 1.0, reps: 2 }];
export const NOISE_P2 = [0, 0.005, 0.01, 0.02, 0.03];

export async function noiseCurve(m: Model, shots: number, onProgress: (p: number) => void) {
  const deg = m.cohort.pathways.map((_, k) => m.cohort.edges.filter(([a, b]) => a === k || b === k).length);
  const out: { scale: number; reps: number; pts: { p2: number; score: number }[]; exact: number }[] = [];
  let done = 0;
  for (const enc of NOISE_ENCODINGS) {
    const B = m.angles.map((a) => blochVectors(simulate(a, m.cohort.edges, { ...m.spec, scale: enc.scale, reps: enc.reps })));
    const exact = looCIndex(projKernelFrom(B, medianGamma(B)), m);
    const pts: { p2: number; score: number }[] = [];
    for (const p2 of NOISE_P2) {
      const rand = mulberry32(1000 + Math.round(p2 * 1e4) + shots);
      const f = deg.map((d) => Math.pow(1 - p2 / 10, 1 + 2 * enc.reps) * Math.pow(1 - p2, 2 * enc.reps * d));
      const Bn = B.map((b) => b.map((v, k) => v.map((c) => {
        const p = Math.min(Math.max((1 + c * f[k]) / 2, 0), 1);
        const ones = shots * p + normal(rand) * Math.sqrt(shots * p * (1 - p));
        return Math.max(-1, Math.min(1, (2 * ones) / shots - 1));
      }) as Vec3));
      pts.push({ p2, score: looCIndex(projKernelFrom(Bn, medianGamma(Bn)), m) });
      onProgress(++done / (NOISE_ENCODINGS.length * NOISE_P2.length));
      await tick();
    }
    out.push({ ...enc, pts, exact });
  }
  return out;
}