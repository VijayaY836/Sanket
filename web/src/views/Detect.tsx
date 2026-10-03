import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { angleOf, blochVectors, DEFAULT_SPEC, simulate, Vec3 } from "../lib/quantum";
import { mulberry32 } from "../lib/rng";
import { Bars, BlochSphere } from "../components/viz";
import { Chapter, PageHero, Reveal, TissueArt } from "../components/cinema";
import { IUpload } from "../icons";
import detect from "../data/oral_detect.json";
import hallmark from "../data/hallmark12.json";
import { parseExpression, ssgseaScores } from "../lib/ssgsea";

/**
 * Detect: is this oral tissue normal, dysplasia or cancer? By default the GSE30784 samples bundled with the app; any
 * diagnosis cohort built by engine.oral_diagnosis can be loaded instead, or a gene-activity table (genes x samples)
 * scored into the 12 pathways in the browser. Samples without a diagnosis in that table are treated as patients and
 * compared only with the same file's labelled samples (never with another dataset's). The registered benchmark
 * (docs/osf_oral_diagnosis.md) is shown only for the bundled dataset; the map, pathway profile and sample estimates
 * are computed live and labelled illustrative.
 */
type Dx = "n" | "d" | "c" | "u"; // u: no diagnosis given (a patient to estimate, never a reference)
type Known = Exclude<Dx, "u">;
const DXS: Known[] = ["n", "d", "c"];
const NAME: Record<Dx, string> = { n: "Normal", d: "Dysplasia", c: "Cancer", u: "Unlabelled" };
const COLOR: Record<Dx, string> = { n: "var(--teal)", d: "var(--amber)", c: "var(--eosin)", u: "var(--ink-3)" };
const MODEL_NAME: Record<string, string> = { proj: "Projected quantum", fid: "Fidelity quantum", rbf: "Classical RBF", logistic: "Logistic regression", random_forest: "Random forest", gradient_boosting: "Gradient boosting" };
const CLASSICAL = ["rbf", "logistic", "random_forest", "gradient_boosting"];
const K_NEAR = 15;
const MAX_SAMPLES = 1200;
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Sample { id: string; d: Dx; z: number[] }
interface DxData {
  name: string; source: string; bundled: boolean; samples: Sample[]; edges: [number, number][]; pathways: { key: string; label: string; short: string }[]; note?: string;
  genes?: { n: number; coverage: { key: string; found: number; size: number }[] }; // set when scored here from gene activity
}

type Metrics = { auc: number; sensitivity: number; specificity: number; ppv: number | null; npv: number | null };
type ModelSet = Record<string, Metrics>;
/** Declared amendments (docs/osf_oral_diagnosis.md): A2 screening cut-off, A3 class weighting, A1 corrected external check. */
const SCR = (Object.values(detect.tasks)[0] as unknown as { screening?: ModelSet }).screening
  ? (Object.fromEntries(Object.entries(detect.tasks).map(([k, t]) => [k, (t as unknown as { screening: ModelSet }).screening])) as Record<string, ModelSet>)
  : null;
const BAL = (detect.tasks.oral_cancer_dysplasia as unknown as { balanced?: ModelSet }).balanced ?? null;
const EXT = (detect.external as unknown as { corrected?: { models: Record<string, Metrics & { auc_ci: [number, number] }>; biology: { pathway: string; train: number; external: number; same: boolean }[]; agree: number } }).corrected ?? null;
type BreastData = {
  accession: string; institute: string; city: string; country: string; n: number; positives: number; primaryP: number; repeats?: number;
  models: Record<string, { auc: number; auc_sd: number; sensitivity: number; specificity: number }>;
  screening?: ModelSet;
  external?: { accession: string; institute: string; city: string; country: string; n: number; positives: number; agree: number; opposite: string[];
               models: Record<string, Metrics & { auc_ci: [number, number] }> };
};
/** Breast detection (docs/osf_breast_diagnosis.md): cancer vs normal on GSE42568, screening cut-off, independent check. */
const BREAST = (detect as unknown as { breast?: BreastData }).breast ?? null;
const TARGET = (detect as unknown as { screeningTarget?: number | null }).screeningTarget ?? 0.9;

const BUNDLED: DxData = {
  name: `${detect.source.accession} oral tissue`, source: `${detect.source.institute}, ${detect.source.country}`, bundled: true,
  samples: detect.samples as Sample[], edges: detect.edges as [number, number][], pathways: detect.pathways,
};

const CODE: Record<string, Dx> = { normal: "n", control: "n", dysplasia: "d", cancer: "c", tumor: "c", tumour: "c", n: "n", d: "d", c: "c" };
/** Free-text label -> class, with the same patterns as engine.oral_diagnosis; anything else is unlabelled. */
function classOf(text: string | null): Dx {
  const t = (text ?? "").trim();
  if (CODE[t.toLowerCase()]) return CODE[t.toLowerCase()];
  const hit: Known[] = [];
  if (/dysplas/i.test(t)) hit.push("d");
  if (/carcinoma|cancer|\boscc\b|\bscc\b|tumou?r|malignan/i.test(t)) hit.push("c");
  if (/\bnormal\b|\bcontrol\b|healthy/i.test(t)) hit.push("n");
  return hit.length === 1 ? hit[0] : "u";
}

function subsample(samples: Sample[]): { samples: Sample[]; note?: string } {
  if (samples.length <= MAX_SAMPLES) return { samples };
  const r = mulberry32(7); const idx = samples.map((_, i) => [r(), i]).sort((a, b) => a[0] - b[0]).slice(0, MAX_SAMPLES).map((x) => x[1]).sort((a, b) => a - b);
  return { samples: idx.map((i) => samples[i]), note: `Showing a random ${MAX_SAMPLES} of ${samples.length} samples to keep the browser responsive.` };
}

