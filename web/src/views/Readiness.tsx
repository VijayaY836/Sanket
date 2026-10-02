import { useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { distinctValues, numericColumns, Outcome, parseCSV, ReadinessReport, runReadiness, Table } from "../lib/readiness";
import { LineBand, PathwayGraph } from "../components/viz";
import { Cohort } from "../lib/cohort";
import { IPlay } from "../icons";

type OutKind = Outcome["kind"];
const sel = { padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", maxWidth: "100%" } as const;

export default function Readiness() {
  const { cohort } = useApp();
  const [table, setTable] = useState<Table | null>(null);
  const [name, setName] = useState("");
  const [feats, setFeats] = useState<number[]>([]);
  const [kind, setKind] = useState<OutKind>("none");
  const [col, setCol] = useState(-1);
  const [pos, setPos] = useState("");
  const [timeCol, setTimeCol] = useState(-1);
  const [eventCol, setEventCol] = useState(-1);
  const [eventPos, setEventPos] = useState("");
  const [horizon, setHorizon] = useState(36);
  const [prog, setProg] = useState<{ p: number; msg: string } | null>(null);
  const [rep, setRep] = useState<ReadinessReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const numeric = useMemo(() => (table ? numericColumns(table) : []), [table]);

  const accept = (t: Table, nm: string) => {
    setTable(t); setName(nm); setRep(null); setErr(null);
    const nc = numericColumns(t);
    setFeats(nc.slice(0, Math.min(nc.length, 12)));
    setKind("none"); setCol(-1); setTimeCol(-1); setEventCol(-1);
  };
  const loadFile = async (f: File) => {
    try {
      const t = parseCSV(await f.text());
      if (t.headers.length < 2 || t.rows.length < 10) throw new Error("The file needs a header row and at least 10 data rows.");
      accept(t, f.name);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that file."); }
  };
  const useCohort = (c: Cohort) => {
    const headers = [...c.pathways.map((p) => p.short), "time_months", "event"];
    const rows = c.patients.map((p) => [...p.pathways.map(String), String(p.time), String(p.event)]);
    const t = { headers, rows };
    accept(t, c.name);
    setFeats(c.pathways.map((_, i) => i));
    setKind("survival"); setTimeCol(headers.length - 2); setEventCol(headers.length - 1); setEventPos("1"); setHorizon(c.horizon);
  };
  const outcome = (): Outcome => {
    if (kind === "binary" && col >= 0 && pos) return { kind, col, positive: pos };
    if (kind === "survival" && timeCol >= 0 && eventCol >= 0 && eventPos) return { kind, timeCol, eventCol, eventPositive: eventPos, horizon };
    return { kind: "none" };
  };
  const outcomeCols = new Set(kind === "binary" ? [col] : kind === "survival" ? [timeCol, eventCol] : []);
  const featList = feats.filter((j) => !outcomeCols.has(j));
  const ready = table && featList.length >= 2 && (kind === "none" || outcome().kind !== "none");
  const run = async () => {
    if (!table) return;
    setErr(null); setRep(null); setProg({ p: 0, msg: "Starting" });
    try { setRep(await runReadiness({ table, features: featList, outcome: outcome(), name }, (p, msg) => setProg({ p, msg }))); }
    catch (e) { setErr(e instanceof Error ? e.message : "The check failed."); }
    setProg(null);
  };

  return (
    <div className="grid">
      <div className="topbar">
        <div>
          <h2 className="page-title">Quantum readiness check</h2>
          <p className="page-sub">Is it worth running quantum models on your data? Upload a table and SANKET measures how much room quantum has, shows what an advantage would look like, and tests your real outcome against classical models.</p>
        </div>
      </div>

      <section className="two">
        <div className="panel">
          <div className="h2">1 · Choose data</div>
          <div className="drop" data-over={over} style={{ marginTop: 10 }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}>
            <p style={{ margin: "0 0 8px" }}><b>Drop a CSV file here</b></p>
            <p className="small muted" style={{ margin: "0 0 12px" }}>Rows are patients or samples; columns are numeric measurements, plus an optional outcome. Comma, semicolon or tab separated.</p>
            <button className="btn btn-primary" onClick={() => input.current?.click()}>Choose file</button>
            <input ref={input} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="small muted">or</span>
            <button className="btn" onClick={() => useCohort(cohort)}>Use the loaded cohort ({cohort.patients.length} patients)</button>
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Everything runs in your browser; the file never leaves this device. Up to 200 rows are used (a random sample if larger).</p>
        </div>

        <div className="panel">
          <div className="h2">2 · Configure</div>
          {!table ? <p className="small muted">Choose data first.</p> : (
            <div className="grid" style={{ gap: 12, marginTop: 8 }}>
              <div className="small"><b>{name}</b> · {table.rows.length} rows · {numeric.length} numeric columns</div>
              <div>
                <div className="row" style={{ marginBottom: 6 }}>
                  <b className="small">Features to encode</b><span className="tiny muted">{featList.length} selected{featList.length > 12 ? " → compressed to 12 qubits with PCA" : ` → ${featList.length} qubits`}</span>
                  <span className="spacer" />
                  <button className="btn btn-ghost" style={{ padding: "3px 8px" }} onClick={() => setFeats(numeric)}>All</button>
                  <button className="btn btn-ghost" style={{ padding: "3px 8px" }} onClick={() => setFeats([])}>None</button>
                </div>
                <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {numeric.map((j) => (
                    <label key={j} className="chip chip-grey" style={{ cursor: "pointer", opacity: outcomeCols.has(j) ? 0.4 : 1 }}>
                      <input type="checkbox" checked={feats.includes(j)} disabled={outcomeCols.has(j)} onChange={(e) => setFeats((f) => (e.target.checked ? [...f, j] : f.filter((x) => x !== j)))} />
                      {table.headers[j]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="row">
                <b className="small">Outcome</b>
                <div className="seg" role="group" aria-label="Outcome type">
                  <button aria-pressed={kind === "none"} onClick={() => setKind("none")}>None</button>
                  <button aria-pressed={kind === "binary"} onClick={() => setKind("binary")}>Yes / no label</button>
                  <button aria-pressed={kind === "survival"} onClick={() => setKind("survival")}>Time to event</button>
                </div>
              </div>
              {kind === "binary" && (
                <div className="row">
                  <select style={sel} value={col} onChange={(e) => { setCol(+e.target.value); setPos(""); }} aria-label="Label column">
                    <option value={-1}>Label column…</option>
                    {table.headers.map((h, j) => <option key={j} value={j}>{h}</option>)}
                  </select>
                  {col >= 0 && (
                    <select style={sel} value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Positive value">
                      <option value="">Positive value…</option>
                      {distinctValues(table, col).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                </div>
              )}
              {kind === "survival" && (
                <div className="row">
                  <select style={sel} value={timeCol} onChange={(e) => setTimeCol(+e.target.value)} aria-label="Time column">
                    <option value={-1}>Time column…</option>
                    {numeric.map((j) => <option key={j} value={j}>{table.headers[j]}</option>)}
                  </select>
                  <select style={sel} value={eventCol} onChange={(e) => { setEventCol(+e.target.value); setEventPos(""); }} aria-label="Event column">
                    <option value={-1}>Event column…</option>
                    {table.headers.map((h, j) => <option key={j} value={j}>{h}</option>)}
                  </select>
                  {eventCol >= 0 && (
                    <select style={sel} value={eventPos} onChange={(e) => setEventPos(e.target.value)} aria-label="Event value">
                      <option value="">Event value…</option>
                      {distinctValues(table, eventCol).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                  <label className="small">Horizon <input type="number" value={horizon} onChange={(e) => setHorizon(+e.target.value)} style={{ ...sel, width: 80 }} /> time units</label>
                </div>
              )}
              <button className="btn btn-primary" disabled={!ready || !!prog} onClick={run} style={{ justifySelf: "start" }}><IPlay /> Run readiness check</button>
            </div>
          )}
        </div>
      </section>

      {err && <div className="tier tier-high"><b>Could not run the check</b>{err}</div>}
      {prog && (
        <section className="panel">
          <div className="small muted">{prog.msg}</div>
          <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, marginTop: 8, overflow: "hidden" }}><div style={{ width: `${prog.p * 100}%`, height: "100%", background: "var(--violet)", transition: "width .2s" }} /></div>
        </section>
      )}
      {rep && <Report rep={rep} />}
    </div>
  );
}

function Report({ rep }: { rep: ReadinessReport }) {
  const tone = rep.verdict.recommend === "quantum" ? "tier-low" : rep.verdict.recommend === "explore" ? "tier-intermediate" : "tier-uncertain";
  const fakeCohort = { pathways: rep.qubitLabels.map((l, i) => ({ key: `q${i}`, label: l, short: l.length > 7 ? l.slice(0, 6) + "…" : l, group: "Proliferation" as const })), edges: rep.edges } as unknown as Cohort;
  const pos = Math.min(Math.log(Math.max(rep.gBest, 1)) / Math.log(Math.sqrt(Math.min(rep.n, 120))), 1);
  return (
    <>
      <section className="panel">
        <div className="row"><span className="chip chip-violet">Verdict</span><span className="tiny muted">{rep.name} · {rep.n} rows · {rep.qubits} qubits</span></div>
        <div className={`tier ${tone}`} style={{ marginTop: 10 }}><b style={{ fontSize: 18 }}>{rep.verdict.title}</b>{rep.verdict.text}</div>
      </section>

      <section className="two">
        <div className="panel">
          <div className="h2">Quantum headroom</div>
          <div className="num-l" style={{ margin: "8px 0 4px" }}>g = {rep.gBest.toFixed(2)}</div>
          <span className={`chip ${rep.headroom === "low" ? "chip-grey" : rep.headroom === "moderate" ? "chip-amber" : "chip-violet"}`}>{rep.headroom} headroom</span>
          <div style={{ position: "relative", height: 10, borderRadius: 6, background: "linear-gradient(90deg, var(--surface-2), var(--violet-soft), var(--violet))", margin: "14px 0 4px" }}>
            <div style={{ position: "absolute", left: `calc(${pos * 100}% - 7px)`, top: -4, width: 14, height: 18, borderRadius: 4, background: "var(--ink)", border: "2px solid var(--surface)" }} />
          </div>
          <div className="row tiny muted" style={{ justifyContent: "space-between" }}><span>1: classical can match</span><span>√N: maximal</span></div>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>Quantum bandwidth</th><th>g vs closest classical</th></tr></thead>
            <tbody>{rep.scan.map((s) => <tr key={s.scale}><td>{s.scale}</td><td><b>{s.g.toFixed(2)}</b> <span className="tiny muted">(RBF ×{s.closest})</span></td></tr>)}</tbody>
          </table>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Geometric difference (Huang et al., Nature Communications 2021). Bands are a guide: under 1.5 low, 1.5–3 moderate, above 3 substantial. Necessary for an advantage, not sufficient.</p>
        </div>

        <div className="panel">
          <div className="row"><div className="h2">What an advantage would look like</div></div>
          <span className="chip chip-amber">engineered labels, synthetic</span>
          {rep.demo.length ? (
            <>
              <LineBand xLabel="Training rows" yRange={[0.3, 1]} series={[
                { label: "Quantum kernel", color: "var(--violet)", pts: rep.demo.map((d) => ({ x: d.size, mean: d.quantum, sd: 0 })) },
                { label: "Classical kernel", color: "var(--ink-2)", pts: rep.demo.map((d) => ({ x: d.size, mean: d.classical, sd: 0 })) },
              ]} />
              <div className="legend"><span><i style={{ background: "var(--violet)" }} />Quantum kernel</span><span><i style={{ background: "var(--ink-2)" }} />Classical kernel, tuned</span></div>
            </>
          ) : <p className="small muted">Not enough rows for the demonstration.</p>}
          <p className="tiny muted" style={{ marginBottom: 0 }}>Labels built from the quantum kernel on your own features. They show the size of the room, not a result about your outcome.</p>
        </div>
      </section>

      <section className="two">
        <div className="panel">
          <div className="h2">Your real outcome</div>
          {rep.real ? (
            <>
              <table className="table">
                <thead><tr><th>Model</th><th>AUC</th></tr></thead>
                <tbody>
                  <tr><td style={{ color: "var(--violet)", fontWeight: 700 }}>Quantum kernel</td><td><b>{rep.real.quantum.mean.toFixed(3)}</b> <span className="tiny muted">± {rep.real.quantum.sd.toFixed(3)}</span></td></tr>
                  <tr><td>Classical RBF kernel</td><td><b>{rep.real.classical.mean.toFixed(3)}</b> <span className="tiny muted">± {rep.real.classical.sd.toFixed(3)}</span></td></tr>
                  <tr><td>Linear model</td><td><b>{rep.real.linear.mean.toFixed(3)}</b> <span className="tiny muted">± {rep.real.linear.sd.toFixed(3)}</span></td></tr>
                </tbody>
              </table>
              <p className="tiny muted" style={{ marginBottom: 0 }}>{rep.real.n} rows with a known outcome ({rep.real.positives} positive). 3 × repeated 5-fold cross-validation, equal tuning for every model. A quick check: confirm any lead with the engine's corrected tests.</p>
            </>
          ) : <p className="small muted">No outcome given. Add a label or time-to-event column to test whether your outcome uses the quantum headroom.</p>}
          <div className="h3" style={{ marginTop: 18 }}>Hardware cost if you go quantum</div>
          <div className="row" style={{ gap: 28, marginTop: 6 }}>
            <div><div className="num">{rep.circuits.projected.toLocaleString()}</div><div className="tiny muted">circuits, projected kernel (one measurement set per row)</div></div>
            <div><div className="num">{rep.circuits.fidelity.toLocaleString()}</div><div className="tiny muted">circuits, fidelity kernel (one per pair of rows)</div></div>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>{rep.verdict.recommend === "classical" ? "Recommendation: save the quantum budget and deploy the classical model." : "Recommendation: worth a registered quantum study, using the projected kernel to keep hardware cost low."}</p>
        </div>
        <div className="panel">
          <div className="h2">How your data was encoded</div>
          <p className="small muted" style={{ marginTop: 0 }}>{rep.usedPCA ? `${rep.nFeatures} features compressed to 12 principal components (${Math.round((rep.explained ?? 0) * 100)}% of variance), one per qubit.` : `${rep.qubits} features, one per qubit.`} Qubits are coupled where features are most correlated: a label-free graph, at most 3 links per qubit.</p>
          <PathwayGraph cohort={fakeCohort} size={280} />
        </div>
      </section>
    </>
  );
}