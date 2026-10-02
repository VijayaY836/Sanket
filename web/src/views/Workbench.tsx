import { useRef, useState } from "react";
import { useApp } from "../store";
import { syntheticCohort, validateCohort } from "../lib/cohort";
import { angleOf, blochVectors, simulate } from "../lib/quantum";
import { IDownload } from "../icons";

const MODULES = [
  { name: "Oral precancer progression", data: "GEO GSE26549, 86 patients, time to oral cancer", role: "Flagship: true early detection", match: /oral|gse26549/i },
  { name: "Early breast cancer relapse", data: "METABRIC (cBioPortal), about 1,900 patients", role: "Scale: the data-size experiment", match: /metabric|breast/i },
  { name: "Leukaemia subtype", data: "Golub AML/ALL, 72 patients", role: "Calibration against published quantum ML", match: /golub|leuk/i },
];

export default function Workbench() {
  const { cohort, setCohort } = useApp();
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seed, setSeed] = useState(26549);
  const input = useRef<HTMLInputElement>(null);
  const xin = useRef<HTMLInputElement>(null);
  const [xc, setXc] = useState<string | null>(null);
  const verify = async (f: File) => {
    try {
      const d = JSON.parse(await f.text());
      let worst = 0;
      for (const p of d.patients) {
        const b = blochVectors(simulate(p.pathways.map(angleOf), d.edges, d.spec));
        b.forEach((v, k) => v.forEach((x, c) => (worst = Math.max(worst, Math.abs(x - p.bloch[k][c])))));
      }
      setXc(`${d.patients.length} patients checked. Largest difference from Qiskit: ${worst.toExponential(1)}${worst < 1e-9 ? ", identical to numerical precision." : ". Check the feature-map settings."}`);
    } catch { setXc("Could not read that file. Use out/crosscheck.json from python -m engine.crosscheck."); }
  };

  const load = async (f: File) => {
    setErr(null);
    try { setCohort(validateCohort(JSON.parse(await f.text()))); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not read that file."); }
  };
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(cohort, null, 1)], { type: "application/json" })); a.download = "cohort.json"; a.click(); };

  return (
    <div className="grid">
      <div className="topbar">
        <div>
          <h2 className="page-title">Data</h2>
          <p className="page-sub">One pipeline for any gene-expression cohort. The research engine turns raw GEO data into a cohort file; this app re-simulates every patient from it.</p>
        </div>
      </div>

      <section className="panel">
        <div className="h2">Disease modules</div>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Module</th><th>Data</th><th>Role in the study</th><th>Status</th></tr></thead>
            <tbody>
              {MODULES.map((m, i) => (
                <tr key={m.name}><td><b>{m.name}</b></td><td>{m.data}</td><td>{m.role}</td>
                  <td>{m.match.test(cohort.name) ? <span className={`chip ${cohort.source === "real" ? "chip-teal" : "chip-amber"}`}>{cohort.source === "real" ? "Real data loaded" : "Synthetic stand-in"}</span> : <span className="chip chip-grey">Load its cohort.json</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two">
        <div className="panel">
          <div className="h2">Load a cohort</div>
          <div className="drop" data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
            <p style={{ margin: "0 0 10px" }}><b>Drop cohort.json here</b></p>
            <p className="small muted" style={{ margin: "0 0 14px" }}>Produced by <code>python -m engine.build</code>. Everything on every screen is recomputed.</p>
            <button className="btn btn-primary" onClick={() => input.current?.click()}>Choose file</button>
            <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </div>
          {err && <div className="tier tier-high" style={{ marginTop: 12 }}><b>That file could not be loaded</b>{err}</div>}
          <div className="row" style={{ marginTop: 14 }}>
            <div className="small"><b>Loaded:</b> {cohort.name}</div><span className="spacer" />
            <button className="btn" onClick={download}><IDownload /> Download cohort.json</button>
          </div>
        </div>
        <div className="panel">
          <div className="h2">Synthetic cohort</div>
          <p className="small muted" style={{ marginTop: 0 }}>For demos without real data. Patients are generated with a known progression signal so the pipeline can be checked end to end.</p>
          <div className="row">
            <label className="small">Seed <input type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} style={{ width: 110, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }} /></label>
            <button className="btn" onClick={() => setCohort(syntheticCohort(seed))}>Generate</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="row"><div className="h2">Verify against Qiskit</div><span className="spacer" />
          <button className="btn" onClick={() => xin.current?.click()}>Choose crosscheck.json</button>
          <input ref={xin} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} /></div>
        <p className="small muted" style={{ marginBottom: 0 }}>Run <code>python -m engine.crosscheck</code>, then load its output. The browser re-simulates the same patients and compares every Bloch vector with Qiskit's Statevector.</p>
        {xc && <div className="tier tier-low" style={{ marginTop: 12 }}><b>Cross-check result</b>{xc}</div>}
      </section>

      <section className="panel">
        <div className="h2">Cohort file format</div>
        <pre className="code">{`{
  "name": "GSE26549 oral premalignant lesions",
  "source": "real",
  "horizon": 36,                       // months for the headline risk
  "pathways": [{ "key": "HALLMARK_MYC_TARGETS_V1", "label": "MYC targets", "short": "MYC", "group": "Proliferation" }, ...],
  "edges": [[0, 1], [1, 2], ...],      // pathway crosstalk = qubit couplings
  "patients": [
    { "id": "GSM652749", "pathways": [0.41, -1.2, ...], "time": 42, "event": 1,
      "meta": { "histology": "Moderate dysplasia" } }
  ],
  "hardware": [{ "backend": "ibm_fez", "jobId": "...", "date": "2026-10-20", "shots": 1024, "patients": 86 }]
}`}</pre>
      </section>
    </div>
  );
}