function checkLabelled(samples: Sample[], min: number) {
  const known = samples.filter((s) => s.d !== "u");
  if (known.length < min) throw new Error(`Need at least ${min} samples labelled normal, dysplasia or cancer as references; found ${known.length}.`);
  if (new Set(known.map((s) => s.d)).size < 2) throw new Error("Need labelled samples from at least two of normal, dysplasia and cancer.");
}

const SETS = hallmark as { source: string; keys: string[]; sets: Record<string, string[]> };
const SETS_READY = SETS.keys.length === BUNDLED.pathways.length && SETS.keys.every((k, i) => k === BUNDLED.pathways[i].key);

/** Gene-activity table (genes x samples, optional `diagnosis` row) -> ssGSEA pathway scores, standardised within the file. */
function parseGeneActivity(text: string, fileName: string): DxData {
  if (!SETS_READY) throw new Error("The pathway gene lists are not bundled with this build yet. Run `python -m engine.export_detect --sets-only` and rebuild the app.");
  const t = parseExpression(text);
  if (!t.labels) throw new Error("Add a row named `diagnosis` with normal, dysplasia or cancer for the reference samples (leave it empty for the patients to estimate).");
  const { z, coverage } = ssgseaScores(t, SETS.sets, SETS.keys);
  const all: Sample[] = t.samples.map((id, j) => ({ id, d: classOf(t.labels![j]), z: z[j].map((v) => Math.round(v * 1000) / 1000) }));
  checkLabelled(all, 5);
  const { samples, note } = subsample(all);
  const odd = t.labels.filter((l) => l && classOf(l) === "u").length;
  return {
    name: fileName.replace(/\.(csv|tsv|txt)$/i, ""), source: "your gene-activity file", bundled: false, samples, edges: BUNDLED.edges, pathways: BUNDLED.pathways,
    genes: { n: t.genes.length, coverage },
    note: [note, odd ? `${odd} sample${odd > 1 ? "s have labels" : " has a label"} other than normal, dysplasia or cancer, treated as unlabelled.` : "", t.dropped ? `${t.dropped} rows without numbers were skipped.` : ""].filter(Boolean).join(" ") || undefined,
  };
}

/** Accepts a cohort from engine.oral_diagnosis (patients[].diagnosis) or the compact bundled format (samples[].d). */
function parseDxCohort(x: unknown): DxData {
  const o = x as Record<string, any>;
  const fail = (m: string): never => { throw new Error(m); };
  if (!o || typeof o !== "object") fail("File is not a JSON object.");
  if (!Array.isArray(o.pathways) || o.pathways.length < 2 || o.pathways.length > 14) fail("`pathways` must list 2–14 pathways (one per qubit).");
  const q = o.pathways.length;
  const raw: any[] = Array.isArray(o.patients) ? o.patients : Array.isArray(o.samples) ? o.samples : fail("Expected `patients` (from engine.oral_diagnosis) or `samples`.");
  let samples: Sample[] = raw.map((p, i) => {
    const d = CODE[String(p.diagnosis ?? p.d ?? "").toLowerCase()];
    const z = p.pathways ?? p.z;
    if (!Array.isArray(z) || z.length !== q) fail(`Sample ${i + 1}: expected ${q} pathway scores.`);
    return { id: String(p.id ?? `S${i + 1}`), d: d ?? "u", z: z.map(Number) };
  });
  checkLabelled(samples, 10);
  const sub = subsample(samples);
  samples = sub.samples;
  const note = sub.note;
  const edges = (Array.isArray(o.edges) ? o.edges : []) as [number, number][];
  if (edges.some(([a, b]) => a >= q || b >= q)) fail("An edge points to a pathway that does not exist.");
  return {
    name: String(o.name ?? "Loaded dataset"), bundled: false, samples, edges, note,
    source: o.geo?.contact_institute ? `${o.geo.contact_institute}${o.geo.contact_country ? ", " + o.geo.contact_country : ""}` : "your file",
    pathways: o.pathways.map((p: any, k: number) => ({ key: String(p.key ?? k), label: String(p.label ?? p.key ?? `Pathway ${k + 1}`), short: String(p.short ?? p.label ?? `P${k + 1}`) })),
  };
}

/** Top-2 principal coordinates of a kernel (classical MDS, power iteration with deflation). */
function embed2(K: number[][]): [number, number][] {
  const n = K.length;
  const D = K.map((r) => r.map((k) => 2 - 2 * k));
  const rowM = D.map((r) => r.reduce((a, b) => a + b, 0) / n), all = rowM.reduce((a, b) => a + b, 0) / n;
  const B = D.map((r, i) => r.map((d, j) => -0.5 * (d - rowM[i] - rowM[j] + all)));
  const comps: { v: number[]; l: number }[] = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + c + 1));
    let l = 0;
    for (let it = 0; it < 150; it++) {
      const w = B.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      for (const p of comps) { const dot = p.v.reduce((s, x, j) => s + x * v[j], 0); for (let j = 0; j < n; j++) w[j] -= p.l * dot * p.v[j]; }
      const norm = Math.hypot(...w) || 1;
      l = norm; v = w.map((x) => x / norm);
    }
    comps.push({ v, l });
  }
  return Array.from({ length: n }, (_, i) => [comps[0].v[i] * Math.sqrt(comps[0].l), comps[1].v[i] * Math.sqrt(comps[1].l)]);
}

const sqd = (a: Vec3[], b: Vec3[]) => a.reduce((s, v, k) => s + (v[0] - b[k][0]) ** 2 + (v[1] - b[k][1]) ** 2 + (v[2] - b[k][2]) ** 2, 0);
const blochOf = (z: number[], edges: [number, number][]) => blochVectors(simulate(z.map(angleOf), edges, DEFAULT_SPEC));

