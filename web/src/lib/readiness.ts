/**
 * Quantum Readiness Check: should anyone spend quantum compute on this dataset?
 *
 * Takes any table (CSV), encodes its features on up to 12 qubits with the SANKET feature map, and answers four
 * questions, each with the same tuning budget for quantum and classical models:
 *   1. Headroom   - geometric difference g (Huang et al. 2021): could a quantum kernel express anything the closest
 *                   classical kernel cannot, on these inputs?
 *   2. Capacity   - engineered labels with quantum structure: does the circuit actually learn that structure faster?
 *   3. Real test  - repeated stratified cross-validation on the user's own outcome: quantum vs classical RBF vs linear.
 *   4. Cost       - qubits, two-qubit gates and circuits the projected kernel would need on IBM hardware.
 * The browser analyses up to MAX_ROWS rows; engine/readiness.py is a line-for-line port that runs the same check on
 * every row (and reproduces this file's numbers exactly when given --max-rows 150).
 */
import { blochVectors, DEFAULT_SPEC, SCALE_GRID, simulate, angleOf, Vec3 } from "./quantum";
import { eigSym, Mat } from "./linalg";
import { AdvCurveRow, ADV_SCALE, engineerLabels, learningCurve, RBF_MULTS, shuffle, tuned, tunedFit } from "./advantage";
import { mulberry32 } from "./rng";

export const MAX_ROWS = 150;
export const MAX_QUBITS = 12;
export const MIN_VARIANCE = 0.7;
const MISSING = new Set(["", "na", "n/a", "nan", "null", "none", "?", "-", "."]);
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ---------------- CSV ---------------- */
export interface Table { headers: string[]; rows: string[][] }

/** RFC 4180-style parser (quoted fields, escaped quotes, CRLF); delimiter sniffed from the header line. */
export function parseCSV(text: string): Table {
  text = text.replace(/^﻿/, "");
  const nl = text.search(/\r?\n/), first = nl < 0 ? text : text.slice(0, nl);
  const delim = [",", ";", "\t", "|"].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ",");
  const out: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) out.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) out.push(row);
  if (out.length < 2) throw new Error("The file needs a header row and at least one data row.");
  const headers = out[0].map((h, i) => h.trim() || `column_${i + 1}`);
  const rows = out.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { headers, rows };
}

/* ---------------- column profiling ---------------- */
export interface Column {
  index: number;
  name: string;
  numeric: boolean;      // at least 90% of non-missing values parse as numbers
  values: number[];      // NaN where missing or non-numeric
  missing: number;
  levels: string[];      // distinct non-missing values (first 20)
  distinct: number;
  role: "feature" | "id" | "label" | "time" | "event" | "text";
}

const isMissing = (s: string) => MISSING.has(s.trim().toLowerCase());
const num = (s: string) => { const v = Number(s.replace(/,(?=\d{3}\b)/g, "")); return isMissing(s) || !Number.isFinite(v) ? NaN : v; };

export function profile(t: Table): Column[] {
  const n = t.rows.length;
  return t.headers.map((name, index) => {
    const raw = t.rows.map((r) => r[index]);
    const present = raw.filter((s) => !isMissing(s));
    const values = raw.map(num);
    const nNum = values.filter((v) => Number.isFinite(v)).length;
    const distinctSet = new Set(present);
    const numeric = present.length > 0 && nNum >= 0.9 * present.length;
    const lname = name.toLowerCase();
    let role: Column["role"] = numeric ? "feature" : "text";
    if (distinctSet.size === 2) role = "label";
    if (!numeric && distinctSet.size === present.length && n > 5) role = "id";
    if (/(^|_|\b)(id|sample|patient|subject|gsm|name)(_|\b|$)/.test(lname) && distinctSet.size > 0.9 * present.length) role = "id";
    if (numeric && /(time|month|day|year|follow|surv|duration|os_|dfs|rfs)/.test(lname) && distinctSet.size > 2) role = "time";
    if (distinctSet.size === 2 && /(event|status|dead|death|relapse|progress|censor|recur)/.test(lname)) role = "event";
    return { index, name, numeric, values, missing: n - present.length, levels: [...distinctSet].slice(0, 20), distinct: distinctSet.size, role };
  });
}

