import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { angleOf, blochVectors, DEFAULT_SPEC, simulate, Vec3 } from "../lib/quantum";
import { mulberry32 } from "../lib/rng";
import { Bars, BlochSphere } from "../components/viz";
import { Chapter, PageHero, Reveal, TissueArt } from "../components/cinema";
import { IUpload } from "../icons";
import detect from "../data/oral_detect.json";

/**
 * Detect: is this oral tissue normal, dysplasia or cancer? By default the GSE30784 samples bundled with the app; any
 * diagnosis cohort built by engine.oral_diagnosis can be loaded instead. The registered benchmark
 * (docs/osf_oral_diagnosis.md) is shown only for the bundled dataset; the map, pathway profile and sample estimates
 * are computed live and labelled illustrative.
 */
type Dx = "n" | "d" | "c";
const DXS: Dx[] = ["n", "d", "c"];
const NAME: Record<Dx, string> = { n: "Normal", d: "Dysplasia", c: "Cancer" };
const COLOR: Record<Dx, string> = { n: "var(--teal)", d: "var(--amber)", c: "var(--eosin)" };
const MODEL_NAME: Record<string, string> = { proj: "Projected quantum", fid: "Fidelity quantum", rbf: "Classical RBF", logistic: "Logistic regression", random_forest: "Random forest", gradient_boosting: "Gradient boosting" };
const CLASSICAL = ["rbf", "logistic", "random_forest", "gradient_boosting"];
const K_NEAR = 15;
const MAX_SAMPLES = 1200;
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Sample { id: string; d: Dx; z: number[] }
interface DxData { name: string; source: string; bundled: boolean; samples: Sample[]; edges: [number, number][]; pathways: { key: string; label: string; short: string }[]; note?: string }

const BUNDLED: DxData = {
  name: `${detect.source.accession} oral tissue`, source: `${detect.source.institute}, ${detect.source.country}`, bundled: true,
  samples: detect.samples as Sample[], edges: detect.edges as [number, number][], pathways: detect.pathways,
};

const CODE: Record<string, Dx> = { normal: "n", control: "n", dysplasia: "d", cancer: "c", tumor: "c", tumour: "c", n: "n", d: "d", c: "c" };

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
    return d ? { id: String(p.id ?? `S${i + 1}`), d, z: z.map(Number) } : null;
  }).filter((s): s is Sample => s !== null);
  if (samples.length < 10) fail("Need at least 10 samples labelled normal, dysplasia or cancer (field `diagnosis`).");
  if (new Set(samples.map((s) => s.d)).size < 2) fail("Need at least two of the classes normal, dysplasia and cancer.");
  let note: string | undefined;
  if (samples.length > MAX_SAMPLES) {
    const r = mulberry32(7); const idx = samples.map((_, i) => [r(), i]).sort((a, b) => a[0] - b[0]).slice(0, MAX_SAMPLES).map((x) => x[1]).sort((a, b) => a - b);
    note = `Showing a random ${MAX_SAMPLES} of ${samples.length} samples to keep the browser responsive.`;
    samples = idx.map((i) => samples[i]);
  }
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

