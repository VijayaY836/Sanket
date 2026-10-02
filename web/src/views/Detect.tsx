import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { angleOf, blochVectors, DEFAULT_SPEC, simulate, Vec3 } from "../lib/quantum";
import { Bars, BlochSphere } from "../components/viz";
import { Chapter, PageHero, Reveal, TissueArt } from "../components/cinema";
import detect from "../data/oral_detect.json";

/**
 * Detect: is this oral tissue normal, dysplasia or cancer? GSE30784 samples scored on the same 12 pathways and the
 * same pathway-crosstalk circuit as the progression model. The registered benchmark (docs/osf_oral_diagnosis.md,
 * engine.classify) is shown as recorded; the map and the single-sample estimate are computed live and labelled
 * illustrative.
 */
type Dx = "n" | "d" | "c";
const NAME: Record<Dx, string> = { n: "Normal", d: "Dysplasia", c: "Cancer" };
const COLOR: Record<Dx, string> = { n: "var(--teal)", d: "var(--amber)", c: "var(--eosin)" };
const MODEL_NAME: Record<string, string> = { proj: "Projected quantum", fid: "Fidelity quantum", rbf: "Classical RBF", logistic: "Logistic regression", random_forest: "Random forest", gradient_boosting: "Gradient boosting" };
const CLASSICAL = ["rbf", "logistic", "random_forest", "gradient_boosting"];
const K_NEAR = 15;

const samples = detect.samples as { id: string; d: Dx; z: number[] }[];
const edges = detect.edges as [number, number][];
const pathways = detect.pathways as { key: string; label: string; short: string }[];
const pct = (x: number) => `${Math.round(x * 100)}%`;

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
    for (let it = 0; it < 200; it++) {
      const w = B.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      for (const p of comps) { const dot = p.v.reduce((s, x, j) => s + x * v[j], 0); for (let j = 0; j < n; j++) w[j] -= p.l * dot * p.v[j]; }
      const norm = Math.hypot(...w) || 1;
      l = norm; v = w.map((x) => x / norm);
    }
    comps.push({ v, l });
  }
  return Array.from({ length: n }, (_, i) => [comps[0].v[i] * Math.sqrt(comps[0].l), comps[1].v[i] * Math.sqrt(comps[1].l)]);
}

function useQuantumSpace() {
  const [space, setSpace] = useState<{ bloch: Vec3[][]; K: number[][]; xy: [number, number][] } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const bloch = samples.map((s) => blochVectors(simulate(s.z.map(angleOf), edges, DEFAULT_SPEC)));
      const n = bloch.length, D = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let s = 0; for (let k = 0; k < bloch[i].length; k++) s += (bloch[i][k][0] - bloch[j][k][0]) ** 2 + (bloch[i][k][1] - bloch[j][k][1]) ** 2 + (bloch[i][k][2] - bloch[j][k][2]) ** 2;
        D[i][j] = D[j][i] = s;
      }
      const off = D.flatMap((r, i) => r.slice(i + 1)).sort((a, b) => a - b);
      const med = off[Math.floor(off.length / 2)] || 1;
      const K = D.map((r) => r.map((d) => Math.exp(-d / med)));
      setSpace({ bloch, K, xy: embed2(K) });
    }, 30);
    return () => clearTimeout(t);
  }, []);
  return space;
}