/* ---------------- setup ---------------- */
export type OutcomeKind = "binary" | "survival";
export interface Setup {
  kind: OutcomeKind;
  label: number;         // binary: label column
  positive: string;      // binary: which level counts as 1
  time: number;          // survival: time column
  event: number;         // survival: event column (two levels)
  eventLevel: string;    // survival: level meaning "event happened"
  horizon: number;       // survival: outcome = event by this time
  features: number[];    // numeric feature columns
  qubits: number;        // 0 = automatic encoding search
}

const POSITIVE_HINTS = /^(1|yes|y|true|t|pos|positive|case|disease|tumou?r|cancer|malignant|m|aml|dead|deceased|event|relapse|progressed|high)$/i;
export function positiveLevel(levels: string[]) {
  return levels.find((l) => POSITIVE_HINTS.test(l.trim())) ?? [...levels].sort()[1] ?? levels[0];
}

export function guessSetup(cols: Column[]): Setup {
  const time = cols.find((c) => c.role === "time");
  const event = cols.find((c) => c.role === "event") ?? cols.find((c) => c.role === "label");
  const label = [...cols].reverse().find((c) => c.role === "label" || c.role === "event");
  const kind: OutcomeKind = time && event ? "survival" : "binary";
  const used = new Set(kind === "survival" ? [time!.index, event!.index] : label ? [label.index] : []);
  const features = cols.filter((c) => c.numeric && c.role !== "id" && c.role !== "time" && !used.has(c.index) && c.distinct > 1).map((c) => c.index);
  const times = time ? time.values.filter(Number.isFinite).sort((a, b) => a - b) : [];
  return {
    kind,
    label: label?.index ?? -1,
    positive: label ? positiveLevel(label.levels) : "",
    time: time?.index ?? -1,
    event: event?.index ?? -1,
    eventLevel: event ? positiveLevel(event.levels) : "",
    horizon: times.length ? niceRound(times[Math.floor(times.length / 2)]) : 0,
    features,
    qubits: 0,
  };
}
const niceRound = (v: number) => (v >= 20 ? Math.round(v / 6) * 6 || Math.round(v) : Math.round(v * 10) / 10);

/* ---------------- preparation: rows -> qubit inputs ---------------- */
export interface Prepared {
  rowsTotal: number;     // rows in the file
  rowsLabelled: number;  // rows with a usable outcome
  rowsUsed: number;      // after the browser cap
  y: number[];
  positives: number;
  qubitNames: string[];
  qubitDetail: string[]; // what each qubit carries
  Z: number[][];         // standardised inputs, one row per patient, one column per qubit
  Xall: number[][];      // every selected feature, standardised (for the uncompressed reference model)
  edges: [number, number][];
  method: "direct" | "pca";
  explained: number;     // PCA: fraction of feature variance kept
  features: string[];
  outcome: string;
}

