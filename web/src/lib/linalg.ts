// Dense symmetric linear algebra (cyclic Jacobi). Fine for n <= ~150, which covers our cohorts.
export type Mat = number[][];

export const zeros = (n: number): Mat => Array.from({ length: n }, () => new Array(n).fill(0));
export const identity = (n: number): Mat => zeros(n).map((r, i) => (r[i] = 1, r));

export function eigSym(A: Mat, maxSweeps = 60): { values: number[]; vectors: Mat } {
  const n = A.length;
  const a = A.map((r) => r.slice());
  const v = identity(n);
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

/** Rebuild V diag(f(lambda)) V^T */
export function spectralMap(e: { values: number[]; vectors: Mat }, f: (x: number) => number): Mat {
  const n = e.values.length, out = zeros(n), fv = e.values.map(f);
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += e.vectors[i][k] * fv[k] * e.vectors[j][k];
      out[i][j] = out[j][i] = s;
    }
  return out;
}

/** Nearest positive-semidefinite matrix (clip negative eigenvalues) — repairs noise-damaged kernels. */
export function psdProject(K: Mat) {
  const e = eigSym(K);
  return { K: spectralMap(e, (x) => Math.max(x, 0)), minEigBefore: Math.min(...e.values) };
}

export function matmul(A: Mat, B: Mat): Mat {
  const n = A.length, m = B[0].length, p = B.length, C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let k = 0; k < p; k++) {
    const aik = A[i][k];
    if (aik === 0) continue;
    for (let j = 0; j < m; j++) C[i][j] += aik * B[k][j];
  }
  return C;
}

/**
 * Geometric difference g(K_C || K_Q) from Huang et al., Nat. Commun. 12, 2631 (2021):
 *   g = sqrt( || sqrt(K_Q) (K_C + lambda I)^-1 sqrt(K_Q) ||_inf )
 * Kernels are trace-normalised to N first. Small g => a classical kernel can match the quantum one on this data.
 */
export function geometricDifference(Kc: Mat, Kq: Mat, lambda = 0.01) {
  const n = Kc.length;
  const norm = (K: Mat) => { const tr = K.reduce((s, r, i) => s + r[i], 0); return K.map((r) => r.map((x) => (x * n) / tr)); };
  const C = norm(Kc), Q = norm(Kq);
  const sqQ = spectralMap(eigSym(Q), (x) => Math.sqrt(Math.max(x, 0)));
  const invC = spectralMap(eigSym(C.map((r, i) => r.map((x, j) => (i === j ? x + lambda : x)))), (x) => 1 / x);
  const M = matmul(matmul(sqQ, invC), sqQ);
  const top = Math.max(...eigSym(M).values);
  return Math.sqrt(Math.max(top, 0));
}