export default function Detect() {
  const { go } = useApp();
  const space = useQuantumSpace();
  const [sel, setSel] = useState(() => samples.findIndex((s) => s.d === "d"));
  const [reveal, setReveal] = useState(false);
  useEffect(() => setReveal(false), [sel]);
  const counts = useMemo(() => samples.reduce((c, s) => ((c[s.d] += 1), c), { n: 0, d: 0, c: 0 } as Record<Dx, number>), []);
  const means = useMemo(() => {
    const m = { n: new Array(12).fill(0), d: new Array(12).fill(0), c: new Array(12).fill(0) } as Record<Dx, number[]>;
    samples.forEach((s) => s.z.forEach((v, k) => (m[s.d][k] += v / counts[s.d])));
    return m;
  }, [counts]);
  const vote = useMemo(() => {
    if (!space) return null;
    const row = space.K[sel].map((k, j) => [k, j] as [number, number]).filter(([, j]) => j !== sel).sort((a, b) => b[0] - a[0]).slice(0, K_NEAR);
    const tot = row.reduce((s, [k]) => s + k, 0) || 1;
    const share = { n: 0, d: 0, c: 0 } as Record<Dx, number>;
    row.forEach(([k, j]) => (share[samples[j].d] += k / tot));
    const top = (Object.keys(share) as Dx[]).sort((a, b) => share[b] - share[a])[0];
    return { share, top, nearest: row.slice(0, 5).map(([k, j]) => ({ id: samples[j].id, d: samples[j].d, k })) };
  }, [space, sel]);
  const s = samples[sel];
  const pick = (d: Dx) => { const pool = samples.map((x, i) => [x, i] as const).filter(([x]) => x.d === d); setSel(pool[Math.floor(Math.random() * pool.length)][1]); };
  const T = detect.tasks;

  return (
    <div className="grid">
      <PageHero kicker="Detect · Oral tissue" title={<>Normal, dysplasia or <em>cancer</em>?</>}
        lede="Before predicting whether a precancer will progress, SANKET can read the tissue itself. The same 12 pathways and the same quantum circuit, tested the same honest way, on 229 oral tissue samples."
        stats={[
          { value: T.oral_cancer_normal.models.proj.auc.toFixed(2), label: "AUC, cancer vs normal (quantum kernel)" },
          { value: T.oral_dysplasia_normal.models.proj.auc.toFixed(2), label: "AUC, dysplasia vs normal (quantum kernel)" },
          { value: "Tie", label: "quantum vs classical on both, as registered in advance" },
          { value: samples.length, label: `tissue samples, ${detect.source.accession}` },
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

      <Chapter n={1} title="Every tissue sample in quantum space" lede="Each dot is one sample, placed by quantum similarity alone. The labels were never used to position it." />
      <Reveal className="two">
        <div className="panel">
          <div className="h2">Quantum similarity map</div>
          {space ? (
            <TissueMap xy={space.xy} sel={sel} onPick={setSel} />
          ) : <p className="small muted">Simulating {samples.length} twelve-qubit states…</p>}
          <div className="legend">{(["n", "d", "c"] as Dx[]).map((d) => <span key={d}><i style={{ background: COLOR[d] }} />{NAME[d]} ({counts[d]})</span>)}</div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Projected quantum kernel at bandwidth {DEFAULT_SPEC.scale}, {DEFAULT_SPEC.reps} Trotter steps, drawn with classical multidimensional scaling. Click a dot to open that sample.</p>
        </div>
        <div className="panel">
          <div className="h2">What changes from normal tissue</div>
          <p className="small muted" style={{ marginTop: 0 }}>Average pathway score in cancer minus normal tissue (standard deviations). Positive means more active in cancer.</p>
          <Bars domain={Math.max(...means.c.map((v, k) => Math.abs(v - means.n[k])), 0.5)}
            items={pathways.map((p, k) => ({ label: p.short, value: means.c[k] - means.n[k] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))}
            posColor="var(--eosin)" negColor="var(--teal)" format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`} />
        </div>
      </Reveal>

      <Chapter n={2} title="One tissue sample" lede="Pick a sample, see its twelve qubits, and how its quantum neighbours are labelled. Then reveal its real diagnosis." />
      <Reveal className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="small">Sample&nbsp;
            <select value={sel} onChange={(e) => setSel(+e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
              {samples.map((x, i) => <option key={x.id} value={i}>{x.id}</option>)}
            </select>
          </label>
          <span className="small muted">or a random</span>
          {(["n", "d", "c"] as Dx[]).map((d) => <button key={d} className="btn" onClick={() => pick(d)}>{NAME[d].toLowerCase()} sample</button>)}
        </div>
        <div className="two">
          <div>
            <div className="constellation">
              {space ? space.bloch[sel].map((v, k) => (
                <div className="sphere-cell" key={k}><BlochSphere v={v} size={84} color={COLOR[s.d]} /><div className="lbl">q{k} {pathways[k].short}</div></div>
              )) : <p className="small muted">Simulating…</p>}
            </div>
          </div>
          <div>
            <div className="h2" style={{ fontSize: 17 }}>Quantum-similarity estimate</div>
            {vote ? (
              <>
                <div className="grid" style={{ gap: 8, margin: "10px 0" }}>
                  {(["n", "d", "c"] as Dx[]).map((d) => (
                    <div key={d} className="row" style={{ gap: 10 }}>
                      <span style={{ width: 82 }} className="small"><b>{NAME[d]}</b></span>
                      <span style={{ flex: 1, height: 12, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: pct(vote.share[d]), background: COLOR[d], transition: "width .5s" }} /></span>
                      <span className="small" style={{ width: 40, textAlign: "right" }}>{pct(vote.share[d])}</span>
                    </div>
                  ))}
                </div>
                <p className="small" style={{ margin: "6px 0" }}>Most similar samples: {vote.nearest.map((x) => <span key={x.id} className="chip chip-grey" style={{ marginRight: 4 }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: COLOR[x.d], marginRight: 5 }} />{x.id}</span>)}</p>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={() => setReveal((r) => !r)}>{reveal ? "Hide diagnosis" : "Reveal the pathologist's diagnosis"}</button>
                  {reveal && <span className="chip" style={{ background: COLOR[s.d], color: "#fff", fontSize: 14, padding: "6px 12px" }}>{NAME[s.d]}{vote.top === s.d ? " · matches the estimate" : " · differs from the estimate"}</span>}
                </div>
                <p className="tiny muted" style={{ marginBottom: 0 }}>Illustrative: a weighted vote of the {K_NEAR} most similar other samples in quantum feature space (this sample left out). The registered results below come from tuned kernel SVMs and classical models under repeated cross-validation.</p>
              </>
            ) : <p className="small muted">Simulating…</p>}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <b className="small">This sample against average normal tissue</b>
          <Bars domain={3} items={pathways.map((p, k) => ({ label: p.short, value: s.z[k] - means.n[k] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8)}
            posColor="var(--eosin)" negColor="var(--teal)" format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`} />
        </div>
      </Reveal>

      <Chapter n={3} title="Tested honestly" lede="Registered before any model was run (docs/osf_oral_diagnosis.md). Repeated stratified 5-fold cross-validation, 10 repeats, equal tuning budgets." />
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
    </div>
  );
}

function TissueMap({ xy, sel, onPick }: { xy: [number, number][]; sel: number; onPick: (i: number) => void }) {
  const W = 520, H = 360, pad = 22;
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const X = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (v: number) => pad + ((v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const order = samples.map((_, i) => i).sort((a, b) => (samples[a].d === "d" ? 1 : 0) - (samples[b].d === "d" ? 1 : 0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tissue samples placed by quantum similarity, coloured by diagnosis" style={{ display: "block" }}>
      {order.map((i) => (
        <circle key={i} cx={X(xy[i][0])} cy={Y(xy[i][1])} r={samples[i].d === "d" ? 5.5 : 4.2} fill={COLOR[samples[i].d]} opacity={0.82}
          stroke={i === sel ? "var(--ink)" : "var(--surface)"} strokeWidth={i === sel ? 2.5 : 1} style={{ cursor: "pointer" }} onClick={() => onPick(i)}>
          <title>{samples[i].id}: {NAME[samples[i].d]}</title>
        </circle>
      ))}
      <circle cx={X(xy[sel][0])} cy={Y(xy[sel][1])} r={11} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" />
    </svg>
  );
}
