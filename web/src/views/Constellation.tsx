import { useMemo, useState } from "react";
import { useApp } from "../store";
import { predictPatient, sqDist3 } from "../lib/analysis";
import { Bars, BlochSphere } from "../components/viz";

type Mode = "progressor" | "stable" | "pick";

export default function Constellation() {
  const { model, cohort, sel, setSel } = useApp();
  const [mode, setMode] = useState<Mode>("stable");
  const [pick, setPick] = useState(0);
  const pred = useMemo(() => predictPatient(model, sel), [model, sel]);
  const other = useMemo(() => {
    if (mode === "pick") return pick === sel ? (sel + 1) % model.n : pick;
    const want = mode === "progressor" ? 1 : 0;
    const row = model.K.proj[sel];
    let best = -1;
    row.forEach((v, j) => { if (j !== sel && model.events[j] === want && (want === 1 || model.times[j] > 48) && (best < 0 || v > row[best])) best = j; });
    return best < 0 ? (sel + 1) % model.n : best;
  }, [mode, pick, sel, model]);
  const a = model.bloch[sel], b = model.bloch[other];
  const sim = model.K.proj[sel][other];
  const perQubit = a.map((v, k) => (v[0] - b[k][0]) ** 2 + (v[1] - b[k][1]) ** 2 + (v[2] - b[k][2]) ** 2);
  const total = sqDist3(a, b);
  const P = cohort.patients[sel], O = cohort.patients[other];
  const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

  return (
    <div className="grid">
      <div className="topbar">
        <div>
          <h2 className="page-title">Bloch constellation</h2>
          <p className="page-sub">Each patient becomes 12 qubit states, one per pathway. The projected quantum kernel compares exactly these arrows, so what you see is the model's own notion of similarity.</p>
        </div>
      </div>

      <section className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <label className="small">Patient&nbsp;
            <select value={sel} onChange={(e) => setSel(+e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
              {cohort.patients.map((p, i) => <option key={p.id} value={i}>{p.id}</option>)}
            </select>
          </label>
          <span className="small muted">compared with</span>
          <div className="seg" role="group" aria-label="Comparison patient">
            <button aria-pressed={mode === "stable"} onClick={() => setMode("stable")}>Most similar stable patient</button>
            <button aria-pressed={mode === "progressor"} onClick={() => setMode("progressor")}>Most similar progressor</button>
            <button aria-pressed={mode === "pick"} onClick={() => setMode("pick")}>Choose</button>
          </div>
          {mode === "pick" && (
            <select value={pick} onChange={(e) => setPick(+e.target.value)} aria-label="Comparison patient" style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
              {cohort.patients.map((p, i) => <option key={p.id} value={i}>{p.id}</option>)}
            </select>
          )}
        </div>
        <div className="legend" style={{ marginBottom: 10 }}>
          <span><i style={{ background: "var(--violet)" }} />{P.id}, {Math.round(pred.risk * 100)}% predicted risk</span>
          <span><i style={{ background: "var(--ink-3)" }} />{O.id}, {O.event ? `progressed at ${(O.time / 12).toFixed(1)}y` : `cancer-free ${(O.time / 12).toFixed(1)}y`}</span>
        </div>
        <div className="constellation">
          {cohort.pathways.map((pw, k) => (
            <div className="sphere-cell" key={pw.key} style={{ background: perQubit[k] > total / cohort.pathways.length * 1.6 ? "var(--violet-soft)" : "transparent" }}>
              <BlochSphere v={a[k]} ghost={b[k]} size={104} />
              <div className="lbl">q{k} {pw.short}</div>
              <div className="tiny muted">length {len(a[k]).toFixed(2)}</div>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Arrows shorter than 1 mean that qubit is entangled with its neighbours: its pathway's information is shared across the circuit. Highlighted cells are where the two patients differ most.</p>
      </section>

      <section className="two">
        <div className="panel">
          <div className="h2">Quantum similarity</div>
          <div className="num-l" style={{ margin: "10px 0 6px" }}>{sim.toFixed(3)}</div>
          <p className="small muted" style={{ margin: 0 }}>k = exp(−γ Σ‖r<sub>k</sub> − r′<sub>k</sub>‖²) with γ = {model.gammaQ.toFixed(3)}, bandwidth {model.spec.scale} chosen by cross-validation. 1 means identical states.</p>
        </div>
        <div className="panel">
          <div className="h2">Where they differ</div>
          <p className="small muted" style={{ marginTop: 0 }}>Squared distance between the two arrows on each qubit.</p>
          <Bars oneSided domain={Math.max(...perQubit, 0.1)} items={cohort.pathways.map((pw, k) => ({ label: pw.short, value: perQubit[k] })).sort((x, y) => y.value - x.value).slice(0, 6)} format={(v) => v.toFixed(2)} />
        </div>
      </section>
    </div>
  );
}