export function prepare(t: Table, cols: Column[], s: Setup, maxRows = MAX_ROWS): Prepared {
  if (s.features.length < 2) throw new Error("Pick at least two numeric feature columns.");
  // outcome
  const y: number[] = [];
  let outcome = "";
  if (s.kind === "binary") {
    const c = cols[s.label];
    if (!c) throw new Error(cols.some((x) => x.distinct === 2)
      ? "Pick an outcome column."
      : "No column has exactly two values, so there is no yes/no outcome to predict. If your outcome is a time to an event, choose Time to event.");
    if (c.distinct !== 2) throw new Error(`"${c.name}" has ${c.distinct} distinct values; a yes/no outcome needs exactly two.`);
    t.rows.forEach((r) => { const v = r[s.label]; y.push(isMissing(v) ? NaN : v.trim() === s.positive.trim() ? 1 : 0); });
    outcome = `${c.name} = ${s.positive}`;
  } else {
    const tc = cols[s.time], ec = cols[s.event];
    if (!tc || !ec) throw new Error("Pick a time column and an event column.");
    if (!(s.horizon > 0)) throw new Error("Set a time horizon above zero.");
    t.rows.forEach((r, i) => {
      const time = tc.values[i], ev = r[s.event];
      if (!Number.isFinite(time) || isMissing(ev)) { y.push(NaN); return; }
      const happened = ev.trim() === s.eventLevel.trim();
      y.push(happened && time <= s.horizon ? 1 : time > s.horizon ? 0 : NaN); // censored before the horizon: unknown
    });
    outcome = `${ec.name} by ${tc.name} ≤ ${s.horizon}`;
  }
  let keep = y.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
  const rowsLabelled = keep.length;
  if (keep.length > maxRows) { // stratified, seeded subsample so every run on the same file is identical
    const rand = mulberry32(2026);
    const pos = shuffle(keep.filter((i) => y[i] === 1), rand), neg = shuffle(keep.filter((i) => y[i] === 0), rand);
    const nPos = Math.max(1, Math.round((maxRows * pos.length) / keep.length));
    keep = [...pos.slice(0, nPos), ...neg.slice(0, maxRows - nPos)].sort((a, b) => a - b);
  }
  // features: median impute, standardise, drop constants
  let X = keep.map((i) => s.features.map((f) => cols[f].values[i]));
  let names = s.features.map((f) => cols[f].name);
  const colStats = names.map((_, j) => {
    const v = X.map((r) => r[j]).filter(Number.isFinite).sort((a, b) => a - b);
    const med = v.length ? v[Math.floor(v.length / 2)] : 0;
    const filled = X.map((r) => (Number.isFinite(r[j]) ? r[j] : med));
    const mu = filled.reduce((a, b) => a + b, 0) / filled.length;
    const sd = Math.sqrt(filled.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, filled.length - 1));
    return { med, mu, sd, ok: v.length >= 0.5 * X.length && sd > 1e-12 };
  });
  const okIdx = colStats.map((c, j) => (c.ok ? j : -1)).filter((j) => j >= 0);
  if (okIdx.length < 2) throw new Error("Fewer than two feature columns vary across rows (or most of their values are missing).");
  X = X.map((r) => okIdx.map((j) => ((Number.isFinite(r[j]) ? r[j] : colStats[j].med) - colStats[j].mu) / colStats[j].sd));
  names = okIdx.map((j) => names[j]);

  const q = Math.min(s.qubits || MAX_QUBITS, MAX_QUBITS, X.length - 1);
  let Z: number[][], qubitNames: string[], qubitDetail: string[], edges: [number, number][], method: Prepared["method"], explained = 1;
  if (names.length <= q) {
    // one feature per qubit; couple the most correlated pairs (max degree 3), like pathway crosstalk
    method = "direct"; Z = X; qubitNames = names.map(short); qubitDetail = names.slice();
    edges = correlationEdges(X);
  } else {
    // more features than qubits: label-free PCA via the n x n Gram matrix (works for thousands of columns)
    method = "pca";
    const n = X.length, G = X.map((a) => X.map((b) => a.reduce((acc, v, k) => acc + v * b[k], 0)));
    const e = eigSym(G);
    const order = e.values.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, q).map(([, k]) => k);
    const total = e.values.reduce((a, v) => a + Math.max(v, 0), 0) || 1;
    explained = order.reduce((a, k) => a + Math.max(e.values[k], 0), 0) / total;
    Z = Array.from({ length: n }, (_, i) => order.map((k) => e.vectors[i][k]));
    // standardise component scores (sign fixed so the largest loading is positive, for stable labels)
    const loads = order.map((_, c) => names.map((_, f) => X.reduce((acc, row, i) => acc + row[f] * Z[i][c], 0)));
    order.forEach((_, c) => {
      const big = loads[c].reduce((b, v, f) => (Math.abs(v) > Math.abs(loads[c][b]) ? f : b), 0);
      const sign = loads[c][big] < 0 ? -1 : 1;
      const col = Z.map((r) => r[c] * sign), mu = col.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(col.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, n - 1)) || 1;
      Z.forEach((r, i) => (r[c] = (col[i] - mu) / sd));
      loads[c] = loads[c].map((v) => v * sign);
    });
    qubitNames = order.map((_, c) => `PC${c + 1}`);
    qubitDetail = loads.map((l) => {
      const top = l.map((v, f) => [Math.abs(v), f, v]).sort((a, b) => b[0] - a[0]).slice(0, 3);
      return top.map(([, f, v]) => `${v >= 0 ? "+" : "−"}${names[f]}`).join(", ");
    });
    // principal components are uncorrelated, so qubits are coupled in a line: the cheapest layout on IBM heavy-hex chips
    edges = Array.from({ length: q - 1 }, (_, k) => [k, k + 1] as [number, number]);
  }
  const yy = keep.map((i) => y[i]);
  return { rowsTotal: t.rows.length, rowsLabelled, rowsUsed: keep.length, y: yy, positives: yy.filter((v) => v === 1).length, qubitNames, qubitDetail, Z, Xall: X, edges, method, explained, features: names, outcome };
}

