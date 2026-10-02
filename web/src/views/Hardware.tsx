import { useMemo, useState } from "react";
import { useApp } from "../store";
import { shotEstimate } from "../lib/analysis";
import { blochVectors, simulate } from "../lib/quantum";
import { mulberry32 } from "../lib/rng";
import { BlochSphere } from "../components/viz";
import { HW_TABLE } from "./QuantumLab";

export default function Hardware() {
  const { model, cohort, sel, setSel } = useApp();
  const [shots, setShots] = useState(1024);
  const [seed, setSeed] = useState(1);
  const n = model.n;
  // exact reference uses the encoding of the recorded hardware run when there is one
  const exactRef = useMemo(() => (cohort.featureMap ? blochVectors(simulate(model.angles[sel], cohort.edges, { ...model.spec, ...cohort.featureMap })) : model.bloch[sel]), [cohort, model, sel]);
  const est = useMemo(() => { const r = mulberry32(seed * 7919 + sel); return exactRef.map((b) => shotEstimate(b, shots, r)); }, [exactRef, sel, shots, seed]);
  const shown = cohort.measuredBloch?.[cohort.patients[sel].id] ?? est;
  const err = shown.reduce((s, v, k) => s + Math.hypot(v[0] - exactRef[k][0], v[1] - exactRef[k][1], v[2] - exactRef[k][2]), 0) / est.length;
  const projCircuits = n * 3, fidCircuits = (n * (n - 1)) / 2;
  const jobs = cohort.hardware ?? [];
  const measured = cohort.measuredBloch?.[cohort.patients[sel].id];

  return (
    <div className="grid hardware-page">
      <div className="topbar">
        <div>
          <h2 className="page-title">Hardware</h2>
          <p className="page-sub">How SANKET runs on a real IBM quantum processor, what it costs in circuits, and the record of every hardware job.</p>
        </div>
      </div>

      <section className="two hardware-summary">
        <div className="panel">
          <div className="h2">Circuit budget for the whole cohort</div>
          <p className="small muted" style={{ marginTop: 0 }}>The projected kernel needs 3 circuits per patient (measure every qubit in X, Y and Z). A fidelity kernel needs one circuit per pair of patients.</p>
          <div className="slider" style={{ margin: "10px 0 16px" }}>
            <div className="slider-head"><span>Shots per circuit</span><b>{shots.toLocaleString()}</b></div>
            <input type="range" min={6} max={13} step={1} value={Math.log2(shots)} onChange={(e) => setShots(2 ** +e.target.value)} aria-label="Shots per circuit" />
          </div>
          <table className="table">
            <thead><tr><th>Kernel</th><th>Circuits</th><th>Total shots</th><th>Two-qubit gates each</th></tr></thead>
            <tbody>
              <tr><td><b>Projected</b></td><td>{projCircuits.toLocaleString()}</td><td>{(projCircuits * shots).toLocaleString()}</td><td>{HW_TABLE[0].twoq}</td></tr>
              <tr><td>Fidelity</td><td>{fidCircuits.toLocaleString()}</td><td>{(fidCircuits * shots).toLocaleString()}</td><td>{HW_TABLE[1].twoq}</td></tr>
            </tbody>
          </table>
          <p className="small" style={{ marginBottom: 0 }}>The projected kernel needs <b>{Math.round(fidCircuits / projCircuits)}× fewer circuits</b>, which is why the full cohort fits a free-tier IBM Quantum allowance instead of a test sample.</p>
        </div>
        <div className="panel">
          <div className="h2">Hardware job record</div>
          {jobs.length ? (
            <table className="table">
              <thead><tr><th>Backend</th><th>Job ID</th><th>Date</th><th>Patients</th><th>Shots</th></tr></thead>
              <tbody>{jobs.map((j) => (<tr key={j.jobId}><td>{j.backend}{j.note && <div className="tiny muted">{j.note}</div>}</td><td style={{ wordBreak: "break-all" }}>{j.jobId}</td><td>{j.date}</td><td>{j.patients}</td><td>{j.shots}</td></tr>))}</tbody>
            </table>
          ) : (
            <div>
              <p className="small">No hardware run is recorded for this cohort yet.</p>
              <p className="small muted">Run <code>python -m engine.hardware --cohort out/cohort.json</code> with your IBM Quantum token. The job ID, backend and measured Bloch vectors are written into <code>cohort.json</code> and appear here, so the demo always shows a real, verifiable run rather than a live call that could time out.</p>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="h2">Resource efficiency</div>
        <p className="small muted" style={{ marginTop: 0 }}>What each model needs. The quantum kernels tune a single bandwidth; their cost is in circuits and shots, which the pathway wiring keeps small.</p>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Model</th><th>Qubits</th><th>Two-qubit gates per circuit</th><th>Circuits for {n} patients</th><th>Values tuned or learned</th></tr></thead>
            <tbody>
              <tr><td><b>Projected quantum kernel</b></td><td>{cohort.pathways.length}</td><td>{HW_TABLE[0].twoq}</td><td>{n.toLocaleString()} (one measurement set each)</td><td>1 bandwidth</td></tr>
              <tr><td>Fidelity quantum kernel</td><td>{cohort.pathways.length}</td><td>{HW_TABLE[1].twoq}</td><td>{fidCircuits.toLocaleString()}</td><td>1 bandwidth</td></tr>
              <tr><td>Standard ZZ quantum kernel</td><td>{cohort.pathways.length}</td><td>{HW_TABLE[3].twoq}</td><td>{fidCircuits.toLocaleString()}</td><td>1 bandwidth</td></tr>
              <tr><td>Classical RBF kernel</td><td>none</td><td>none</td><td>none</td><td>1 bandwidth</td></tr>
              <tr><td>Elastic-net Cox</td><td>none</td><td>none</td><td>none</td><td>1 penalty + {cohort.pathways.length} coefficients</td></tr>
              <tr><td>Random survival forest</td><td>none</td><td>none</td><td>none</td><td>200 trees, thousands of split rules</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <div className="h2">What finite shots look like</div>
          <span className="spacer" />
          <select value={sel} onChange={(e) => setSel(+e.target.value)} aria-label="Patient" style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
            {cohort.patients.map((p, i) => <option key={p.id} value={i}>{p.id}</option>)}
          </select>
          <button className="btn" onClick={() => setSeed((s) => s + 1)}>Sample again</button>
        </div>
        {measured
          ? <p className="small muted">Solid arrows: <b>measured</b> in the recorded job ({jobs[jobs.length - 1]?.backend}). Dashed: exact simulated state.</p>
          : <p className="small muted">Solid arrows: estimated from {shots.toLocaleString()} simulated shots per basis. Dashed: exact state. This is a sampling preview, not hardware output.</p>}
        <div className="constellation">
          {(measured ?? est).map((v, k) => (<div className="sphere-cell" key={k}><BlochSphere v={v} ghost={exactRef[k]} size={92} color="var(--teal)" /><div className="lbl">q{k} {cohort.pathways[k].short}</div></div>))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div><div className="num">{err.toFixed(3)}</div><div className="tiny muted">mean {cohort.measuredBloch?.[cohort.patients[sel].id] ? "hardware" : "estimation"} error per qubit</div></div>
          <div className="tiny muted" style={{ maxWidth: 420 }}>Error falls roughly as 1/√shots. Quadrupling shots halves it.</div>
        </div>
      </section>
    </div>
  );
}
