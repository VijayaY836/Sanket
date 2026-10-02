import { useRef, useState } from "react";
import { useApp } from "../store";
import { AdvResult, runAdvantage } from "../lib/advantage";
import { LineBand } from "../components/viz";
import { IPlay } from "../icons";
import { HW_TABLE } from "./QuantumLab";

const MODEL_COLORS: Record<string, string> = {
  quantum_kernel: "var(--violet)", classical_rbf_kernel: "var(--ink-2)", logistic: "var(--teal)", random_forest: "var(--amber)", gradient_boosting: "var(--eosin)",
};
const MODEL_NAMES: Record<string, string> = {
  quantum_kernel: "Quantum kernel", classical_rbf_kernel: "Classical RBF kernel", logistic: "Linear model", random_forest: "Random forest", gradient_boosting: "Gradient boosting",
};
interface EngineRow { size: number; [m: string]: { mean: number; sd: number } | number }
interface ClassifyResult { task: string; label: string; cohort: string; n: number; positives: number; summary: Record<string, { auc: number; auc_sd: number; accuracy: number }>; tests_vs_projected: { vs: string; auc_diff: number; p: number; p_holm: number; primary: boolean }[] }
const CLS_NAMES: Record<string, string> = {
  proj: "Projected quantum kernel", fid: "Fidelity quantum kernel", rbf: "Classical RBF kernel", logistic: "Logistic regression", random_forest: "Random forest", gradient_boosting: "Gradient boosting",
  proj_up: "Quantum kernel, upgraded tuning", proj_noent: "Quantum kernel, no entanglement", proj_kta: "Quantum kernel, trained (alignment)", hybrid: "Hybrid quantum + linear kernel", rbf_up: "Classical RBF, wider grid", linear_svm: "Linear SVM",
};
const QUANTUM_KEYS = new Set(["proj", "fid", "proj_up", "proj_noent", "proj_kta", "hybrid"]);
interface EngineResult { cohort: string; patients: number; construction: { g: number; quantum_scale: number; classical_kernel: string }; engineered: EngineRow[]; real: EngineRow[]; real_label: string }

