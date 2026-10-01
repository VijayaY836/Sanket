/**
 * Exact statevector simulator for the SANKET feature map.
 * Gate conventions match Qiskit exactly (little-endian: bit k of the index = qubit k),
 * so Bloch vectors computed here equal Qiskit's Statevector results. See engine/crosscheck.py.
 *
 * Circuit:  x_k = scale · angleOf(z_k).  H on every qubit, then `reps` Trotter layers of
 *           RZ(2·x_k) on each qubit, RZZ(2·x_i·x_j) on every pathway-crosstalk edge, RX(2·beta) on each qubit.
 */
export type Vec3 = [number, number, number];

export interface FeatureMapSpec {
  reps: number;
  beta: number;
  /** Kernel bandwidth: angles are multiplied by this before encoding (chosen by cross-validation). */
  scale: number;
}
export const DEFAULT_SPEC: FeatureMapSpec = { reps: 2, beta: 0.5, scale: 0.4 };
export const SCALE_GRID = [0.25, 0.4, 0.55, 0.7, 1.0];

/** Pathway z-score -> rotation angle in (-pi/2, pi/2). Same mapping as engine/featuremap.py */
export const angleOf = (z: number) => (Math.PI / 2) * Math.tanh(z / 2);

export interface State {
  n: number;
  re: Float64Array;
  im: Float64Array;
}

function applyH(s: State, k: number) {
  const bit = 1 << k, r = Math.SQRT1_2;
  for (let i = 0; i < s.re.length; i++) {
    if (i & bit) continue;
    const j = i | bit;
    const ar = s.re[i], ai = s.im[i], br = s.re[j], bi = s.im[j];
    s.re[i] = r * (ar + br); s.im[i] = r * (ai + bi);
    s.re[j] = r * (ar - br); s.im[j] = r * (ai - bi);
  }
}
function applyRZ(s: State, k: number, theta: number) {
  const bit = 1 << k, c = Math.cos(theta / 2), sn = Math.sin(theta / 2);
  for (let i = 0; i < s.re.length; i++) {
    const sign = i & bit ? 1 : -1; // |0> gets e^{-i t/2}, |1> gets e^{+i t/2}
    const ar = s.re[i], ai = s.im[i], ps = sign * sn;
    s.re[i] = ar * c - ai * ps; s.im[i] = ar * ps + ai * c;
  }
}
function applyRZZ(s: State, a: number, b: number, theta: number) {
  const ba = 1 << a, bb = 1 << b, c = Math.cos(theta / 2), sn = Math.sin(theta / 2);
  for (let i = 0; i < s.re.length; i++) {
    const odd = (i & ba ? 1 : 0) ^ (i & bb ? 1 : 0);
    const ps = odd ? sn : -sn; // even parity e^{-i t/2}, odd parity e^{+i t/2}
    const ar = s.re[i], ai = s.im[i];
    s.re[i] = ar * c - ai * ps; s.im[i] = ar * ps + ai * c;
  }
}
function applyRX(s: State, k: number, theta: number) {
  const bit = 1 << k, c = Math.cos(theta / 2), sn = Math.sin(theta / 2);
  for (let i = 0; i < s.re.length; i++) {
    if (i & bit) continue;
    const j = i | bit;
    const ar = s.re[i], ai = s.im[i], br = s.re[j], bi = s.im[j];
    // [c, -i s; -i s, c]
    s.re[i] = c * ar + sn * bi; s.im[i] = c * ai - sn * br;
    s.re[j] = sn * ai + c * br; s.im[j] = -sn * ar + c * bi;
  }
}