const short = (s: string) => (s.length > 10 ? s.slice(0, 9) + "…" : s);

function correlationEdges(X: number[][]): [number, number][] {
  const n = X.length, d = X[0].length, pairs: [number, number, number][] = [];
  for (let a = 0; a < d; a++) for (let b = a + 1; b < d; b++) {
    const r = X.reduce((s, row) => s + row[a] * row[b], 0) / Math.max(1, n - 1);
    pairs.push([Math.abs(r), a, b]);
  }
  pairs.sort((p, q) => q[0] - p[0]);
  const deg = new Array(d).fill(0), out: [number, number][] = [];
  for (const [r, a, b] of pairs) {
    if (r < 0.2 || out.length >= d) break;
    if (deg[a] < 3 && deg[b] < 3) { out.push([a, b]); deg[a]++; deg[b]++; }
  }
  return out;
}

/* ---------------- analysis ---------------- */
export interface ModelScore { key: "quantum" | "rbf" | "linear" | "linearAll"; label: string; auc: number; sd: number; folds: number[] }
export interface ReadinessResult {
  n: number;
  g: number;
  gMax: number;                                   // sqrt(N): the largest g possible
  engineered: AdvCurveRow[];
  real: ModelScore[];
  bestClassical: ModelScore;                      // best information-matched classical model
  reference: ModelScore | null;                   // linear model on every feature, when the encoding compresses them
  diff: { mean: number; lo: number; hi: number }; // quantum minus best classical, corrected resampled t interval
  quantumScale: number[];                         // bandwidths picked by inner CV per outer fold
  cost: { qubits: number; rzz: number; twoQubit: number; twoQubitFullZZ: number; circuits: number; circuitsFidelity: number; shots: number };
  seconds: number;
}

const T975 = [12.71, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const tCrit = (df: number) => T975[Math.min(df, T975.length) - 1] ?? 1.96;

const medOff = (D: Mat) => { const v: number[] = []; for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) v.push(D[i][j]); v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 1; };
const sq3 = (a: Vec3[], b: Vec3[]) => a.reduce((s, v, k) => s + (v[0] - b[k][0]) ** 2 + (v[1] - b[k][1]) ** 2 + (v[2] - b[k][2]) ** 2, 0);

/** Quantum kernels over the bandwidth grid, and classical RBF kernels on the same inputs (information-matched). */
async function kernels(p: Prepared, scales: number[], onScale: (k: number) => Promise<void> = async () => {}) {
  const A = p.Z.map((r) => r.map(angleOf));
  const Kq: Mat[] = [];
  for (const [k, scale] of scales.entries()) {
    await onScale(k);
    const B = A.map((a) => blochVectors(simulate(a, p.edges, { ...DEFAULT_SPEC, scale })));
    const D = B.map((x) => B.map((y) => sq3(x, y))), m = medOff(D);
    Kq.push(D.map((r) => r.map((d) => Math.exp(-d / m))));
  }
  const DA = A.map((a) => A.map((b) => a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0))), ma = medOff(DA);
  const Kc = RBF_MULTS.map((mult) => DA.map((r) => r.map((d) => Math.exp((-mult * d) / ma))));
  return { Kq, Kc };
}

export interface EncodingOption { qubits: number; method: Prepared["method"]; explained: number; couplings: number; g: number; chosen: boolean }

/**
 * Encoding search: candidate qubit counts are scored by quantum headroom (geometric difference g), which depends on
 * the features only, never the outcome, so choosing by it cannot leak the answer. Only encodings that keep at least 70%
 * of the feature variance are eligible (fewer qubits always raise g, but can throw the signal away); if none do, the
 * largest qubit count is used. Ties (within 5%) go to fewer qubits.
 */