export default function Advantage() {
  const { model, cohort, go } = useApp();
  const [res, setRes] = useState<AdvResult | null>(null);
  const [prog, setProg] = useState<{ p: number; msg: string } | null>(null);
  const [eng, setEng] = useState<EngineResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cin = useRef<HTMLInputElement>(null);
  const [cls, setCls] = useState<ClassifyResult[]>([]);
  const loadCls = async (files: FileList) => {
    setErr(null);
    const next = [...cls];
    for (const f of Array.from(files)) {
      try { const d = JSON.parse(await f.text()); if (!d.summary || !d.task) throw new Error(); const key = d.task + (d.upgrades ? "_upgrades" : ""); d.task = key; if (d.upgrades) d.cohort = d.cohort + " (with exploratory upgrades)"; next.splice(0, next.length, ...next.filter((x) => x.task !== key), d); }
      catch { setErr(`${f.name} is not a results_classify_*.json file from python -m engine.classify.`); }
    }
    setCls(next);
  };
  const run = async () => { setRes(null); setProg({ p: 0, msg: "Starting" }); setRes(await runAdvantage(model, 110, (p, msg) => setProg({ p, msg }))); setProg(null); };
  const load = async (f: File) => {
    setErr(null);
    try { const d = JSON.parse(await f.text()); if (!d.engineered || !d.real) throw new Error(); setEng(d); }
    catch { setErr("That is not a results_advantage.json file from python -m engine.advantage."); }
  };
  const live = (rows: AdvResult["engineered"]) => [
    { label: "Quantum kernel", color: "var(--violet)", pts: rows.map((r) => ({ x: r.size, ...r.quantum })) },
    { label: "Classical RBF kernel", color: "var(--ink-2)", pts: rows.map((r) => ({ x: r.size, ...r.classical })) },
  ];
  const engSeries = (rows: EngineRow[]) => Object.keys(MODEL_NAMES).map((m) => ({
    label: MODEL_NAMES[m], color: MODEL_COLORS[m], pts: rows.map((r) => ({ x: r.size, ...(r[m] as { mean: number; sd: number }) })),
  }));
  const gain = res?.engineered.length ? res.engineered[0].quantum.mean - res.engineered[0].classical.mean : 0;

  return (
    <div className="grid advantage-page">
      <div className="topbar">
        <div>
          <h2 className="page-title">When quantum wins</h2>
          <p className="page-sub">A quantum advantage needs data with structure that quantum circuits capture and classical models cannot. SANKET can build such data from real patients, measure the advantage, and check whether the real outcome has it.</p>
        </div>
      </div>

      <section className="panel advantage-experiment">
        <div className="row">
          <div>
            <div className="h2">Live experiment on {cohort.name.split("(")[0].trim()}</div>
            <p className="small muted" style={{ margin: 0 }}>Uses up to 110 patients' real pathway scores. Labels for the first task are engineered from the quantum kernel (Huang et al., Nature Communications 2021), so they are synthetic by construction. The second task uses the real outcome.</p>
          </div>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={run} disabled={!!prog}><IPlay /> {res ? "Run again" : "Run experiment"}</button>
        </div>
        {prog && (
          <div style={{ marginTop: 14 }}>
            <div className="small muted">{prog.msg}</div>
            <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, marginTop: 6, overflow: "hidden" }}><div style={{ width: `${prog.p * 100}%`, height: "100%", background: "var(--violet)", transition: "width .2s" }} /></div>
          </div>
        )}
        {res && (
          <>
            <div className="row" style={{ margin: "16px 0 6px", alignItems: "flex-start", gap: 28 }}>
              <div><div className="num">g = {res.g.toFixed(2)}</div><div className="tiny muted">geometric difference vs the closest classical kernel ({res.n} patients)</div></div>
              <div><div className="num" style={{ color: gain > 0 ? "var(--violet)" : undefined }}>{gain >= 0 ? "+" : ""}{gain.toFixed(2)}</div><div className="tiny muted">quantum minus classical AUC with {res.engineered[0]?.size} training patients, engineered task</div></div>
            </div>
            <div className="two advantage-charts" style={{ marginTop: 10 }}>
              <div>
                <div className="row"><b>Engineered quantum-structured labels</b><span className="chip chip-amber">synthetic labels</span></div>
                <LineBand xLabel="Training patients" yRange={[0.3, 1]} series={live(res.engineered)} />
              </div>
              <div>
                <div className="row"><b>Real outcome</b><span className="chip chip-teal">{res.realN} patients</span></div>
                <LineBand xLabel="Training patients" yRange={[0.3, 1]} series={live(res.real)} />
              </div>
            </div>
            <div className="legend"><span><i style={{ background: "var(--violet)" }} />Quantum kernel</span><span><i style={{ background: "var(--ink-2)" }} />Classical RBF kernel, bandwidth tuned</span><span>Test AUC, 12 repeats, ±1 SD</span></div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="row">
          <div className="h2">Full benchmark from the engine</div><span className="spacer" />
          <button className="btn" onClick={() => input.current?.click()}>Load results_advantage.json</button>
          <input ref={input} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>Adds tuned linear, random forest and gradient boosting models, on hundreds of patients. Run <code>python -m engine.advantage</code>.</p>
        {err && <div className="tier tier-high"><b>Could not load</b>{err}</div>}
        {eng && (
          <>
            <p className="small">{eng.cohort}, {eng.patients} patients. Labels engineered from the quantum kernel at bandwidth {eng.construction.quantum_scale} against {eng.construction.classical_kernel}, g = {eng.construction.g.toFixed(2)}.</p>
            <div className="two">
              <div><div className="row"><b>Engineered labels</b><span className="chip chip-amber">synthetic labels</span></div><LineBand xLabel="Training patients" yRange={[0.3, 1]} series={engSeries(eng.engineered)} /></div>
              <div><div className="row"><b>Real outcome</b><span className="chip chip-teal">{eng.real_label}</span></div><LineBand xLabel="Training patients" yRange={[0.3, 1]} series={engSeries(eng.real)} /></div>
            </div>
            <div className="legend">{Object.keys(MODEL_NAMES).map((m) => <span key={m}><i style={{ background: MODEL_COLORS[m] }} />{MODEL_NAMES[m]}</span>)}</div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="row">
          <div className="h2">Diagnosis tasks on real patients</div><span className="spacer" />
          <button className="btn" onClick={() => cin.current?.click()}>Load results_classify files</button>
          <input ref={cin} type="file" accept=".json" multiple hidden onChange={(e) => e.target.files && loadCls(e.target.files)} />
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>Telling disease types apart is a strong-signal task, so every good model, quantum included, scores high. Run <code>python -m engine.classify --task golub</code> or <code>--task metabric_basal</code>.</p>
        <div className="two">
          {cls.map((c) => {
            const order = Object.keys(c.summary).sort((a, b) => c.summary[b].auc - c.summary[a].auc);
            const prim = c.tests_vs_projected.find((t) => t.primary);
            return (
              <div key={c.task}>
                <div className="row"><b>{c.cohort}</b><span className="chip chip-teal">{c.n} patients</span></div>
                <div className="small muted">{c.label}</div>
                <div className="scroll-x"><table className="table">
                  <thead><tr><th>Model</th><th>AUC</th><th>Accuracy</th></tr></thead>
                  <tbody>{order.map((m) => (
                    <tr key={m}><td style={{ fontWeight: QUANTUM_KEYS.has(m) ? 700 : 400, color: QUANTUM_KEYS.has(m) ? "var(--violet)" : undefined }}>{CLS_NAMES[m] ?? m}</td>
                      <td><b>{c.summary[m].auc.toFixed(3)}</b> <span className="muted tiny">± {c.summary[m].auc_sd.toFixed(3)}</span></td><td>{c.summary[m].accuracy.toFixed(3)}</td></tr>
                  ))}</tbody>
                </table></div>
                {prim && <div className="tiny muted">Quantum vs classical kernel: difference {prim.auc_diff >= 0 ? "+" : ""}{prim.auc_diff.toFixed(3)}, p = {prim.p.toFixed(3)}.</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="two">
        <div className="panel">
          <div className="h2">What this shows</div>
          <p className="small" style={{ marginTop: 0 }}>On data with quantum structure, the quantum kernel learns from far fewer patients than classical models. On real cancer outcomes it does not: across two registered cohorts (86 oral and 1,975 breast cancer patients) it matched the classical kernel exactly. SANKET's advantage test tells the two situations apart before any claim is made.</p>
          <p className="tiny muted">Flexible classical learners can catch up on engineered data as training sets grow; the advantage is in how much data is needed.</p>
          <button className="btn btn-primary" onClick={() => go("readiness")}>Run this test on your own data →</button>
        </div>
        <div className="panel">
          <div className="h2">Where quantum already wins: cost</div>
          <div className="row" style={{ gap: 28, marginTop: 8 }}>
            <div><div className="num">~5×</div><div className="tiny muted">fewer two-qubit gates than the standard ZZ map ({HW_TABLE[1].twoq} vs {HW_TABLE[3].twoq})</div></div>
            <div><div className="num">14×</div><div className="tiny muted">fewer circuits with the projected kernel than a fidelity kernel</div></div>
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Same accuracy, far cheaper on real quantum hardware.</p>
        </div>
      </section>
    </div>
  );
}