/** `angles` are unscaled angleOf(z) values; spec.scale is applied here. */
export function simulate(rawAngles: number[], edges: [number, number][], spec: FeatureMapSpec = DEFAULT_SPEC): State {
  const angles = rawAngles.map((a) => a * spec.scale);
  const n = angles.length, dim = 1 << n;
  const s: State = { n, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[0] = 1;
  for (let k = 0; k < n; k++) applyH(s, k);
  for (let r = 0; r < spec.reps; r++) {
    for (let k = 0; k < n; k++) applyRZ(s, k, 2 * angles[k]);
    for (const [i, j] of edges) applyRZZ(s, i, j, 2 * angles[i] * angles[j]);
    for (let k = 0; k < n; k++) applyRX(s, k, 2 * spec.beta);
  }
  return s;
}

/** Single-qubit reduced states as Bloch vectors (these are the projected-kernel features). */
export function blochVectors(s: State): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k < s.n; k++) {
    const bit = 1 << k;
    let r01 = 0, i01 = 0, p0 = 0, p1 = 0;
    for (let i = 0; i < s.re.length; i++) {
      if (i & bit) { p1 += s.re[i] ** 2 + s.im[i] ** 2; continue; }
      const j = i | bit;
      p0 += s.re[i] ** 2 + s.im[i] ** 2;
      // a_i * conj(a_j)
      r01 += s.re[i] * s.re[j] + s.im[i] * s.im[j];
      i01 += s.im[i] * s.re[j] - s.re[i] * s.im[j];
    }
    out.push([2 * r01, -2 * i01, p0 - p1]);
  }
  return out;
}

export function overlap2(a: State, b: State) {
  let r = 0, i = 0;
  for (let k = 0; k < a.re.length; k++) {
    r += a.re[k] * b.re[k] + a.im[k] * b.im[k];
    i += a.re[k] * b.im[k] - a.im[k] * b.re[k];
  }
  return r * r + i * i;
}

/** Gate inventory of the logical (untranspiled) circuit, for the circuit view. */
export function gateCounts(n: number, nEdges: number, spec: FeatureMapSpec = DEFAULT_SPEC) {
  return { h: n, rz: n * spec.reps, rzz: nEdges * spec.reps, rx: n * spec.reps };
}

/** Pack crosstalk edges into layers where no qubit is used twice (how the RZZ gates are drawn and scheduled). */
export function packEdges(edges: [number, number][]) {
  const layers: [number, number][][] = [];
  for (const e of edges) {
    let placed = false;
    for (const L of layers) if (!L.some(([a, b]) => a === e[0] || b === e[0] || a === e[1] || b === e[1])) { L.push(e); placed = true; break; }
    if (!placed) layers.push([e]);
  }
  return layers;
}

export interface Layer { kind: "h" | "rz" | "rzz" | "rx"; rep: number; edges?: [number, number][]; bloch: Vec3[] }

/** Bloch vectors after every circuit column, for the step-through circuit view. */
export function layerTrace(rawAngles: number[], edges: [number, number][], spec: FeatureMapSpec = DEFAULT_SPEC): Layer[] {
  const angles = rawAngles.map((a) => a * spec.scale);
  const n = angles.length, dim = 1 << n;
  const s: State = { n, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[0] = 1;
  const out: Layer[] = [{ kind: "h", rep: -1, bloch: blochVectors(s) }];
  for (let k = 0; k < n; k++) applyH(s, k);
  out.push({ kind: "h", rep: 0, bloch: blochVectors(s) });
  const packed = packEdges(edges);
  for (let r = 0; r < spec.reps; r++) {
    for (let k = 0; k < n; k++) applyRZ(s, k, 2 * angles[k]);
    out.push({ kind: "rz", rep: r, bloch: blochVectors(s) });
    for (const L of packed) {
      for (const [i, j] of L) applyRZZ(s, i, j, 2 * angles[i] * angles[j]);
      out.push({ kind: "rzz", rep: r, edges: L, bloch: blochVectors(s) });
    }
    for (let k = 0; k < n; k++) applyRX(s, k, 2 * spec.beta);
    out.push({ kind: "rx", rep: r, bloch: blochVectors(s) });
  }
  return out;
}
