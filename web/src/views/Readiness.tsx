import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "../store";
import {
  chooseEncoding, Column, EncodingOption, guessSetup, judge, MAX_QUBITS, MAX_ROWS, ModelScore, parseCSV, positiveLevel, Prepared,
  profile, quantumStructuredSample, ReadinessResult, reportMarkdown, runReadiness, Setup, Status, Table, toCSV, Verdict,
} from "../lib/readiness";
import { Cohort } from "../lib/cohort";
import { GScale, LineBand, PathwayGraph } from "../components/viz";
import { IDownload, IPlay, IUpload } from "../icons";
import golubCsv from "../data/golub_leukaemia.csv?raw";

interface Loaded { file: string; table: Table; cols: Column[]; sample?: "golub" | "oral" | "control" }
interface Done { prep: Prepared; options: EncodingOption[]; res: ReadinessResult; verdict: Verdict }

const STAGES = [
  { key: "encode", label: "Encode", at: 0 },
  { key: "headroom", label: "Headroom", at: 0.22 },
  { key: "structure", label: "Quantum structure", at: 0.32 },
  { key: "real", label: "Your outcome", at: 0.6 },
  { key: "verdict", label: "Verdict", at: 1 },
];
const VERDICT_STYLE: Record<Verdict["kind"], { color: string; soft: string; tag: string }> = {
  go: { color: "var(--violet)", soft: "var(--violet-soft)", tag: "Go" },
  promising: { color: "var(--amber)", soft: "var(--amber-soft)", tag: "Wait" },
  classical: { color: "var(--teal)", soft: "var(--teal-soft)", tag: "Classical" },
  data: { color: "var(--ink-2)", soft: "var(--surface-2)", tag: "More data" },
};
const ROLE_CHIP: Record<Column["role"], string> = { feature: "chip-violet", label: "chip-eosin", event: "chip-eosin", time: "chip-amber", id: "chip-grey", text: "chip-grey" };