export async function chooseEncoding(t: Table, cols: Column[], s: Setup, onProgress: (frac: number, msg: string) => void = () => {}, maxRows = MAX_ROWS) {
  if (s.features.length < 2) throw new Error("Pick at least two numeric feature columns.");
  if (s.qubits) return { prep: prepare(t, cols, s, maxRows), options: [] as EncodingOption[] };
  const d = s.features.length, top = Math.min(d, MAX_QUBITS);
  const qs = [...new Set([4, 6, 8, top].filter((q) => q >= 2 && q <= top))].sort((a, b) => a - b);
  const preps: Prepared[] = [], options: EncodingOption[] = [];
  for (const [i, q] of qs.entries()) {
    onProgress(i / qs.length, `Encoding search: ${q} qubits`);
    await tick();
    const p = prepare(t, cols, { ...s, qubits: q }, maxRows);
    const { Kq, Kc } = await kernels(p, [ADV_SCALE]);
    const { g } = await engineerLabels(Kq[0], Kc);
    preps.push(p);
    options.push({ qubits: p.Z[0].length, method: p.method, explained: p.explained, couplings: p.edges.length, g, chosen: false });
  }
  const eligible = options.map((o, i) => (o.explained >= MIN_VARIANCE ? i : -1)).filter((i) => i >= 0);
  let pick = options.length - 1;
  if (eligible.length) {
    const gBest = Math.max(...eligible.map((i) => options[i].g));
    pick = eligible.find((i) => options[i].g >= 0.95 * gBest)!;
  }
  options[pick].chosen = true;
  onProgress(1, "Encoding chosen");
  return { prep: preps[pick], options };
}

export async function runReadiness(p: Prepared, onProgress: (frac: number, msg: string) => void): Promise<ReadinessResult> {
  const t0 = performance.now();
  const n = p.Z.length, q = p.Z[0].length;
  const { Kq, Kc } = await kernels(p, SCALE_GRID, async (k) => {
    onProgress(0.02 + 0.18 * (k / SCALE_GRID.length), `Simulating ${n} rows on ${q} qubits (bandwidth ${SCALE_GRID[k]})`); await tick();
  });
  const Klin = [p.Z.map((a) => p.Z.map((b) => a.reduce((s, v, k) => s + v * b[k], 0) / q))];
  const dAll = p.Xall[0].length, compressed = p.method === "pca";
  const KlinAll = compressed ? [p.Xall.map((a) => p.Xall.map((b) => a.reduce((s, v, k) => s + v * b[k], 0) / dAll))] : [];

  // 1. headroom and 2. capacity, at the expressive bandwidth used by the engineered-advantage benchmark
  onProgress(0.22, "Measuring quantum headroom (geometric difference)");
  await tick();
  const KqWide = Kq[SCALE_GRID.indexOf(ADV_SCALE)];
  const eng = await engineerLabels(KqWide, Kc, async (c) => { onProgress(0.22 + 0.1 * ((c + 1) / Kc.length), "Measuring quantum headroom (geometric difference)"); await tick(); });
  const engineered = await learningCurve(p.y.map((_, i) => i), eng.yEng, eng.target, [KqWide], Kc, async (r, reps) => {
    onProgress(0.32 + 0.28 * ((r + 1) / reps), "Teaching both kernels labels with quantum structure"); await tick();
  });

  // 3. the real outcome: 4 x stratified 5-fold CV, every model tuned by inner 3-fold CV on the training folds only
  const reps = 4, folds = 5, scores = { quantum: [] as number[], rbf: [] as number[], linear: [] as number[], linearAll: [] as number[] }, picks: number[] = [];
  let nTe = 0, nTr = 0;
  for (let r = 0; r < reps; r++) {
    const rand = mulberry32(500 + r);
    const pos = shuffle(p.y.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), rand);
    const neg = shuffle(p.y.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0), rand);
    const foldOf = new Array(n).fill(0);
    pos.forEach((i, k) => (foldOf[i] = k % folds)); neg.forEach((i, k) => (foldOf[i] = k % folds));
    for (let f = 0; f < folds; f++) {
      const te = foldOf.map((ff, i) => (ff === f ? i : -1)).filter((i) => i >= 0);
      const tr = foldOf.map((ff, i) => (ff !== f ? i : -1)).filter((i) => i >= 0);
      if (new Set(te.map((i) => p.y[i])).size < 2) continue;
      const qf = tunedFit(Kq, tr, te, p.y, p.y, rand);
      scores.quantum.push(qf.auc); picks.push(qf.kernel);
      scores.rbf.push(tuned(Kc, tr, te, p.y, p.y, rand));
      scores.linear.push(tuned(Klin, tr, te, p.y, p.y, rand));
      if (compressed) scores.linearAll.push(tuned(KlinAll, tr, te, p.y, p.y, rand));
      nTe += te.length; nTr += tr.length;
      onProgress(0.6 + 0.38 * ((r * folds + f + 1) / (reps * folds)), "Fair test on your real outcome");
      await tick();
    }
  }
  const mk = (key: ModelScore["key"], label: string): ModelScore => {
    const v = scores[key], mu = v.reduce((a, b) => a + b, 0) / v.length;
    return { key, label, auc: mu, sd: Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, v.length - 1)), folds: v };
  };
  const real = [mk("quantum", "Projected quantum kernel"), mk("rbf", "Classical RBF kernel"), mk("linear", "Linear model")];
  const bestClassical = real[1].auc >= real[2].auc ? real[1] : real[2];
  const d = real[0].folds.map((v, i) => v - bestClassical.folds[i]), J = d.length;
  const dm = d.reduce((a, b) => a + b, 0) / J, s2 = d.reduce((a, b) => a + (b - dm) ** 2, 0) / Math.max(1, J - 1);
  const half = tCrit(J - 1) * Math.sqrt((1 / J + nTe / Math.max(1, nTr)) * s2); // Nadeau & Bengio correction

  // 4. hardware cost of the projected kernel (logical circuit, before routing; RZZ = 2 CZ on IBM Heron)
  const rzz = DEFAULT_SPEC.reps * p.edges.length;
  onProgress(1, "Done");
  return {
    n, g: eng.g, gMax: Math.sqrt(n), engineered, real, bestClassical,
    reference: compressed ? mk("linearAll", `Linear model, all ${dAll} features`) : null,
    diff: { mean: dm, lo: dm - half, hi: dm + half },
    quantumScale: picks.map((i) => SCALE_GRID[i]),
    cost: { qubits: q, rzz, twoQubit: 2 * rzz, twoQubitFullZZ: DEFAULT_SPEC.reps * q * (q - 1), circuits: 3 * n, circuitsFidelity: (n * (n - 1)) / 2, shots: 3 * n * 1024 },
    seconds: (performance.now() - t0) / 1000,
  };
}