/** Weighted vote of the K_NEAR most similar samples, from one kernel row (index `self` excluded). */
function neighbourVote(row: number[], samples: Sample[], self = -1) {
  const near = row.map((k, j) => [k, j] as [number, number]).filter(([, j]) => j !== self).sort((a, b) => b[0] - a[0]).slice(0, K_NEAR);
  const tot = near.reduce((s, [k]) => s + k, 0) || 1;
  const share = { n: 0, d: 0, c: 0 } as Record<Dx, number>;
  near.forEach(([k, j]) => (share[samples[j].d] += k / tot));
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
  useEffect(() => setReveal(false), [sel, data]);
  useEffect(() => { setSel(Math.max(0, S.findIndex((s) => s.d === "d"))); setCustom(null); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const present = useMemo(() => DXS.filter((d) => S.some((s) => s.d === d)), [S]);
  const counts = useMemo(() => S.reduce((c, s) => ((c[s.d] += 1), c), { n: 0, d: 0, c: 0 } as Record<Dx, number>), [S]);
  const means = useMemo(() => {
    const m = { n: new Array(q).fill(0), d: new Array(q).fill(0), c: new Array(q).fill(0) } as Record<Dx, number[]>;
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
    try { setData(parseDxCohort(JSON.parse(await f.text()))); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not read that file."); }
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
          { value: "Tie", label: "quantum vs classical on both, as registered in advance" },
          { value: S.length, label: `tissue samples, ${detect.source.accession}` },
        ] : [
          { value: S.length, label: "samples in your dataset" },
          ...present.map((d) => ({ value: counts[d], label: NAME[d].toLowerCase() })),
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
            <div className="small muted">{S.length} samples · {present.map((d) => `${counts[d]} ${NAME[d].toLowerCase()}`).join(" · ")} · {data.source}{data.bundled ? " · bundled with the app" : " · loaded from your file"}</div>
          </div>
          <span className="spacer" />
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
          <button className="btn" onClick={() => fileRef.current?.click()}><IUpload /> Load a diagnosis dataset</button>
          {!data.bundled && <button className="btn btn-ghost" onClick={() => { setData(BUNDLED); setErr(null); }}>Back to {detect.source.accession}</button>}
        </div>
        {data.note && <div className="tiny muted" style={{ marginTop: 6 }}>{data.note}</div>}
        {err && <div className="tier tier-high" style={{ marginTop: 10 }}><b>That did not work</b>{err}</div>}
        <details style={{ marginTop: 8 }}>
          <summary className="small" style={{ cursor: "pointer" }}>How to use your own tissue data</summary>
          <div className="small" style={{ marginTop: 6 }}>
            Gene expression has to be turned into pathway scores first, which the research engine does (the browser cannot). For any GEO series with normal, dysplasia or cancer samples:
            <pre className="code" style={{ margin: "8px 0" }}>{"python -m engine.oral_diagnosis --accession GSE12345 --inspect   # check the labels first\npython -m engine.oral_diagnosis --accession GSE12345             # writes out/dx_GSE12345.json"}</pre>
            Then load that file here. Everything on this page is recomputed within your dataset; scores are never mixed with another dataset's, because models do not carry over between array platforms (see the independent check below).
          </div>
        </details>
      </Reveal>

      <Chapter n={1} title="Every tissue sample in quantum space" lede="Each dot is one sample, placed by quantum similarity alone. The labels were never used to position it." />
      <Reveal className="two">
        <div className="panel">
          <div className="h2">Quantum similarity map</div>
          {space ? <TissueMap S={S} xy={space.xy} sel={si} onPick={(i) => { setSel(i); }} extra={customRes?.xy} />
            : <p className="small muted">Simulating {S.length} twelve-qubit states…</p>}
          <div className="legend">{present.map((d) => <span key={d}><i style={{ background: COLOR[d] }} />{NAME[d]} ({counts[d]})</span>)}{customRes && <span>★ your sample (approximate position)</span>}</div>
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
          {present.map((d) => <button key={d} className="btn" onClick={() => pick(d)}>{NAME[d].toLowerCase()} sample</button>)}
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
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={() => setReveal((r) => !r)}>{reveal ? "Hide diagnosis" : "Reveal the pathologist's diagnosis"}</button>
                  {reveal && <span className="chip" style={{ background: COLOR[s.d], color: "#fff", fontSize: 14, padding: "6px 12px" }}>{NAME[s.d]}{vote.top === s.d ? " · matches the estimate" : " · differs from the estimate"}</span>}
                </div>
                <p className="tiny muted" style={{ marginBottom: 0 }}>Illustrative: a weighted vote of the {K_NEAR} most similar other samples in quantum feature space (this sample left out).{data.bundled && " The registered results below come from tuned kernel SVMs and classical models under repeated cross-validation."}</p>
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
              <div className="tier tier-intermediate" style={{ marginTop: 10 }}><b>Read this before using pasted scores</b>Scores must be on this dataset's scale: ssGSEA pathway scores standardised with this dataset's means, from the same array type. A sample from another platform or scored on its own will land in the wrong place; the independent check below shows how badly models transfer across platforms. Illustrative only, never a diagnosis.</div>
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
              <p className="small" style={{ margin: 0 }}><b>Dysplasia vs normal</b> ranks well (AUC {T.oral_dysplasia_normal.models.proj.auc.toFixed(2)}), but at the default threshold the quantum model catches only {pct(T.oral_dysplasia_normal.models.proj.sensitivity)} of dysplasias. A screening threshold set for sensitivity would be needed, and is planned as a declared amendment.</p>
              <p className="small" style={{ margin: 0 }}><b>Cancer vs dysplasia</b> is not usable yet: with {T.oral_cancer_dysplasia.positives} cancers against {T.oral_cancer_dysplasia.n - T.oral_cancer_dysplasia.positives} dysplasias, every model labels nearly all dysplasias as cancer (quantum specificity {pct(T.oral_cancer_dysplasia.models.proj.specificity)}).</p>
            </div>
          </Reveal>

          <Reveal className="panel">
            <div className="row"><div className="h2">Independent check: an Indian cohort</div><span className="spacer" /><span className="chip chip-amber">Did not transfer</span></div>
            <p className="small" style={{ marginTop: 0 }}>The cancer-vs-normal models, trained on {detect.source.accession} ({detect.source.institute}, {detect.source.country}), were applied once, unchanged, to {detect.external.accession} from {detect.external.institute?.split(",").slice(-1)[0]?.trim() || detect.external.institute}, {detect.external.city}, {detect.external.country}: {detect.external.positives} cancers and {detect.external.n - detect.external.positives} normals on a different microarray platform ({(detect.external.platform ?? []).join(", ")} vs {detect.source.platform.join(", ")}).</p>
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
            <p className="small" style={{ marginBottom: 0 }}>Every model either called almost everything cancer or almost everything normal. The most likely cause is the platform change, but with only {detect.external.n - detect.external.positives} normals nothing firmer can be said. <b>This is why SANKET's roadmap needs Indian training data from a clinical partner</b>, rather than a model trained abroad.</p>
          </Reveal>
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

function VoteBars({ share, present }: { share: Record<Dx, number>; present: Dx[] }) {
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
  const order = S.map((_, i) => i).sort((a, b) => (S[a].d === "d" ? 1 : 0) - (S[b].d === "d" ? 1 : 0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tissue samples placed by quantum similarity, coloured by diagnosis" style={{ display: "block" }}>
      {order.map((i) => (
        <circle key={i} cx={X(xy[i][0])} cy={Y(xy[i][1])} r={S[i].d === "d" ? r + 1.3 : r} fill={COLOR[S[i].d]} opacity={0.82}
          stroke={i === sel ? "var(--ink)" : "var(--surface)"} strokeWidth={i === sel ? 2.5 : 1} style={{ cursor: "pointer" }} onClick={() => onPick(i)}>
          <title>{S[i].id}: {NAME[S[i].d]}</title>
        </circle>
      ))}
      {xy[sel] && <circle cx={X(xy[sel][0])} cy={Y(xy[sel][1])} r={11} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" />}
      {extra && <text x={X(extra[0])} y={Y(extra[1]) + 7} textAnchor="middle" fontSize={22} fill="var(--violet)" stroke="var(--surface)" strokeWidth={1}>★</text>}
    </svg>
  );
}