export default function Readiness() {
  const { cohort } = useApp();
  const [data, setData] = useState<Loaded | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [prog, setProg] = useState<{ p: number; msg: string } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);

  const load = (file: string, text: string, sample?: Loaded["sample"]) => {
    setErr(null); setDone(null);
    try {
      const table = parseCSV(text), cols = profile(table);
      setData({ file, table, cols, sample });
      setSetup(guessSetup(cols));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that file."); }
  };
  const loadFile = async (f: File) => {
    if (f.size > 25e6) { setErr("That file is over 25 MB. Sample it down, or run the Python engine on the full data."); return; }
    load(f.name, await f.text());
  };
  const oralCsv = () => toCSV(["patient_id", ...cohort.pathways.map((p) => p.short), "time_months", "progressed"], cohort.patients.map((p) => [p.id, ...p.pathways, p.time, p.event]));
  const loadSample = async (k: NonNullable<Loaded["sample"]>) => {
    if (k === "golub") load("golub_leukaemia.csv", golubCsv, k);
    if (k === "oral") { load(cohort.source === "real" ? "oral_precancer_GSE26549.csv" : "oral_precancer_synthetic.csv", oralCsv(), k); }
    if (k === "control") { setProg({ p: 0, msg: "Engineering labels with quantum structure" }); load("positive_control.csv", await quantumStructuredSample(golubCsv), k); setProg(null); }
  };

  const outcomeCols = (s: Setup) => (s.kind === "binary" ? [s.label] : [s.time, s.event]);
  const features = setup && data ? setup.features.filter((f) => !outcomeCols(setup).includes(f)) : [];
  const summary = useMemo(() => {
    if (!data || !setup) return null;
    if (setup.kind === "binary") {
      const c = data.cols[setup.label];
      if (!c) return null;
      const pos = data.table.rows.filter((r) => r[setup.label].trim() === setup.positive.trim()).length;
      return `${pos} of ${data.table.rows.length - c.missing} rows have ${c.name} = ${setup.positive}`;
    }
    const tc = data.cols[setup.time], ec = data.cols[setup.event];
    if (!tc || !ec) return null;
    let yes = 0, no = 0;
    data.table.rows.forEach((r, i) => { const t = tc.values[i]; if (!Number.isFinite(t)) return; const ev = r[setup.event].trim() === setup.eventLevel.trim(); if (ev && t <= setup.horizon) yes++; else if (t > setup.horizon) no++; });
    return `${yes} with ${ec.name} by ${setup.horizon}, ${no} without; ${data.table.rows.length - yes - no} censored earlier are left out`;
  }, [data, setup]);

  const run = async () => {
    if (!data || !setup) return;
    setErr(null); setDone(null); setProg({ p: 0, msg: "Preparing" });
    try {
      const s = { ...setup, features };
      const { prep, options } = await chooseEncoding(data.table, data.cols, s, (p, msg) => setProg({ p: p * 0.08, msg }));
      const res = await runReadiness(prep, (p, msg) => setProg({ p: 0.08 + 0.92 * p, msg }));
      setDone({ prep, options, res, verdict: judge(prep, res) });
      setTimeout(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setProg(null);
  };
  const download = () => {
    if (!done || !data) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([reportMarkdown(data.file, done.prep, done.res, done.verdict)], { type: "text/markdown" }));
    a.download = `readiness_${data.file.replace(/\.[^.]+$/, "")}.md`; a.click();
  };
  const up = (patch: Partial<Setup>) => setSetup((s) => (s ? { ...s, ...patch } : s));

  return (
    <div className="grid">
      <div className="topbar">
        <div>
          <h2 className="page-title">Quantum Readiness Check</h2>
          <p className="page-sub">Bring any dataset. Before anyone spends quantum compute on it, find out whether quantum could help, using the same honest test SANKET runs on its own cancer data: equal tuning budgets, held-out data, and a positive control.</p>
        </div>
      </div>

      {/* ---------- 1. data ---------- */}
      <section className="two">
        <div className="panel">
          <div className="h2">1 · Your data</div>
          <div className="drop" data-over={over} style={{ marginTop: 10 }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}>
            <p style={{ margin: "0 0 6px" }}><b>Drop a CSV file here</b></p>
            <p className="small muted" style={{ margin: "0 0 14px" }}>One row per patient or sample, numeric feature columns, and a yes/no outcome or a time-to-event pair. Comma, semicolon or tab separated.</p>
            <button className="btn btn-primary" onClick={() => input.current?.click()}><IUpload /> Choose file</button>
            <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => { if (e.target.files?.[0]) loadFile(e.target.files[0]); e.target.value = ""; }} />
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>Your file never leaves this browser. Up to {MAX_ROWS} rows are analysed here (a stratified sample if there are more); the Python engine runs the full protocol on any size.</div>
          {err && <div className="tier tier-high" style={{ marginTop: 12 }}><b>Something is off</b>{err}</div>}
        </div>
        <div className="panel">
          <div className="h2">Or try a sample</div>
          <div className="samples">
            <SampleCard on={() => loadSample("golub")} active={data?.sample === "golub"} title="Leukaemia diagnosis" chip={<span className="chip chip-teal">real</span>}
              text="Golub et al. 1999: 72 patients, AML vs ALL, 12 Hallmark pathway scores." />
            <SampleCard on={() => loadSample("oral")} active={data?.sample === "oral"} title="Oral precancer progression"
              chip={<span className={`chip ${cohort.source === "real" ? "chip-teal" : "chip-amber"}`}>{cohort.source === "real" ? "real" : "synthetic"}</span>}
              text={`${cohort.patients.length} patients, time to oral cancer (the cohort loaded in this app).`} />
            <SampleCard on={() => loadSample("control")} active={data?.sample === "control"} title="Positive control" chip={<span className="chip chip-amber">synthetic labels</span>}
              text="The leukaemia features with labels engineered to carry quantum structure. A trustworthy check must say yes here." />
          </div>
        </div>
      </section>

      {/* ---------- 2. setup ---------- */}
      {data && setup && (
        <motion.section className="panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="row">
            <div className="h2">2 · What to predict</div>
            <span className="chip chip-grey">{data.file}</span>
            <span className="tiny muted">{data.table.rows.length} rows · {data.cols.length} columns</span>
          </div>
          <div className="scroll-x" style={{ marginTop: 10 }}>
            <table className="table preview">
              <thead><tr>{data.cols.map((c) => <th key={c.index}><div>{c.name}</div><span className={`chip ${ROLE_CHIP[roleNow(c, setup)]}`}>{roleLabel(roleNow(c, setup))}</span></th>)}</tr></thead>
              <tbody>{data.table.rows.slice(0, 4).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v.length > 12 ? v.slice(0, 11) + "…" : v}</td>)}</tr>)}</tbody>
            </table>
          </div>

          <div className="setup-grid">
            <div className="field">
              <label>Outcome type</label>
              <div className="seg" role="group" aria-label="Outcome type">
                <button aria-pressed={setup.kind === "binary"} onClick={() => up({ kind: "binary" })}>Yes / no</button>
                <button aria-pressed={setup.kind === "survival"} onClick={() => {
                  const time = setup.time >= 0 ? setup.time : data.cols.find((c) => c.numeric && c.distinct > 2)?.index ?? -1;
                  const ev = setup.event >= 0 ? setup.event : data.cols.find((c) => c.distinct === 2)?.index ?? -1;
                  const tv = time >= 0 ? data.cols[time].values.filter(Number.isFinite).sort((a, b) => a - b) : [];
                  up({ kind: "survival", time, event: ev, eventLevel: ev >= 0 ? positiveLevel(data.cols[ev].levels) : "", horizon: setup.horizon || (tv.length ? Math.round(tv[Math.floor(tv.length / 2)]) : 0) });
                }}>Time to event</button>
              </div>
            </div>
            {setup.kind === "binary" ? (
              <>
                <div className="field">
                  <label htmlFor="rc-label">Outcome column</label>
                  <select id="rc-label" className="input" value={setup.label} onChange={(e) => { const c = data.cols[+e.target.value]; up({ label: c.index, positive: positiveLevel(c.levels) }); }}>
                    <option value={-1} disabled>Choose…</option>
                    {data.cols.filter((c) => c.distinct === 2).map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}
                  </select>
                </div>
                {setup.label >= 0 && (
                  <div className="field">
                    <label>Counts as positive</label>
                    <div className="seg" role="group" aria-label="Positive class">{data.cols[setup.label].levels.map((l) => <button key={l} aria-pressed={l === setup.positive} onClick={() => up({ positive: l })}>{l}</button>)}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="rc-time">Time column</label>
                  <select id="rc-time" className="input" value={setup.time} onChange={(e) => up({ time: +e.target.value })}>
                    <option value={-1} disabled>Choose…</option>
                    {data.cols.filter((c) => c.numeric && c.distinct > 2).map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rc-event">Event column</label>
                  <select id="rc-event" className="input" value={setup.event} onChange={(e) => { const c = data.cols[+e.target.value]; up({ event: c.index, eventLevel: positiveLevel(c.levels) }); }}>
                    <option value={-1} disabled>Choose…</option>
                    {data.cols.filter((c) => c.distinct === 2).map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}
                  </select>
                </div>
                {setup.event >= 0 && (
                  <div className="field">
                    <label>Event happened when</label>
                    <div className="seg" role="group" aria-label="Event level">{data.cols[setup.event].levels.map((l) => <button key={l} aria-pressed={l === setup.eventLevel} onClick={() => up({ eventLevel: l })}>{l}</button>)}</div>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="rc-h">Horizon (same units as time)</label>
                  <input id="rc-h" className="input" type="number" min={0} value={setup.horizon} onChange={(e) => up({ horizon: +e.target.value })} style={{ width: 120 }} />
                </div>
              </>
            )}
          </div>
          {summary && <div className="small" style={{ marginTop: 6 }}><b>Outcome:</b> {summary}.</div>}

          <div className="field" style={{ marginTop: 16 }}>
            <label>Features <span className="muted">({features.length} selected)</span>
              <button className="btn btn-ghost tiny" onClick={() => up({ features: data.cols.filter((c) => c.numeric && c.role !== "id" && c.distinct > 1).map((c) => c.index) })}>all numeric</button>
              <button className="btn btn-ghost tiny" onClick={() => up({ features: [] })}>none</button>
            </label>
            <div className="feature-chips">
              {data.cols.filter((c) => c.numeric && !outcomeCols(setup).includes(c.index)).map((c) => {
                const on = setup.features.includes(c.index);
                return <button key={c.index} className="fchip" aria-pressed={on} onClick={() => up({ features: on ? setup.features.filter((f) => f !== c.index) : [...setup.features, c.index] })}>{c.name}</button>;
              })}
            </div>
          </div>

          <div className="row" style={{ marginTop: 16, alignItems: "flex-end" }}>
            <div className="field">
              <label>Qubits</label>
              <div className="row" style={{ gap: 10 }}>
                <div className="seg" role="group" aria-label="Qubit choice">
                  <button aria-pressed={setup.qubits === 0} onClick={() => up({ qubits: 0 })}>Auto (recommended)</button>
                  <button aria-pressed={setup.qubits > 0} onClick={() => up({ qubits: Math.min(features.length, 8) || 2 })}>Manual</button>
                </div>
                {setup.qubits > 0 && (
                  <label className="small row" style={{ gap: 8 }}>
                    <input type="range" min={2} max={Math.max(2, Math.min(MAX_QUBITS, features.length))} value={setup.qubits} onChange={(e) => up({ qubits: +e.target.value })} style={{ width: 140 }} />
                    <b>{setup.qubits}</b>{setup.qubits < features.length ? " principal components" : " features, one per qubit"}
                  </label>
                )}
              </div>
              <div className="tiny muted">{setup.qubits === 0 ? "Tries several qubit counts and keeps the one with the most quantum headroom. Uses the features only, never the outcome." : "Fewer qubits than features: features are compressed with PCA (label-free)."}</div>
            </div>
            <span className="spacer" />
            <button className="btn btn-primary btn-lg" onClick={run} disabled={!!prog || features.length < 2 || (setup.kind === "binary" ? setup.label < 0 : setup.time < 0 || setup.event < 0)}>
              <IPlay /> {done ? "Run again" : "Run readiness check"}
            </button>
          </div>
        </motion.section>
      )}

      {/* ---------- progress ---------- */}
      <AnimatePresence>
        {prog && (
          <motion.section className="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="stepper">
              {STAGES.map((s, i) => {
                const state = prog.p >= (STAGES[i + 1]?.at ?? 1.01) ? "done" : prog.p >= s.at ? "active" : "todo";
                return <div key={s.key} className="stepper-item" data-state={state}><span className="stepper-dot">{state === "done" ? "✓" : i + 1}</span>{s.label}</div>;
              })}
            </div>
            <div className="small muted" style={{ marginTop: 12 }}>{prog.msg}</div>
            <div className="bar"><div style={{ width: `${prog.p * 100}%` }} /></div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ---------- results ---------- */}
      {done && data && (
        <div ref={results} className="grid" style={{ scrollMarginTop: 16 }}>
          <VerdictHero v={done.verdict} control={data.sample === "control"} onDownload={download} res={done.res} />
          <div className="checks">
            {done.verdict.checks.map((c, i) => (
              <motion.div key={c.key} className="check" data-status={c.status} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }}>
                <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><StatusIcon s={c.status} /><b>{c.title}</b></div>
                <div className="check-head">{c.headline}</div>
                <div className="tiny muted">{c.detail}</div>
              </motion.div>
            ))}
          </div>

          <section className="two">
            <div className="panel">
              <div className="h2">Your outcome, held-out data</div>
              <p className="small muted" style={{ marginTop: 0 }}>{done.prep.outcome}. AUC from 4 × stratified 5-fold cross-validation; every model's settings chosen inside the training folds only. Same inputs for every model.</p>
              <ScoreBars rows={done.res.real} reference={done.res.reference} />
              <DiffBar d={done.res.diff} vs={done.res.bestClassical.label} />
              <div className="tiny muted" style={{ marginTop: 6 }}>Bandwidths the quantum model chose: {summariseScales(done.res.quantumScale)}.</div>
            </div>
            <div className="panel">
              <div className="row"><div className="h2">Could the circuit learn quantum structure?</div><span className="chip chip-amber">synthetic labels</span></div>
              <p className="small muted" style={{ marginTop: 0 }}>Labels engineered from your rows to have the structure this quantum kernel captures and the closest classical kernel cannot (Huang et al., Nature Communications 2021). Tests capacity, not your outcome.</p>
              {done.res.engineered.length ? (
                <>
                  <LineBand xLabel="Training rows" yRange={[0.3, 1]} series={[
                    { label: "Quantum kernel", color: "var(--violet)", pts: done.res.engineered.map((r) => ({ x: r.size, ...r.quantum })) },
                    { label: "Classical RBF kernel", color: "var(--ink-2)", pts: done.res.engineered.map((r) => ({ x: r.size, ...r.classical })) },
                  ]} />
                  <div className="legend"><span><i style={{ background: "var(--violet)" }} />Quantum kernel</span><span><i style={{ background: "var(--ink-2)" }} />Classical RBF kernel, tuned</span><span>Test AUC, 12 repeats, ±1 SD</span></div>
                </>
              ) : <p className="small muted">Too few rows for a learning curve.</p>}
            </div>
          </section>

          <section className="two">
            <div className="panel">
              <div className="h2">Encoding</div>
              <p className="small muted" style={{ marginTop: 0 }}>
                {done.prep.method === "pca"
                  ? `${done.prep.features.length} features compressed to ${done.prep.qubitNames.length} principal components (${Math.round(done.prep.explained * 100)}% of their variance). Components are uncorrelated, so qubits are coupled in a line, the cheapest layout on IBM's heavy-hex chips.`
                  : `One feature per qubit. Qubits are coupled where features are most correlated (${done.prep.edges.length} couplings, at most 3 per qubit), the same idea as SANKET's pathway crosstalk.`}
              </p>
              <div className="enc">
                <PathwayGraph cohort={pseudoCohort(done.prep)} size={260} />
                <div className="scroll-x">
                  <table className="table">
                    <thead><tr><th>Qubit</th><th>Carries</th></tr></thead>
                    <tbody>{done.prep.qubitNames.map((q, k) => <tr key={k}><td><b>q{k}</b> {q}</td><td className="small">{done.prep.qubitDetail[k]}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
              {done.options.length > 0 && (
                <>
                  <b className="small">Encoding search</b>
                  <div className="scroll-x"><table className="table">
                    <thead><tr><th>Qubits</th><th>Inputs</th><th>Couplings</th><th>Headroom g</th><th /></tr></thead>
                    <tbody>{done.options.map((o) => <tr key={o.qubits}><td><b>{o.qubits}</b></td><td>{o.method === "pca" ? `${Math.round(o.explained * 100)}% variance (PCA)` : "raw features"}</td><td>{o.couplings}</td><td>{o.g.toFixed(2)}</td><td>{o.chosen && <span className="chip chip-violet">chosen</span>}</td></tr>)}</tbody>
                  </table></div>
                </>
              )}
            </div>
            <div className="grid" style={{ alignContent: "start" }}>
              <div className="panel">
                <div className="h2">Quantum headroom</div>
                <p className="small muted" style={{ marginTop: 0 }}>Geometric difference between the quantum kernel and the closest of {5} classical kernels. Near 1, a classical model can reproduce anything the quantum one does on these rows.</p>
                <div className="row" style={{ alignItems: "baseline", gap: 10 }}><span className="num">g = {done.res.g.toFixed(2)}</span><span className="tiny muted">{done.res.n} rows</span></div>
                <GScale g={done.res.g} n={done.res.n} />
              </div>
              <div className="panel">
                <div className="h2">Cost on IBM hardware</div>
                <div className="scroll-x"><table className="table">
                  <thead><tr><th>Approach</th><th>Two-qubit gates</th><th>Circuits</th></tr></thead>
                  <tbody>
                    <tr><td><b>SANKET projected kernel</b></td><td><b>{done.res.cost.twoQubit}</b></td><td><b>{done.res.cost.circuits.toLocaleString()}</b></td></tr>
                    <tr><td>Standard full ZZ map, fidelity kernel</td><td>{done.res.cost.twoQubitFullZZ}</td><td>{done.res.cost.circuitsFidelity.toLocaleString()}</td></tr>
                  </tbody>
                </table></div>
                <div className="tiny muted">{done.res.cost.qubits} qubits, {done.res.cost.rzz} RZZ couplings over 2 Trotter steps; gate counts before routing (RZZ = 2 CZ on Heron). The projected kernel needs one X, Y and Z measurement circuit per row, {(done.res.cost.shots / 1e6).toFixed(2)} M shots at 1,024 each.</div>
              </div>
            </div>
          </section>

          <section className="panel-flat">
            <div className="h3">How to read this</div>
            <p className="small muted" style={{ margin: 0 }}>Headroom and quantum structure ask whether an advantage is <i>possible</i> on these inputs; only the held-out test on your outcome says whether it is <i>real</i>. All three use the same inputs and tuning budget for quantum and classical models. Analysed {done.res.n} of {done.prep.rowsLabelled} labelled rows in {done.res.seconds.toFixed(1)} s, entirely in this browser. Simulated, noise-free circuits; the Circuit and noise page shows what hardware noise does.</p>
          </section>
        </div>
      )}

      {!data && (
        <section className="panel-flat">
          <div className="steps">
            <div className="step"><div className="step-n">01</div><h3>Encode</h3><p>Your features become qubit rotations, with couplings where features move together.</p></div>
            <div className="step"><div className="step-n">02</div><h3>Headroom</h3><p>Could any quantum kernel see your rows differently from every classical one?</p></div>
            <div className="step"><div className="step-n">03</div><h3>Capacity</h3><p>On labels built to favour quantum, does this circuit actually learn faster?</p></div>
            <div className="step"><div className="step-n">04</div><h3>Fair test</h3><p>On your real outcome, held out, against tuned classical and linear models.</p></div>
          </div>
        </section>
      )}
    </div>
  );
}

function SampleCard({ title, text, chip, on, active }: { title: string; text: string; chip: JSX.Element; on: () => void; active: boolean }) {
  return (
    <button className="sample" aria-pressed={active} onClick={on}>
      <div className="row" style={{ gap: 8 }}><b>{title}</b>{chip}</div>
      <div className="small muted">{text}</div>
    </button>
  );
}

function VerdictHero({ v, control, onDownload, res }: { v: Verdict; control: boolean; onDownload: () => void; res: ReadinessResult }) {
  const st = VERDICT_STYLE[v.kind];
  return (
    <motion.section className="verdict" style={{ borderColor: st.color, background: `linear-gradient(135deg, ${st.soft}, var(--surface) 70%)` }}
      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
      <div className="verdict-main">
        <div className="row" style={{ gap: 8 }}>
          <span className="verdict-tag" style={{ background: st.color }}>{st.tag}</span>
          {control && <span className="chip chip-amber">positive control: labels are synthetic</span>}
        </div>
        <h3 className="verdict-title" style={{ color: st.color }}>{v.title}</h3>
        <p className="verdict-sum">{v.summary}</p>
        <div className="row">
          <button className="btn" onClick={onDownload}><IDownload /> Download report</button>
          <span className="tiny muted">Markdown, with every number on this page.</span>
        </div>
      </div>
      <div className="verdict-side">
        <div className="tiny muted" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Next steps</div>
        <ol>{v.next.map((x) => <li key={x}>{x}</li>)}</ol>
        <div className="verdict-nums">
          <div><div className="num">{res.real[0].auc.toFixed(2)}</div><div className="tiny muted">quantum AUC</div></div>
          <div><div className="num">{res.bestClassical.auc.toFixed(2)}</div><div className="tiny muted">best classical</div></div>
          <div><div className="num">{res.g.toFixed(1)}</div><div className="tiny muted">headroom g</div></div>
        </div>
      </div>
    </motion.section>
  );
}

function StatusIcon({ s }: { s: Status }) {
  const c = s === "pass" ? "var(--teal)" : s === "mixed" ? "var(--amber)" : "var(--eosin)";
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" aria-label={s === "pass" ? "yes" : s === "mixed" ? "partly" : "no"} style={{ flex: "none" }}>
      <circle cx={11} cy={11} r={10} fill={c} />
      {s === "pass" && <path d="M6.5 11.5l3 3 6-6.5" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {s === "mixed" && <path d="M6.5 11h9" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />}
      {s === "fail" && <path d="M7.5 7.5l7 7M14.5 7.5l-7 7" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />}
    </svg>
  );
}

function ScoreBars({ rows, reference }: { rows: ModelScore[]; reference: ModelScore | null }) {
  const lo = 0.4, hi = 1, x = (v: number) => `${((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100}%`;
  const color = { quantum: "var(--violet)", rbf: "var(--ink-2)", linear: "var(--teal)", linearAll: "var(--ink-3)" } as const;
  return (
    <div className="scorebars">
      {[...rows, ...(reference ? [reference] : [])].map((r) => (
        <div key={r.key} className="scorebar" data-ref={r.key === "linearAll" || undefined}>
          <div className="small" style={{ fontWeight: r.key === "quantum" ? 700 : 500, color: r.key === "quantum" ? "var(--violet)" : undefined }}>{r.label}</div>
          <div className="scorebar-track">
            <div className="scorebar-chance" style={{ left: x(0.5) }} />
            <motion.div className="scorebar-fill" style={{ background: color[r.key] }} initial={{ width: 0 }} animate={{ width: x(r.auc) }} transition={{ duration: 0.8 }} />
            <div className="scorebar-sd" style={{ left: x(r.auc - r.sd), width: `calc(${x(r.auc + r.sd)} - ${x(r.auc - r.sd)})` }} />
          </div>
          <div className="small"><b>{r.auc.toFixed(3)}</b> <span className="muted tiny">± {r.sd.toFixed(3)}</span></div>
        </div>
      ))}
      <div className="row tiny muted scorebar-axis"><span>AUC 0.4</span><span>0.5 = chance</span><span>1.0</span></div>
      {reference && <div className="tiny muted">The grey row is a reference, not part of the comparison: a linear model on every feature, before they are compressed onto qubits. A big gap means the encoding throws signal away.</div>}
    </div>
  );
}

function DiffBar({ d, vs }: { d: { mean: number; lo: number; hi: number }; vs: string }) {
  const R = Math.max(0.15, Math.ceil(Math.max(Math.abs(d.lo), Math.abs(d.hi)) * 20) / 20);
  const x = (v: number) => `${((v + R) / (2 * R)) * 100}%`;
  const c = d.lo > 0 ? "var(--violet)" : d.hi < 0 ? "var(--eosin)" : "var(--amber)";
  const sgn = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="small"><b>Quantum minus {vs.toLowerCase()}:</b> {sgn(d.mean)} AUC, 95% interval {sgn(d.lo)} to {sgn(d.hi)}</div>
      <div className="diffbar">
        <div className="diffbar-zero" style={{ left: x(0) }} />
        <motion.div className="diffbar-ci" style={{ background: c, left: x(d.lo), width: `calc(${x(d.hi)} - ${x(d.lo)})` }} initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ duration: 0.7 }} />
        <div className="diffbar-pt" style={{ left: x(d.mean), borderColor: c }} />
      </div>
      <div className="row tiny muted" style={{ justifyContent: "space-between" }}><span>classical better</span><span>0</span><span>quantum better</span></div>
      <div className="tiny muted">Corrected resampled t interval (Nadeau and Bengio 2003), which accounts for overlapping training folds.</div>
    </div>
  );
}

function pseudoCohort(p: Prepared): Cohort {
  return {
    name: "", disease: "", source: "real", description: "", timeUnit: "months", horizon: 0, patients: [],
    pathways: p.qubitNames.map((q, k) => ({ key: `q${k}`, label: q, short: q, group: "Proliferation" })),
    edges: p.edges,
  };
}

function roleNow(c: Column, s: Setup): Column["role"] {
  if (s.kind === "binary" && c.index === s.label) return "label";
  if (s.kind === "survival" && c.index === s.time) return "time";
  if (s.kind === "survival" && c.index === s.event) return "event";
  if (s.features.includes(c.index)) return "feature";
  return c.role === "feature" || c.role === "label" || c.role === "event" || c.role === "time" ? "text" : c.role;
}
const roleLabel = (r: Column["role"]) => ({ feature: "feature", label: "outcome", event: "event", time: "time", id: "id", text: "ignored" })[r];

function summariseScales(v: number[]) {
  const counts = new Map<number, number>();
  v.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s} in ${Math.round((100 * c) / v.length)}% of folds`).join(", ");
}