/* ---------------- verdict ---------------- */
export type Status = "pass" | "mixed" | "fail";
export interface Check { key: string; title: string; status: Status; headline: string; detail: string }
export interface Verdict { kind: "go" | "promising" | "classical" | "data"; title: string; summary: string; next: string[]; checks: Check[] }

export const MIN_ROWS = 30, MIN_CLASS = 8;

export function judge(p: Prepared, r: ReadinessResult): Verdict {
  const minority = Math.min(p.positives, p.rowsUsed - p.positives);
  const enoughData = p.rowsUsed >= MIN_ROWS && minority >= MIN_CLASS;
  const e0 = r.engineered[0], eLast = r.engineered[r.engineered.length - 1];
  const engGain = e0 ? e0.quantum.mean - e0.classical.mean : 0;
  const headroom: Status = r.g >= 3 ? "pass" : r.g >= 1.5 ? "mixed" : "fail";
  const capacity: Status = engGain >= 0.08 ? "pass" : engGain >= 0.03 ? "mixed" : "fail";
  const q = r.real[0], b = r.bestClassical;
  // parity = interval includes zero AND the point estimate is not clearly behind; otherwise classical is ahead
  const parity = r.diff.lo <= 0 && r.diff.hi >= 0 && r.diff.mean >= -0.02;
  const realStatus: Status = r.diff.lo > 0 ? "pass" : parity ? "mixed" : "fail";
  const twoQ = r.cost.twoQubit;
  const costStatus: Status = twoQ <= 60 ? "pass" : twoQ <= 200 ? "mixed" : "fail";
  const f3 = (v: number) => v.toFixed(3), sgn = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(3);

  const checks: Check[] = [
    { key: "data", title: "Enough data", status: enoughData ? (p.rowsUsed >= 80 && minority >= 20 ? "pass" : "mixed") : "fail",
      headline: `${p.rowsUsed} rows, ${minority} in the smaller class`,
      detail: enoughData ? (p.rowsUsed >= 80 && minority >= 20 ? "Enough to compare models with reasonable precision." : "Enough to run the test, but intervals will be wide.") : `Need at least ${MIN_ROWS} rows and ${MIN_CLASS} in each class for a meaningful comparison.` },
    { key: "headroom", title: "Quantum headroom", status: headroom,
      headline: `g = ${r.g.toFixed(2)} (maximum √N = ${r.gMax.toFixed(1)})`,
      detail: headroom === "fail" ? "A classical kernel reproduces the quantum kernel almost exactly on these inputs, so no quantum advantage is possible here." : headroom === "mixed" ? "Some room: the quantum kernel sees these rows a little differently from every classical kernel tried. Necessary, not sufficient." : "Large room: the quantum kernel's geometry differs clearly from every classical kernel tried. Necessary, not sufficient." },
    { key: "capacity", title: "Circuit can learn quantum structure", status: capacity,
      headline: e0 ? `AUC ${f3(e0.quantum.mean)} vs ${f3(e0.classical.mean)} with ${e0.size} training rows` : "not enough rows",
      detail: capacity === "pass" ? `On labels engineered to have quantum structure (synthetic by construction), the circuit learns from far fewer rows${eLast && eLast !== e0 ? `; at ${eLast.size} rows it is ${f3(eLast.quantum.mean)} vs ${f3(eLast.classical.mean)}` : ""}. If your outcome had that structure, this encoding could find it.` : "Even on labels built to favour it, the circuit barely beats the classical kernel on these inputs. Try a different encoding or more qubits." },
    { key: "real", title: "Better on your real outcome", status: realStatus,
      headline: `${sgn(r.diff.mean)} AUC vs ${b.label.toLowerCase()} (95% interval ${sgn(r.diff.lo)} to ${sgn(r.diff.hi)})`,
      detail: realStatus === "pass" ? `The quantum kernel (${f3(q.auc)}) beats the best classical model (${f3(b.auc)}) on held-out rows, and the interval excludes zero.` : realStatus === "mixed" ? `Quantum ${f3(q.auc)} vs ${b.label.toLowerCase()} ${f3(b.auc)}: level, and the interval includes zero.` : `The ${b.label.toLowerCase()} scores higher (${f3(b.auc)} vs ${f3(q.auc)})${r.diff.hi < 0 ? " and the interval excludes zero" : "; the interval includes zero, but nothing points to quantum helping"}.` },
    { key: "cost", title: "Affordable on hardware", status: costStatus,
      headline: `${r.cost.qubits} qubits, ${twoQ} two-qubit gates, ${r.cost.circuits.toLocaleString()} circuits`,
      detail: `${costStatus === "pass" ? "Shallow enough for today's IBM Heron devices." : costStatus === "mixed" ? "Runnable on Heron, but noise will start to bite; prefer fewer couplings." : "Deep for current hardware; expect noise to dominate."} A standard full ZZ feature map would need ${r.cost.twoQubitFullZZ} two-qubit gates, and a fidelity kernel ${r.cost.circuitsFidelity.toLocaleString()} circuits.` },
  ];

  const linearBest = b.key === "linear";
  const refWins = !!r.reference && r.reference.auc - q.auc >= 0.05 && realStatus !== "pass";
  const lost = r.reference && r.reference.auc - Math.max(q.auc, b.auc) >= 0.05
    ? ` Note: compressing ${p.features.length} features onto ${r.cost.qubits} qubits loses signal; a linear model on all features scores ${f3(r.reference.auc)}.` : "";
  if (!enoughData) return { kind: "data", title: "Not enough data to decide", checks,
    summary: `With ${p.rowsUsed} usable rows and only ${minority} in the smaller class, any difference between quantum and classical models would be noise.`,
    next: [`Collect more labelled rows (aim for 80+ with 20+ in each class).`, "Re-run this check; the analysis is deterministic, so changes reflect the data, not luck."] };
  if (realStatus === "pass") return { kind: "go", title: "Quantum is worth pursuing", checks,
    summary: `The quantum kernel beats the best classical model on your real outcome in held-out data, by ${sgn(r.diff.mean)} AUC, with an interval that excludes zero.`,
    next: [`Confirm on every row with the Python engine: python -m engine.readiness <your file>.`, "Pre-register the confirmatory analysis on OSF before looking at new data.", `Run the ${r.cost.circuits.toLocaleString()} projected-kernel circuits on IBM hardware and compare with simulation.`] };
  if (refWins) return { kind: "classical", title: "Classical is enough", checks,
    summary: `A linear model on all ${p.features.length} features (${f3(r.reference!.auc)} AUC) beats the quantum kernel (${f3(q.auc)}), which sees only a ${r.cost.qubits}-qubit compression of them. Squeezing this data onto today's qubit counts throws away more signal than any quantum effect could add back.`,
    next: [`Use the linear model on all features: better accuracy, no quantum hardware.`, "Revisit when larger, less noisy devices allow encoding more of the features."] };
  if (realStatus === "mixed" && headroom !== "fail" && capacity !== "fail") return { kind: "promising", title: "Promising, but unproven", checks,
    summary: `Quantum is level with the best classical model on your outcome (${f3(q.auc)} vs ${f3(b.auc)}), and there is room for it to differ, but this data cannot show it is better.${linearBest ? " The best classical model is linear, which suggests the signal is mostly linear." : ""}${lost}`,
    next: ["More rows would narrow the interval; quantum kernels matter most when data is scarce, so check the learning curve.", "Try a different qubit count or encoding before spending hardware time.", "If you proceed, report it as parity, not advantage."] };
  return { kind: "classical", title: "Classical is enough", checks,
    summary: realStatus === "fail"
      ? `The ${b.label.toLowerCase()} scores higher than the quantum kernel on your outcome (${f3(b.auc)} vs ${f3(q.auc)} AUC). Quantum compute would add cost without benefit.${linearBest ? " The signal looks mostly linear." : ""}${lost}`
      : `Quantum performs at parity (${f3(q.auc)} vs ${f3(b.auc)}), and ${headroom === "fail" ? "a classical kernel can reproduce the quantum one on these inputs" : "the circuit does not learn quantum structure better than classical models on these inputs"}, so there is no route to an advantage here.${lost}`,
    next: [`Use the ${b.label.toLowerCase()}: same accuracy, no quantum hardware.`, "Revisit if you gain a data source with physical quantum structure (for example quantum-sensor measurements)."] };
}

