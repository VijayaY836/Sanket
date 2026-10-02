import { useMemo, useState } from "react";
import { useApp } from "../store";
import { OrbitArt, PageHero, Reveal } from "../components/cinema";
import { blochAt, meanBlochLength, meanBlochLengthAt, predictPatient, sqDist3 } from "../lib/analysis";
import { Bars, BlochSphere } from "../components/viz";
import { outcomeTerms } from "../lib/cohort";

type Mode = "progressor" | "stable" | "pick";
const WIDE = 1.0; // comparison bandwidth: same circuit, larger rotations

export default function Constellation() {
  const { model, cohort, sel, setSel } = useApp();
  const [mode, setMode] = useState<Mode>("stable");
  const [pick, setPick] = useState(0);
  const [wide, setWide] = useState(false);
  const pred = useMemo(() => predictPatient(model, sel), [model, sel]);
  const other = useMemo(() => {
    if (mode === "pick") return pick === sel ? (sel + 1) % model.n : pick;
    const want = mode === "progressor" ? 1 : 0;
    const row = model.K.proj[sel];
    let best = -1;
    row.forEach((v, j) => { if (j !== sel && model.events[j] === want && (want === 1 || model.times[j] > 48) && (best < 0 || v > row[best])) best = j; });
    return best < 0 ? (sel + 1) % model.n : best;
  }, [mode, pick, sel, model]);
  const a = useMemo(() => (wide ? blochAt(model, sel, WIDE) : model.bloch[sel]), [wide, model, sel]);
  const b = useMemo(() => (wide ? blochAt(model, other, WIDE) : model.bloch[other]), [wide, model, other]);
  const lenChosen = useMemo(() => meanBlochLength(model.bloch), [model]);
  const lenWide = useMemo(() => meanBlochLengthAt(model, WIDE), [model]);
  const nearlyProduct = lenChosen > 0.98;
  const sim = model.K.proj[sel][other];
  const perQubit = a.map((v, k) => (v[0] - b[k][0]) ** 2 + (v[1] - b[k][1]) ** 2 + (v[2] - b[k][2]) ** 2);
  const total = sqDist3(a, b);
  const P = cohort.patients[sel], O = cohort.patients[other];
  const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

  return (
    <div className="grid">
      <PageHero kicker="Quantum · Constellation" title={<>Every patient, as <em>{cohort.pathways.length} qubits</em>.</>}
        lede="Each patient becomes one qubit state per pathway. The projected quantum kernel compares exactly these arrows, so what you see is the model's own notion of similarity."
        stats={[
          { value: model.n.toLocaleString(), label: "patients encoded" },
          { value: model.spec.scale, label: "bandwidth chosen by cross-validation" },
          { value: lenChosen.toFixed(3), label: "mean arrow length (1 = no entanglement)" },
          { value: cohort.edges.length, label: "pathway couplings wired in" },
        ]}
        art={<OrbitArt n={cohort.pathways.length} edges={cohort.edges} />} />

      <Reveal className="panel">
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
          <span className="spacer" />
          <div className="seg" role="group" aria-label="Bandwidth shown">
            <button aria-pressed={!wide} onClick={() => setWide(false)}>Bandwidth {model.spec.scale} (model)</button>
            <button aria-pressed={wide} onClick={() => setWide(true)}>Bandwidth {WIDE} (comparison)</button>
          </div>
          {mode === "pick" && (
            <select value={pick} onChange={(e) => setPick(+e.target.value)} aria-label="Comparison patient" style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
              {cohort.patients.map((p, i) => <option key={p.id} value={i}>{p.id}</option>)}
            </select>
          )}
        </div>
        <div className="legend" style={{ marginBottom: 10 }}>
          <span><i style={{ background: "var(--violet)" }} />{P.id}, {Math.round(pred.risk * 100)}% predicted risk</span>
          <span><i style={{ background: "var(--ink-3)" }} />{O.id}, {O.event ? `${outcomeTerms(cohort).eventPast} at ${(O.time / 12).toFixed(1)}y` : `${outcomeTerms(cohort).freePast} ${(O.time / 12).toFixed(1)}y`}</span>
        </div>
        <div className="constellation">
          {cohort.pathways.map((pw, k) => (
            <div className="sphere-cell" key={pw.key} style={{ background: perQubit[k] > total / cohort.pathways.length * 1.6 ? "var(--violet-soft)" : "transparent" }}>
              <BlochSphere v={a[k]} ghost={b[k]} size={104} />
              <div className="lbl">q{k} {pw.short}</div>
              <div className="tiny muted">length {len(a[k]).toFixed(3)}</div>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Arrows shorter than 1 mean that qubit is entangled with its neighbours: its pathway's information is shared across the circuit. Highlighted cells are where the two patients differ most.{wide && " Showing the comparison bandwidth; the model and the similarity below use the chosen one."}</p>
      </Reveal>

      <Reveal className="panel">
        <div className="h2">How entangled are these states?</div>
        <div className="row" style={{ gap: 28, margin: "10px 0" }}>
          <div><div className="num">{lenChosen.toFixed(3)}</div><div className="tiny muted">mean arrow length at bandwidth {model.spec.scale}, chosen by cross-validation</div></div>
          <div><div className="num">{lenWide.toFixed(3)}</div><div className="tiny muted">same circuit at bandwidth {WIDE}</div></div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {nearlyProduct
            ? <>At the bandwidth cross-validation picks, the qubits are barely entangled: each arrow keeps almost its full length, so the quantum kernel behaves much like a classical kernel on the same pathway scores. That is consistent with quantum and classical performing at parity on this cohort. At bandwidth {WIDE} the same circuit entangles strongly, but on this outcome cross-validation does not reward it. Quantum structure is available; this data does not use it.</>
            : <>At the chosen bandwidth the arrows are noticeably shorter than 1, so the kernel uses entanglement between pathways. At bandwidth {WIDE} they shorten further.</>}
        </p>
      </Reveal>

      <Reveal className="two">
        <div className="panel">
          <div className="h2">Quantum similarity</div>
          <div className="num-l" style={{ margin: "10px 0 6px" }}>{sim.toFixed(3)}</div>
          <p className="small muted" style={{ margin: 0 }}>k = exp(−γ Σ‖r<sub>k</sub> − r′<sub>k</sub>‖²) with γ = {model.gammaQ.toFixed(3)}, bandwidth {model.spec.scale} chosen by cross-validation. 1 means identical states. Mean arrow length {lenChosen.toFixed(3)}.</p>
        </div>
        <div className="panel">
          <div className="h2">Where they differ</div>
          <p className="small muted" style={{ marginTop: 0 }}>Squared distance between the two arrows on each qubit.</p>
          <Bars oneSided domain={Math.max(...perQubit, 0.1)} items={cohort.pathways.map((pw, k) => ({ label: pw.short, value: perQubit[k] })).sort((x, y) => y.value - x.value).slice(0, 6)} format={(v) => v.toFixed(2)} />
        </div>
      </Reveal>
    </div>
  );
}