interface Space { bloch: Vec3[][]; K: number[][]; xy: [number, number][]; med: number; of: DxData }
function useQuantumSpace(data: DxData) {
  const [space, setSpace] = useState<Space | null>(null);
  useEffect(() => {
    setSpace(null);
    const t = setTimeout(() => {
      const bloch = data.samples.map((s) => blochOf(s.z, data.edges));
      const n = bloch.length, D = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D[i][j] = D[j][i] = sqd(bloch[i], bloch[j]);
      const off = D.flatMap((r, i) => r.slice(i + 1)).sort((a, b) => a - b);
      const med = off[Math.floor(off.length / 2)] || 1;
      const K = D.map((r) => r.map((d) => Math.exp(-d / med)));
      setSpace({ bloch, K, xy: embed2(K), med, of: data });
    }, 30);
    return () => clearTimeout(t);
  }, [data]);
  return space && space.of === data ? space : null; // never hand back a space computed for another dataset
}

/** Weighted vote of the K_NEAR most similar labelled samples, from one kernel row (index `self` excluded). */
function neighbourVote(row: number[], samples: Sample[], self = -1) {
  const near = row.map((k, j) => [k, j] as [number, number]).filter(([, j]) => j !== self && samples[j].d !== "u").sort((a, b) => b[0] - a[0]).slice(0, K_NEAR);
  const tot = near.reduce((s, [k]) => s + k, 0) || 1;
  const share = { n: 0, d: 0, c: 0 } as Record<Known, number>;
  near.forEach(([k, j]) => (share[samples[j].d as Known] += k / tot));
  const top = DXS.slice().sort((a, b) => share[b] - share[a])[0];
  return { share, top, near };
}