/* ---------------- samples ---------------- */
export function toCSV(headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

/** Markdown report of a completed check, for download. */
export function reportMarkdown(file: string, p: Prepared, r: ReadinessResult, v: Verdict) {
  const f3 = (x: number) => x.toFixed(3);
  const icon = { pass: "✅", mixed: "🟡", fail: "❌" } as const;
  return `# Quantum Readiness Check: ${file}

**Verdict: ${v.title}.** ${v.summary}

| Check | Result | |
|---|---|---|
${v.checks.map((c) => `| ${c.title} | ${c.headline} | ${icon[c.status]} |`).join("\n")}

## Real outcome (${p.outcome})
${p.rowsUsed} rows used (${p.positives} positive) of ${p.rowsLabelled} labelled rows (${p.rowsTotal} in the file). 4 × stratified 5-fold cross-validation; every model tuned by inner 3-fold CV on the training folds only.

| Model | AUC | SD |
|---|---|---|
${[...r.real, ...(r.reference ? [r.reference] : [])].map((m) => `| ${m.label}${m.key === "linearAll" ? " (reference, not information-matched)" : ""} | ${f3(m.auc)} | ${f3(m.sd)} |`).join("\n")}

Quantum minus best classical: ${f3(r.diff.mean)} (95% interval ${f3(r.diff.lo)} to ${f3(r.diff.hi)}, corrected resampled t).

## Encoding
${p.method === "pca" ? `${p.features.length} features reduced to ${p.qubitNames.length} principal components (${(p.explained * 100).toFixed(0)}% of variance), qubits coupled in a line.` : `${p.qubitNames.length} features, one per qubit, coupled along their strongest correlations (${p.edges.length} couplings).`}
SANKET feature map, ${DEFAULT_SPEC.reps} Trotter steps; bandwidth chosen by inner CV from ${SCALE_GRID.join(", ")}.

## Next steps
${v.next.map((x) => `- ${x}`).join("\n")}

_Generated by SANKET's Quantum Readiness Check in ${r.seconds.toFixed(1)} s. Engineered-label results use synthetic labels by construction. Research prototype._
`;
}

/**
 * Positive control: the same rows with labels engineered to carry quantum structure (synthetic by construction).
 * A trustworthy readiness check must say "go" here and only here.
 */
export async function quantumStructuredSample(csv: string) {
  const t = parseCSV(csv), cols = profile(t), s = guessSetup(cols);
  const { prep: p } = await chooseEncoding(t, cols, s);
  if (p.rowsUsed !== t.rows.length) throw new Error("The positive control needs every row labelled and at most MAX_ROWS rows.");
  const { Kq, Kc } = await kernels(p, [ADV_SCALE]);
  const y = (await engineerLabels(Kq[0], Kc)).yEng;
  const idCol = cols.find((c) => c.role === "id");
  return toCSV([...(idCol ? [idCol.name] : []), ...s.features.map((f) => cols[f].name), "quantum_label"],
    t.rows.map((r, i) => [...(idCol ? [r[idCol.index]] : []), ...s.features.map((f) => r[f]), y[i] ? "yes" : "no"]));
}