export default function Detect() {
  const { go } = useApp();
  const [data, setData] = useState<DxData>(BUNDLED);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const space = useQuantumSpace(data);
  const S = data.samples, P = data.pathways, q = P.length;
  const [sel, setSel] = useState(() => Math.max(0, S.findIndex((s) => s.d === "d")));
  const [reveal, setReveal] = useState(false);
  const [custom, setCustom] = useState<number[] | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setReveal(false), [sel, data]);
  useEffect(() => { setSel(Math.max(0, S.findIndex((s) => s.d === "d"))); setCustom(null); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const present = useMemo(() => DXS.filter((d) => S.some((s) => s.d === d)), [S]);
  const counts = useMemo(() => S.reduce((c, s) => ((c[s.d] += 1), c), { n: 0, d: 0, c: 0, u: 0 } as Record<Dx, number>), [S]);
  const shown: Dx[] = counts.u ? [...present, "u"] : present;
  const means = useMemo(() => {
    const m = { n: new Array(q).fill(0), d: new Array(q).fill(0), c: new Array(q).fill(0), u: new Array(q).fill(0) } as Record<Dx, number[]>;
    S.forEach((s) => s.z.forEach((v, k) => (m[s.d][k] += v / counts[s.d])));
    return m;
  }, [S, q, counts]);
  const si = sel < S.length ? sel : 0; // selection clamped to the current dataset
  const vote = useMemo(() => (space ? neighbourVote(space.K[si], S, si) : null), [space, si, S]);
  const customRes = useMemo(() => {
    if (!space || !custom) return null;
    const b = blochOf(custom, data.edges);
    const row = space.bloch.map((bj) => Math.exp(-sqd(b, bj) / space.med));
    const v = neighbourVote(row, S);
    const near5 = v.near.slice(0, 5), w = near5.reduce((s, [k]) => s + k, 0) || 1;
    const xy: [number, number] = [near5.reduce((s, [k, j]) => s + (k / w) * space.xy[j][0], 0), near5.reduce((s, [k, j]) => s + (k / w) * space.xy[j][1], 0)];
    return { bloch: b, vote: v, xy };
  }, [space, custom, data.edges, S]);

  const s = S[si];
  const pick = (d: Dx) => { const pool = S.map((x, i) => [x, i] as const).filter(([x]) => x.d === d); if (pool.length) setSel(pool[Math.floor(Math.random() * pool.length)][1]); };
  const load = async (f: File) => {
    setErr(null);
    try {
      const text = await f.text();
      if (text.trimStart().startsWith("{")) { setData(parseDxCohort(JSON.parse(text))); return; }
      setBusy(`Scoring ${f.name} into ${q} pathways…`);
      await new Promise((r) => setTimeout(r, 30)); // let the message paint before the scoring blocks
      setData(parseGeneActivity(text, f.name));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that file."); }
    finally { setBusy(null); }
  };
  const downloadScores = () => {
    const out = { name: data.name, pathways: P, edges: data.edges, samples: S.map((x) => ({ id: x.id, d: x.d === "u" ? null : x.d, z: x.z })) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
    a.download = `${data.name}_pathway_scores.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const applyPaste = () => {
    const v = paste.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (v.length !== q || v.some((x) => !Number.isFinite(x))) { setErr(`Paste exactly ${q} numbers (standardised pathway scores, in the order shown).`); return; }
    setErr(null); setCustom(v.map((x) => Math.max(-4, Math.min(4, x))));
  };
  const T = detect.tasks;

  return (
    <div className="grid">
      <PageHero kicker="Detect · Oral tissue" title={<>Normal, dysplasia or <em>cancer</em>?</>}
        lede="Before predicting whether a precancer will progress, SANKET can read the tissue itself. The same 12 pathways and the same quantum circuit, tested the same honest way."
        stats={data.bundled ? [
          { value: T.oral_cancer_normal.models.proj.auc.toFixed(2), label: "AUC, cancer vs normal (quantum kernel)" },
          { value: T.oral_dysplasia_normal.models.proj.auc.toFixed(2), label: "AUC, dysplasia vs normal (quantum kernel)" },
          { value: SCR ? pct(SCR.oral_dysplasia_normal.proj.sensitivity) : "Tie", label: SCR ? "of dysplasias caught at the screening cut-off" : "quantum vs classical on both, as registered in advance" },
          { value: EXT ? EXT.models.proj.auc.toFixed(2) : S.length, label: EXT ? "AUC on an independent Indian cohort" : `tissue samples, ${detect.source.accession}` },
        ] : [
          { value: S.length, label: "samples in your dataset" },
          ...shown.map((d) => ({ value: counts[d], label: d === "u" ? "unlabelled, to estimate" : NAME[d].toLowerCase() })),
        ]}
        art={<TissueArt />} />

      <Reveal className="panel-flat" style={{ padding: "16px 20px" }}>
        <div className="row" style={{ gap: 10 }}>
          <b className="small">The whole path</b>
          {[["Detect", "Is this tissue normal, dysplasia or cancer?", true], ["Predict", "For a precancer: will it become cancer, and when?", false], ["Explain and refer", "Which pathways drive it, and when to hand over to a specialist", false]].map(([t, d, on], i, arr) => (
            <span key={t as string} className="row" style={{ gap: 10 }}>
              <span className={`chip ${on ? "chip-violet" : "chip-grey"}`} style={{ whiteSpace: "normal" }} title={d as string}><b>{t}</b>&nbsp;· {d}</span>
              {i < arr.length - 1 && <span className="muted">→</span>}
            </span>
          ))}
          <span className="spacer" />
          <button className="btn" onClick={() => go("case")}>Open a progression case →</button>
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>Decision support alongside the pathologist, never a replacement for reading the biopsy. Research prototype, not for clinical use.</div>
      </Reveal>

      <Reveal className="panel">
        <div className="row">
          <div>
            <div className="h2">Dataset: {data.name}</div>
            <div className="small muted">{S.length} samples · {shown.map((d) => `${counts[d]} ${NAME[d].toLowerCase()}`).join(" · ")} · {data.source}{data.bundled ? " · bundled with the app" : " · loaded from your file"}</div>
          </div>
          <span className="spacer" />
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
          <button className="btn" disabled={!!busy} onClick={() => fileRef.current?.click()}><IUpload /> Upload gene activity or scores</button>
          {data.genes && <button className="btn btn-ghost" onClick={downloadScores}>Download pathway scores</button>}
          {!data.bundled && <button className="btn btn-ghost" onClick={() => { setData(BUNDLED); setErr(null); }}>Back to {detect.source.accession}</button>}
        </div>
        {busy && <div className="small" style={{ marginTop: 8 }}>{busy}</div>}
        {data.genes && (
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Scored here from {data.genes.n.toLocaleString()} genes: ssGSEA on the 12 Hallmark pathways, standardised within your file. Genes found per pathway: {data.genes.coverage.map((c, k) => `${P[k].short} ${c.found}/${c.size}`).join(" · ")}.
          </div>
        )}
        {data.note && <div className="tiny muted" style={{ marginTop: 6 }}>{data.note}</div>}
        {err && <div className="tier tier-high" style={{ marginTop: 10 }}><b>That did not work</b>{err}</div>}
        <details style={{ marginTop: 8 }}>
          <summary className="small" style={{ cursor: "pointer" }}>How to use your own tissue data</summary>
          <div className="small" style={{ marginTop: 6 }}>
            <b>Gene activity (CSV or TSV).</b> Genes as rows (gene symbols such as TP53 in the first column), samples as columns, one value per gene and sample (normalised microarray or log RNA-seq values). Add one row named <code>diagnosis</code>: write normal, dysplasia or cancer for the reference samples and leave it empty for the patients you want estimated. At least 5 labelled references from two classes; the more, the better.
            <pre className="code" style={{ margin: "8px 0" }}>{"gene,      S1,     S2,        S3,     P1\ndiagnosis, normal, dysplasia, cancer,\nTP53,      7.21,   7.80,      8.93,   8.10\nMYC,       6.02,   6.55,      7.41,   7.02\n…          (500+ genes)"}</pre>
            Your file is scored on this device and never uploaded. Patients are compared only with the labelled samples in the same file, because scores from different array platforms or labs do not line up (see the independent check below). Everything shown for your file is illustrative, not a diagnosis.
            <div style={{ marginTop: 8 }}><b>A GEO series.</b> For probe-level data, let the engine map probes to genes and score it, then upload the JSON it writes:</div>
            <pre className="code" style={{ margin: "8px 0" }}>{"python -m engine.oral_diagnosis --accession GSE12345 --inspect   # check the labels first\npython -m engine.oral_diagnosis --accession GSE12345             # writes out/dx_GSE12345.json"}</pre>
          </div>
        </details>
      </Reveal>

      <Chapter n={1} title="Every tissue sample in quantum space" lede="Each dot is one sample, placed by quantum similarity alone. The labels were never used to position it." />
      <Reveal className="two">
        <div className="panel">
          <div className="h2">Quantum similarity map</div>
          {space ? <TissueMap S={S} xy={space.xy} sel={si} onPick={(i) => { setSel(i); }} extra={customRes?.xy} />
            : <p className="small muted">Simulating {S.length} twelve-qubit states…</p>}
          <div className="legend">{shown.map((d) => <span key={d}><i style={{ background: COLOR[d] }} />{NAME[d]} ({counts[d]})</span>)}{customRes && <span>★ your sample (approximate position)</span>}</div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Projected quantum kernel at bandwidth {DEFAULT_SPEC.scale}, {DEFAULT_SPEC.reps} Trotter steps, drawn with classical multidimensional scaling. Click a dot to open that sample.</p>
        </div>
        <div className="panel">
          {counts.c && counts.n ? (
            <>
              <div className="h2">What changes from normal tissue</div>
              <p className="small muted" style={{ marginTop: 0 }}>Average pathway score in cancer minus normal tissue (standard deviations). Positive means more active in cancer.</p>
              <Bars domain={Math.max(...means.c.map((v, k) => Math.abs(v - means.n[k])), 0.5)}
                items={P.map((p, k) => ({ label: p.short, value: means.c[k] - means.n[k] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))}
                posColor="var(--eosin)" negColor="var(--teal)" format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`} />
            </>
          ) : <><div className="h2">What changes</div><p className="small muted">Needs both normal and cancer samples in the dataset.</p></>}
        </div>
      </Reveal>

      <Chapter n={2} title="One tissue sample" lede="Pick a sample, see its twelve qubits and how its quantum neighbours are labelled. Then reveal its real diagnosis." />
      <Reveal className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="small">Sample&nbsp;
            <select value={si} onChange={(e) => setSel(+e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
              {S.map((x, i) => <option key={x.id + i} value={i}>{x.id}</option>)}
            </select>
          </label>
          <span className="small muted">or a random</span>
          {shown.map((d) => <button key={d} className="btn" onClick={() => pick(d)}>{NAME[d].toLowerCase()} sample</button>)}
        </div>
        <div className="two">
          <div className="constellation">
            {space ? space.bloch[si]?.map((v, k) => (
              <div className="sphere-cell" key={k}><BlochSphere v={v} size={84} color={COLOR[s.d]} /><div className="lbl">q{k} {P[k].short}</div></div>
            )) : <p className="small muted">Simulating…</p>}
          </div>
          <div>
            <div className="h2" style={{ fontSize: 17 }}>Quantum-similarity estimate</div>
            {vote ? (
              <>
                <VoteBars share={vote.share} present={present} />
                <p className="small" style={{ margin: "6px 0" }}>Most similar samples: {vote.near.slice(0, 5).map(([, j]) => <span key={j} className="chip chip-grey" style={{ marginRight: 4 }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: COLOR[S[j].d], marginRight: 5 }} />{S[j].id}</span>)}</p>
                {s.d === "u" ? (
                  <div className="tier tier-intermediate" style={{ marginTop: 12 }}><b>No diagnosis in your file for this sample</b>Closest to {NAME[vote.top].toLowerCase()} among your labelled samples. A similarity estimate for discussion with a pathologist, not a diagnosis.</div>
                ) : (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" onClick={() => setReveal((r) => !r)}>{reveal ? "Hide diagnosis" : "Reveal the pathologist's diagnosis"}</button>
                    {reveal && <span className="chip" style={{ background: COLOR[s.d], color: "#fff", fontSize: 14, padding: "6px 12px" }}>{NAME[s.d]}{vote.top === s.d ? " · matches the estimate" : " · differs from the estimate"}</span>}
                  </div>
                )}
                <p className="tiny muted" style={{ marginBottom: 0 }}>Illustrative: a weighted vote of the {K_NEAR} most similar labelled samples in quantum feature space (this sample left out).{data.bundled && " The registered results below come from tuned kernel SVMs and classical models under repeated cross-validation."}</p>
              </>
            ) : <p className="small muted">Simulating…</p>}
          </div>
        </div>
        {counts.n > 0 && (
          <div style={{ marginTop: 14 }}>
            <b className="small">This sample against average normal tissue</b>
            <Bars domain={3} items={P.map((p, k) => ({ label: p.short, value: s.z[k] - means.n[k] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8)}
              posColor="var(--eosin)" negColor="var(--teal)" format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`} />
          </div>
        )}
      </Reveal>

      <Chapter n={3} title="Try a sample of your own" lede="Start from any real sample and move its pathway scores, or paste a sample's 12 standardised scores. See where it lands and what its quantum neighbours are." />
      <Reveal className="panel">
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn" onClick={() => setCustom(s.z.slice())}>Start from {s.id}</button>
          {custom && <button className="btn btn-ghost" onClick={() => setCustom(null)}>Clear</button>}
          <span className="spacer" />
          <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={`${q} numbers, comma-separated`} aria-label="Paste pathway scores"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", minWidth: 0, width: "min(340px, 100%)" }} />
          <button className="btn" onClick={applyPaste}>Use these scores</button>
        </div>
        {custom ? (
          <div className="two">
            <div className="grid" style={{ gap: 6 }}>
              {P.map((p, k) => (
                <div key={p.key} className="slider">
                  <div className="slider-head"><span>{p.label}</span><b>{custom[k] > 0 ? "+" : ""}{custom[k].toFixed(1)}</b></div>
                  <input type="range" min={-3} max={3} step={0.1} value={custom[k]} aria-label={`${p.label} score`} onChange={(e) => setCustom((z) => z && z.map((v, i) => (i === k ? +e.target.value : v)))} />
                </div>
              ))}
            </div>
            <div>
              <div className="h2" style={{ fontSize: 17 }}>Where it lands</div>
              {customRes ? (
                <>
                  <VoteBars share={customRes.vote.share} present={present} />
                  <p className="small" style={{ margin: "6px 0" }}>Nearest samples: {customRes.vote.near.slice(0, 5).map(([, j]) => <span key={j} className="chip chip-grey" style={{ marginRight: 4 }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: COLOR[S[j].d], marginRight: 5 }} />{S[j].id}</span>)}</p>
                  <div className="constellation" style={{ marginTop: 8 }}>
                    {customRes.bloch.map((v, k) => <div className="sphere-cell" key={k}><BlochSphere v={v} size={64} color="var(--violet)" /><div className="lbl">{P[k].short}</div></div>)}
                  </div>
                </>
              ) : <p className="small muted">Simulating…</p>}
              <div className="tier tier-intermediate" style={{ marginTop: 10 }}><b>Read this before using pasted scores</b>Scores must be on this dataset's scale: ssGSEA pathway scores standardised with this dataset's means, from the same array type. A sample from another platform or another dataset's scale will land in the wrong place; the independent check below shows how much the scale matters. Illustrative only, never a diagnosis.</div>
            </div>
          </div>
        ) : <p className="small muted" style={{ margin: 0 }}>Click <b>Start from {s.id}</b> to copy the selected sample's scores into sliders, then move them: for example raise inflammation and EMT in a normal sample and watch its neighbours change.</p>}
      </Reveal>

      {data.bundled ? (
        <>
          <Chapter n={4} title="Tested honestly" lede="Registered before any model was run (docs/osf_oral_diagnosis.md). Repeated stratified 5-fold cross-validation, 10 repeats, equal tuning budgets." />
          <Reveal className="panel">
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>Task</th><th>Samples</th><th>Projected quantum AUC</th><th>Classical RBF AUC</th><th>Best classical</th><th>Quantum vs RBF</th><th>Verdict</th></tr></thead>
                <tbody>
                  {(Object.keys(T) as (keyof typeof T)[]).map((key) => {
                    const t = T[key]; const m = t.models as Record<string, { auc: number; auc_sd: number; sensitivity: number; specificity: number }>;
                    const best = CLASSICAL.reduce((b, k) => (m[k].auc > m[b].auc ? k : b), "rbf");
                    return (
                      <tr key={key}>
                        <td><b>{t.label}</b></td>
                        <td>{t.positives} vs {t.n - t.positives}</td>
                        <td><b>{m.proj.auc.toFixed(3)}</b> <span className="tiny muted">± {m.proj.auc_sd.toFixed(3)}</span><div className="tiny muted">sensitivity {pct(m.proj.sensitivity)} · specificity {pct(m.proj.specificity)}</div></td>
                        <td>{m.rbf.auc.toFixed(3)}</td>
                        <td>{m[best].auc.toFixed(3)} <span className="tiny muted">{MODEL_NAME[best]}</span></td>
                        <td>p = {t.primaryP.toFixed(2)}</td>
                        <td><span className="chip chip-grey">Tie</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid" style={{ gap: 6, marginTop: 10 }}>
              <p className="small" style={{ margin: 0 }}><b>Cancer vs normal</b> works as a ranking and as a yes/no call, for every model. It checks that the pipeline works; nobody expected quantum to win it.</p>
              <p className="small" style={{ margin: 0 }}><b>Dysplasia vs normal</b> ranks well (AUC {T.oral_dysplasia_normal.models.proj.auc.toFixed(2)}), but at the default threshold the quantum model catches only {pct(T.oral_dysplasia_normal.models.proj.sensitivity)} of dysplasias.{SCR ? <> With the declared screening cut-off it catches <b>{pct(SCR.oral_dysplasia_normal.proj.sensitivity)}</b> and still clears {pct(SCR.oral_dysplasia_normal.proj.specificity)} of normal tissue (below).</> : " A screening threshold set for sensitivity is planned as a declared amendment."}</p>
              <p className="small" style={{ margin: 0 }}><b>Cancer vs dysplasia</b> is the hard boundary: with {T.oral_cancer_dysplasia.positives} cancers against {T.oral_cancer_dysplasia.n - T.oral_cancer_dysplasia.positives} dysplasias, every model labels nearly all dysplasias as cancer at the default settings (quantum specificity {pct(T.oral_cancer_dysplasia.models.proj.specificity)}).{BAL ? <> Weighting the two classes equally lifts the kernel models to AUC {BAL.proj.auc.toFixed(2)} (exploratory, below).</> : ""}</p>
            </div>
          </Reveal>

          {SCR && (
            <Reveal className="panel">
              <div className="row"><div className="h2">Declared amendments</div><span className="spacer" /><span className="chip chip-grey">Written before they were run</span></div>
              <p className="small" style={{ marginTop: 0 }}><b>A2 · Screening cut-off.</b> In screening, missing a precancer is worse than a false alarm. Within each training fold the cut-off is set to catch at least {pct(TARGET)} of positives on the training samples, then applied unchanged to the held-out fold; the same rule as SANKET's progression referral. Same folds as above.</p>
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Task</th><th>Model</th><th>Sensitivity</th><th>Specificity</th><th>NPV</th><th>PPV</th></tr></thead>
                  <tbody>
                    {(Object.keys(T) as (keyof typeof T)[]).flatMap((key) => (["proj", "rbf"] as const).map((m, j) => {
                      const v = SCR[key][m];
                      return (
                        <tr key={key + m}>
                          <td>{j === 0 ? <b>{T[key].label}</b> : ""}</td><td>{MODEL_NAME[m] ?? m}</td>
                          <td>{pct(v.sensitivity)}</td><td>{pct(v.specificity)}</td><td>{v.npv == null ? "–" : pct(v.npv)}</td><td>{v.ppv == null ? "–" : pct(v.ppv)}</td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
              <div className="grid" style={{ gap: 6, marginTop: 10 }}>
                <p className="small" style={{ margin: 0 }}><b>Dysplasia vs normal becomes usable for screening:</b> {pct(SCR.oral_dysplasia_normal.proj.sensitivity)} of dysplasias caught (was {pct(T.oral_dysplasia_normal.models.proj.sensitivity)}), and a "normal" result is right {pct(SCR.oral_dysplasia_normal.proj.npv ?? 0)} of the time.</p>
                <p className="small" style={{ margin: 0 }}><b>Cancer vs normal</b> already caught {pct(T.oral_cancer_normal.models.proj.sensitivity)} of cancers at the default cut-off, so the rule moves the other way (fewer false alarms, {pct(SCR.oral_cancer_normal.proj.sensitivity)} caught). For screening the default stays the better operating point on this task.</p>
                <p className="small" style={{ margin: 0 }}><b>Cancer vs dysplasia</b> clears {pct(SCR.oral_cancer_dysplasia.proj.specificity)} of dysplasias instead of {pct(T.oral_cancer_dysplasia.models.proj.specificity)}, but its NPV stays low: still not usable.</p>
              </div>
              {BAL && (
                <>
                  <p className="small" style={{ marginBottom: 6 }}><b>A3 · Class weighting, cancer vs dysplasia (exploratory).</b> The same task with both classes weighted equally, default cut-off, same folds.</p>
                  <div className="scroll-x">
                    <table className="table">
                      <thead><tr><th>Model</th><th>AUC (registered)</th><th>AUC (weighted)</th><th>Sensitivity</th><th>Specificity</th></tr></thead>
                      <tbody>
                        {Object.entries(BAL).map(([m, v]) => (
                          <tr key={m}><td>{MODEL_NAME[m] ?? m}</td><td>{(T.oral_cancer_dysplasia.models as Record<string, { auc: number }>)[m].auc.toFixed(3)}</td><td><b>{v.auc.toFixed(3)}</b></td><td>{pct(v.sensitivity)}</td><td>{pct(v.specificity)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="small" style={{ marginBottom: 0 }}>The kernel models, quantum and classical, gain the most and now lead (projected {BAL.proj.auc.toFixed(3)}, RBF {BAL.rbf.auc.toFixed(3)}): a tie, not a quantum win. With {T.oral_cancer_dysplasia.n - T.oral_cancer_dysplasia.positives} dysplasias, about three per test fold, this is a promising signal, not a claim.</p>
                </>
              )}
            </Reveal>
          )}

          <Reveal className="panel">
            <div className="row"><div className="h2">Independent check: an Indian cohort</div><span className="spacer" /><span className={`chip ${EXT ? "chip-teal" : "chip-amber"}`}>{EXT ? "Ranking transfers after correction" : "Did not transfer"}</span></div>
            <p className="small" style={{ marginTop: 0 }}>The cancer-vs-normal models, trained on {detect.source.accession} ({detect.source.institute}, {detect.source.country}), were applied once, unchanged, to {detect.external.accession} from {detect.external.institute?.split(",").slice(-1)[0]?.trim() || detect.external.institute}, {detect.external.city}, {detect.external.country}: {detect.external.positives} cancers and {detect.external.n - detect.external.positives} normals on a different microarray platform ({(detect.external.platform ?? []).join(", ")} vs {detect.source.platform.join(", ")}).</p>
            {EXT && (
              <>
                <p className="small"><b>What went wrong first, and the fix (Amendment A1).</b> The registered check failed: every model called almost everything cancer or almost everything normal. The cause was a scaling error, not biology. gseapy's normalised enrichment score is rescaled across each whole dataset, so the two datasets' scores were on different scales and could not be mapped with the training means. With each dataset standardised on its own (label-free), the ranking transfers. This correction was found after the registered result, so it is reported as a post-hoc correction and the original stays below.</p>
                <div className="scroll-x">
                  <table className="table">
                    <thead><tr><th>Model</th><th>AUC (95% CI, descriptive)</th><th>Sensitivity (cancers)</th><th>Specificity (normals)</th></tr></thead>
                    <tbody>
                      {Object.entries(EXT.models).map(([k, v]) => (
                        <tr key={k}><td>{MODEL_NAME[k] ?? k}</td><td><b>{v.auc.toFixed(2)}</b> <span className="tiny muted">({v.auc_ci[0].toFixed(2)}–{v.auc_ci[1].toFixed(2)})</span></td><td>{pct(v.sensitivity)}</td><td>{pct(v.specificity)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small">The biology agrees across the two countries: cancer moves in the same direction as in {detect.source.accession} for <b>{EXT.agree} of 12 pathways</b>{EXT.biology.filter((b) => !b.same).length ? ` (the exception: ${EXT.biology.filter((b) => !b.same).map((b) => b.pathway).join(", ")})` : ""}. The default cut-off still clears only a few of the {detect.external.n - detect.external.positives} Indian normals, so the ranking transfers but the calibration does not. <b>Calibrating it needs Indian training data from a clinical partner</b>, which is the next step in SANKET's roadmap.</p>
                <p className="tiny muted" style={{ marginBottom: 6 }}>Registered check (scores on mismatched scales), kept for the record:</p>
              </>
            )}
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>Model</th><th>Sensitivity (cancers)</th><th>Specificity (normals)</th><th>AUC (descriptive)</th></tr></thead>
                <tbody>
                  {Object.entries(detect.external.models as Record<string, { auc: number; sensitivity: number; specificity: number }>).map(([k, v]) => (
                    <tr key={k}><td>{MODEL_NAME[k] ?? k}</td><td>{pct(v.sensitivity)}</td><td>{pct(v.specificity)}</td><td>{v.auc.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!EXT && <p className="small" style={{ marginBottom: 0 }}>Every model either called almost everything cancer or almost everything normal. The most likely cause is the platform change, but with only {detect.external.n - detect.external.positives} normals nothing firmer can be said. <b>This is why SANKET's roadmap needs Indian training data from a clinical partner</b>, rather than a model trained abroad.</p>}
          </Reveal>

          {BREAST && (
            <Reveal className="panel">
              <div className="row"><div className="h2">The same detection on breast tissue</div><span className="spacer" /><span className="chip chip-grey">Registered before it was run</span></div>
              <p className="small" style={{ marginTop: 0 }}>Breast cancer is India's most common cancer. METABRIC, used for relapse prediction, holds tumours only, so detection uses {BREAST.accession} ({BREAST.institute}, {BREAST.country}): {BREAST.positives} breast cancers and {BREAST.n - BREAST.positives} normal breast tissues, scored on the same 12 pathways with the same quantum circuit and the same {BREAST.repeats ?? 10}-repeat cross-validation (plan: docs/osf_breast_diagnosis.md).</p>
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Model</th><th>AUC</th>{BREAST.screening && <><th>Sensitivity, screening cut-off</th><th>Specificity, screening cut-off</th></>}{BREAST.external && <th>AUC on {BREAST.external.accession} (95% CI)</th>}</tr></thead>
                  <tbody>
                    {Object.entries(BREAST.models).map(([m, v]) => (
                      <tr key={m}>
                        <td>{MODEL_NAME[m] ?? m}</td>
                        <td><b>{v.auc.toFixed(3)}</b> <span className="tiny muted">± {v.auc_sd.toFixed(3)}</span></td>
                        {BREAST.screening && <><td>{pct(BREAST.screening[m].sensitivity)}</td><td>{pct(BREAST.screening[m].specificity)}</td></>}
                        {BREAST.external && <td>{BREAST.external.models[m].auc.toFixed(2)} <span className="tiny muted">({BREAST.external.models[m].auc_ci[0].toFixed(2)}–{BREAST.external.models[m].auc_ci[1].toFixed(2)})</span></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid" style={{ gap: 6, marginTop: 10 }}>
                <p className="small" style={{ margin: 0 }}><b>Detection works on breast tissue, and quantum ties classical</b> (projected quantum vs RBF, p = {BREAST.primaryP.toFixed(2)}). The two quantum kernels have the highest mean AUC and vary least across folds, a descriptive observation, not a claimed advantage.</p>
                {BREAST.screening && <p className="small" style={{ margin: 0 }}><b>Screening cut-off:</b> with only {BREAST.n - BREAST.positives} normals, the default cut-off calls almost everything cancer; the declared screening rule gives {pct(BREAST.screening.proj.sensitivity)} sensitivity and {pct(BREAST.screening.proj.specificity)} specificity for the quantum kernel.</p>}
                {BREAST.external && <p className="small" style={{ margin: 0 }}><b>Independent check on {BREAST.external.accession}</b> ({BREAST.external.institute}, {BREAST.external.city}, {BREAST.external.country}; {BREAST.external.positives} cancers, {BREAST.external.n - BREAST.external.positives} normals), applied once: the ranking transfers for every model, and cancer moves the same way in both datasets for {BREAST.external.agree} of 12 pathways{BREAST.external.opposite.length ? ` (not ${BREAST.external.opposite.join(", ")})` : ""}. The quantum kernels transfer worst here (AUC {BREAST.external.models.proj.auc.toFixed(2)} against {BREAST.external.models.logistic.auc.toFixed(2)} for logistic regression), and as in the oral Indian check every model catches every cancer but clears only a minority of normals: <b>the ranking carries across labs, the cut-off needs local calibration.</b></p>}
              </div>
            </Reveal>
          )}
        </>
      ) : (
        <Reveal className="panel">
          <div className="h2">Registered results</div>
          <p className="small" style={{ margin: 0 }}>The map and estimates above are illustrative. For a proper quantum-vs-classical test on your dataset, use the <b>Readiness check</b> (upload a CSV with a diagnosis column) or run the engine's benchmark, and write the analysis plan down first.</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => go("readiness")}>Open the Readiness check →</button>
        </Reveal>
      )}
    </div>
  );
}

function VoteBars({ share, present }: { share: Record<Known, number>; present: Known[] }) {
  return (
    <div className="grid" style={{ gap: 8, margin: "10px 0" }}>
      {present.map((d) => (
        <div key={d} className="row" style={{ gap: 10 }}>
          <span style={{ width: 82 }} className="small"><b>{NAME[d]}</b></span>
          <span style={{ flex: 1, height: 12, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: pct(share[d]), background: COLOR[d], transition: "width .5s" }} /></span>
          <span className="small" style={{ width: 40, textAlign: "right" }}>{pct(share[d])}</span>
        </div>
      ))}
    </div>
  );
}

function TissueMap({ S, xy, sel, onPick, extra }: { S: Sample[]; xy: [number, number][]; sel: number; onPick: (i: number) => void; extra?: [number, number] }) {
  const W = 520, H = 360, pad = 22;
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const X = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (v: number) => pad + ((v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const r = S.length > 500 ? 2.6 : 4.2;
  const front = (d: Dx) => (d === "u" ? 2 : d === "d" ? 1 : 0); // rare classes and patients drawn on top
  const order = S.map((_, i) => i).sort((a, b) => front(S[a].d) - front(S[b].d));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tissue samples placed by quantum similarity, coloured by diagnosis" style={{ display: "block" }}>
      {order.map((i) => (
        <circle key={i} cx={X(xy[i][0])} cy={Y(xy[i][1])} r={S[i].d === "d" || S[i].d === "u" ? r + 1.3 : r} fill={COLOR[S[i].d]} opacity={0.82}
          stroke={i === sel ? "var(--ink)" : "var(--surface)"} strokeWidth={i === sel ? 2.5 : 1} style={{ cursor: "pointer" }} onClick={() => onPick(i)}>
          <title>{S[i].id}: {NAME[S[i].d]}</title>
        </circle>
      ))}
      {xy[sel] && <circle cx={X(xy[sel][0])} cy={Y(xy[sel][1])} r={11} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" />}
      {extra && <text x={X(extra[0])} y={Y(extra[1]) + 7} textAnchor="middle" fontSize={22} fill="var(--violet)" stroke="var(--surface)" strokeWidth={1}>★</text>}
    </svg>
  );
}