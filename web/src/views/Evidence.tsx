import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { meanBlochLength, meanBlochLengthAt, sizeCurve, verdict, KERNEL_LABEL } from "../lib/analysis";
import { kaplanMeier, logRank } from "../lib/survival";
import { Forest, Heatmap, LineBand, SurvivalChart, XYChart } from "../components/viz";
import { brier, calibration, decisionCurve, screeningPoint } from "../lib/clinical";
import { qubitCurve } from "../lib/experiments";
import { hardwareCircuit, horizonLabel, outcomeTerms } from "../lib/cohort";
import { CardStack, Chapter, CurvesArt, PageHero, Reveal, StackItem } from "../components/cinema";
import { HW_TABLE } from "./QuantumLab";

export default function Evidence() {
  const { model, nested, nestedProgress, geo, theme, cohort, large } = useApp();
  const [curve, setCurve] = useState<ReturnType<typeof sizeCurve> | null>(null);
  useEffect(() => {
    setCurve(null);
    if (large) return;
    const t = setTimeout(() => {
      const sizes = [20, 30, 45, 60, model.n].filter((s, i, a) => s <= model.n && a.indexOf(s) === i);
      setCurve(sizeCurve(model, sizes, 25));
    }, 150);
    return () => clearTimeout(t);
  }, [model]);

  const groups = useMemo(() => {
    const r = model.loo.proj, med = [...r].sort((a, b) => a - b)[Math.floor(r.length / 2)];
    const g = r.map((v) => (v > med ? 1 : 0));
    const pick = (k: number) => { const idx = g.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0); return kaplanMeier(idx.map((i) => model.times[i]), idx.map((i) => model.events[i])); };
    return { hi: pick(1), lo: pick(0), lr: logRank(model.times, model.events, g) };
  }, [model]);
  const order = useMemo(() => model.loo.proj.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]), [model]);
  const v = nested ? verdict(nested.proj, nested.rbf) : null;
  const terms = outcomeTerms(cohort);
  const lenChosen = useMemo(() => meanBlochLength(model.bloch), [model]);
  const lenWide = useMemo(() => meanBlochLengthAt(model, 1), [model]);
  const sp = useMemo(() => screeningPoint(model.loo.proj, model.times, model.events, cohort.horizon, 0.9), [model, cohort.horizon]);
  const hw = hardwareCircuit(cohort);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const meter = (label: string, frac: number, value: string) => (
    <div className="meter-row" key={label}><span>{label}</span><span className="meter"><span style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%` }} /></span><b>{value}</b></div>
  );
  const stack: StackItem[] = [
    {
      key: "perf", kicker: "Performance", figure: nested ? nested.proj.c.toFixed(2) : "…",
      caption: nested ? `quantum C-index, against ${nested.rbf.c.toFixed(2)} for the classical kernel` : `nested cross-validation running, ${Math.round(nestedProgress * 100)}%`,
      title: v ? v.text : "Scoring every patient on models tuned without them…",
      body: <>{large ? "Large-cohort browser preview: leave-one-out, with the bandwidth chosen on all patients, so slightly optimistic; the engine runs the registered analysis." : "Each patient is predicted by a model whose bandwidth was chosen without that patient."} Quantum and classical kernels see exactly the same {model.q} pathway scores and get the same tuning budget, so any difference comes from the model.</>,
      art: nested && <>{meter(KERNEL_LABEL.proj, (nested.proj.c - 0.5) / 0.5, nested.proj.c.toFixed(3))}{meter(KERNEL_LABEL.fid, (nested.fid.c - 0.5) / 0.5, nested.fid.c.toFixed(3))}{meter(KERNEL_LABEL.rbf, (nested.rbf.c - 0.5) / 0.5, nested.rbf.c.toFixed(3))}</>,
    },
    {
      key: "why", kicker: "Why", figure: lenChosen.toFixed(3), caption: `mean qubit arrow length at bandwidth ${model.spec.scale}; 1 means no entanglement`,
      title: lenChosen > 0.98 ? "At the chosen setting, the qubits barely entangle." : "The chosen setting uses entanglement.",
      body: lenChosen > 0.98
        ? <>Cross-validation picks a gentle encoding, so the quantum kernel behaves much like a classical one on the same scores. That is consistent with the result above. The same circuit at bandwidth 1 shortens the arrows to <b>{lenWide.toFixed(3)}</b>: quantum structure is available, this outcome just does not reward it.</>
        : <>Arrows shorter than 1 mean pathway information is shared across the circuit. At bandwidth 1 the arrows shorten further, to <b>{lenWide.toFixed(3)}</b>.</>,
      art: <>{meter(`bandwidth ${model.spec.scale}`, lenChosen, lenChosen.toFixed(3))}{meter("bandwidth 1", lenWide, lenWide.toFixed(3))}</>,
    },
    {
      key: "room", kicker: "Headroom", figure: geo ? `g ${geo.proj.toFixed(1)}` : "…", caption: "geometric difference between the quantum kernel and the closest classical one",
      title: geo ? (geo.proj > 1.5 ? "There is room for quantum in principle." : "There is little room for quantum on this data.") : large ? "Computed by the engine for large cohorts." : "Measuring the room for quantum…",
      body: <>The geometric difference (Huang et al., Nature Communications 2021) is near 1 when a classical model can match the quantum one. A larger value leaves room for an advantage. Necessary, not sufficient: the outcome has to use that room too.</>,
      art: geo && meter("projected kernel", Math.log(geo.proj) / Math.log(Math.sqrt(model.n)), `g = ${geo.proj.toFixed(2)}`),
    },
    hw ? {
      key: "hw", kicker: "Hardware", figure: (hw.kernel_agreement ?? hw.correlation_with_exact ?? 0).toFixed(2),
      caption: hw.kernel_agreement != null ? `agreement between hardware and simulated kernels, ${hw.patients} patients on ${hw.backend}` : `correlation of measured with exact qubit states on ${hw.backend}`,
      title: "The model survives a real quantum processor.",
      body: <>Every patient's circuit ran on IBM's {hw.backend}, {Math.round(hw.twoQubitGates ?? 0)} two-qubit gates each.{hw.c_index_hardware_kernel != null && <> Built from hardware measurements, the kernel scores <b>{hw.c_index_hardware_kernel.toFixed(3)}</b> against <b>{hw.c_index_exact_kernel?.toFixed(3)}</b> in exact simulation of the same circuit: what noise costs, not a new accuracy claim.</>}</>,
    } : {
      key: "hw", kicker: "Hardware", figure: String(HW_TABLE[0].twoq), caption: "two-qubit gates per circuit on IBM Heron, about 5× fewer than a standard quantum feature map",
      title: "Built to fit real hardware.", body: <>No hardware run is recorded for this cohort yet. <code>python -m engine.hardware_run --backend least_busy</code> runs it and records the job here.</>,
    },
    {
      key: "clinic", kicker: "In the clinic", figure: sp ? pct(sp.sensitivity) : "–", caption: sp ? `of ${terms.progression} caught by the screening rule` : "not enough events to set a screening rule",
      title: sp ? `Refer when predicted risk is ${pct(sp.threshold)} or more.` : "A screening rule needs more events.",
      body: sp ? <>Set to catch at least 90% of {terms.progression} within {cohort.horizon / 12} years, the rule refers <b>{pct(sp.referral)}</b> of patients. Of those not referred, <b>{pct(sp.npv)}</b> stay {terms.freePast}. Leave-one-out predictions, so slightly optimistic.</> : <>Load a cohort with more outcome events to compute it.</>,
    },
  ];
  const pickSummary = (picks: number[]) => {
    if (!picks.length) return "";
    const c: Record<string, number> = {};
    picks.forEach((p) => (c[p] = (c[p] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} in ${Math.round((n / picks.length) * 100)}% of folds`).join(", ");
  };

  return (
    <div className="grid">
      <PageHero kicker="Proof · Evidence" title={<>Tested like a <em>clinical model</em>.</>}
        lede="Does the quantum part help on this cohort? Every number here is recomputed from the loaded data, with the same tuning budget for quantum and classical models."
        stats={[
          { value: nested ? nested.proj.c.toFixed(3) : "…", label: `quantum C-index (${large ? "leave-one-out" : "nested CV"})` },
          { value: nested ? nested.rbf.c.toFixed(3) : "…", label: "classical C-index, same features" },
          { value: model.n.toLocaleString(), label: "patients" },
          { value: model.events.reduce((a, b) => a + b, 0).toLocaleString(), label: terms.eventFact },
        ]}
        art={<CurvesArt hi={groups.hi} lo={groups.lo} />}>
        {cohort.source === "synthetic" && <span className="chip chip-amber">Computed on synthetic patients</span>}
      </PageHero>

      <CardStack label="The case in five findings" items={stack} />

      <Chapter n={1} title="Head to head" lede="The three kernels, scored on patients they were not tuned on." />
      <Reveal>
      <section className="panel">
        <div className="row">
          <div className="h2">{v ? v.text : "Running nested cross-validation…"}</div>
        </div>
        {!nested && (
          <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, margin: "14px 0", overflow: "hidden" }}>
            <div style={{ width: `${nestedProgress * 100}%`, height: "100%", background: "var(--violet)", transition: "width .2s" }} />
          </div>
        )}
        {nested && (
          <>
            <Forest rows={[
              { label: KERNEL_LABEL.proj, c: nested.proj.c, ci: nested.proj.ci, color: "var(--violet)", note: nested.proj.picks.length ? `Bandwidth ${pickSummary(nested.proj.picks)}` : undefined },
              { label: KERNEL_LABEL.fid, c: nested.fid.c, ci: nested.fid.ci, color: "var(--teal)", note: nested.fid.picks.length ? `Bandwidth ${pickSummary(nested.fid.picks)}` : undefined },
              { label: KERNEL_LABEL.rbf, c: nested.rbf.c, ci: nested.rbf.ci, color: "var(--ink-2)", note: nested.rbf.picks.length ? `Bandwidth ×${pickSummary(nested.rbf.picks)}` : undefined },
            ]} />
            {large && <div className="tier tier-intermediate" style={{ margin: "8px 0" }}><b>Large cohort: browser preview</b>These are leave-one-out results with the bandwidth chosen on all patients, so they are slightly optimistic. The registered full-cohort analysis (repeated cross-validation, significance tests, data-size curve) is computed by <code>python -m engine.scale</code>.</div>}
            <p className="tiny muted" style={{ marginBottom: 0, display: large ? "none" : undefined }}>{meanBlochLength(model.bloch) > 0.98 && <>At the bandwidth chosen here the quantum states are nearly unentangled (mean qubit arrow length {meanBlochLength(model.bloch).toFixed(3)}; see Constellation), which is consistent with parity. </>}Information-matched: every model sees exactly the same {model.q} pathway scores, so differences come from the model, not the data. Harrell's concordance index with 95% bootstrap intervals. Nested leave-one-out: for each held-out patient, the kernel bandwidth is chosen using only the other {model.n - 1} patients. Survival model: kernel-weighted Kaplan–Meier (Beran) over the 15 most similar patients.</p>
          </>
        )}
      </section>
      </Reveal>

      <Chapter n={2} title="In the clinic" lede={`Whether the ${horizonLabel(cohort.horizon)} risk can be trusted at face value, and what a referral rule built on it would do.`} />
      <Reveal>{large ? <LargeCohortNotice /> : <ClinicalUse />}</Reveal>
      <Chapter n={3} title="More qubits" lede="Adding pathways one biological theme at a time." />
      <Reveal><QubitCurve /></Reveal>

      <Chapter n={4} title="Room for quantum, and who it separates" />
      <Reveal className="two">
        <div className="panel">
          <div className="h2">Can quantum help on this data?</div>
          <p className="small muted" style={{ marginTop: 0 }}>Geometric difference g between the best classical kernel and each quantum kernel (Huang et al., Nature Communications 2021). If g is close to 1, a classical model can match the quantum one on this data. A larger g leaves room for an advantage: necessary, not sufficient.</p>
          {geo ? (
            <div className="grid" style={{ gap: 14 }}>
              {([["proj", "Projected quantum kernel"], ["fid", "Fidelity quantum kernel"]] as const).map(([k, l]) => (
                <div key={k}>
                  <div className="row"><b>{l}</b><span className="spacer" /><span className="num" style={{ fontSize: 24 }}>g = {geo[k].toFixed(2)}</span></div>
                  <GScale g={geo[k]} n={model.n} />
                </div>
              ))}
            </div>
          ) : <p className="small muted">{large ? "For cohorts over 150 patients this is computed by the engine (python -m engine.benchmark)." : "Computing eigendecompositions…"}</p>}
        </div>
        <div className="panel">
          <div className="row"><div className="h2">Risk groups separate</div><span className="spacer" /><span className="chip chip-violet">log-rank {groups.lr.p < 0.001 ? "p < 0.001" : `p = ${groups.lr.p.toFixed(3)}`}</span></div>
          <p className="small muted" style={{ marginTop: 0 }}>Patients split at the median leave-one-out quantum risk. Actual outcomes, Kaplan–Meier.</p>
          <SurvivalChart height={230} timeFrom={outcomeTerms(cohort).timeFrom} label="Kaplan–Meier curves by predicted risk group" series={[
            { curve: groups.hi, color: "var(--eosin)", label: "Higher predicted risk" },
            { curve: groups.lo, color: "var(--teal)", label: "Lower predicted risk" },
          ]} />
          <div className="legend"><span><i style={{ background: "var(--eosin)" }} />Higher predicted risk</span><span><i style={{ background: "var(--teal)" }} />Lower predicted risk</span></div>
        </div>
      </Reveal>

      <Chapter n={5} title="Data size and similarity" />
      <Reveal className="two">
        <div className="panel">
          <div className="h2">Where would quantum help? Fewer patients</div>
          <p className="small muted" style={{ marginTop: 0 }}>Random subsets of the cohort, 25 repeats each, leave-one-out C-index. Quantum kernels are expected to matter most when data is scarce. On real data the breast cohort extends this to 2,000 patients.</p>
          {large ? <p className="small muted">The full data-size experiment is computed by <code>python -m engine.scale</code> for this large cohort; the browser skips it so the evidence page remains interactive.</p> : curve ? (
            <>
              <LineBand xLabel="Patients in training set" series={[
                { label: "Projected quantum", color: "var(--violet)", pts: curve.map((c) => ({ x: c.size, ...c.proj })) },
                { label: "Classical RBF", color: "var(--ink-2)", pts: curve.map((c) => ({ x: c.size, ...c.rbf })) },
              ]} yRange={[0.3, 0.95]} />
              <div className="legend"><span><i style={{ background: "var(--violet)" }} />Projected quantum kernel</span><span><i style={{ background: "var(--ink-2)" }} />Classical RBF kernel</span><span>Bands show ±1 standard deviation</span></div>
            </>
          ) : <p className="small muted">Running subsampling experiment…</p>}
        </div>
        <div className="panel">
          <div className="h2">What each kernel sees</div>
          <p className="small muted" style={{ marginTop: 0 }}>Patient-by-patient similarity, sorted by predicted risk. Block structure means risk-similar patients look alike to the model.</p>
          {large ? <p className="small muted">Kernel heatmaps are omitted in the browser for 1,975 patients because rendering the full matrices would block the page. The full heatmaps are available from the engine results.</p> : (
            <div className="row" style={{ alignItems: "flex-start" }}>
              <Heatmap K={model.K.proj} order={order} size={210} label="Projected quantum kernel" themeKey={theme} />
              <Heatmap K={model.K.rbf} order={order} size={210} label="Classical RBF kernel" themeKey={theme} />
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function LargeCohortNotice() {
  return (
    <section className="panel">
      <div className="h2">Clinical usefulness</div>
      <p className="small muted" style={{ marginBottom: 0 }}>Calibration, Brier scores and decision curves for this 1,975-patient cohort are computed by the registered Python analysis so the browser stays responsive. Run <code>python -m engine.clinical --cohort out/metabric_cohort.json --repeats 1</code> and load the resulting report from the engine output.</p>
    </section>
  );
}

function GScale({ g, n }: { g: number; n: number }) {
  const max = Math.sqrt(n), pos = Math.min(Math.log(g) / Math.log(max), 1);
  return (
    <div>
      <div style={{ position: "relative", height: 10, borderRadius: 6, background: "linear-gradient(90deg, var(--surface-2), var(--violet-soft), var(--violet))", margin: "8px 0 4px" }}>
        <div style={{ position: "absolute", left: `calc(${Math.max(pos, 0) * 100}% - 7px)`, top: -4, width: 14, height: 18, borderRadius: 4, background: "var(--ink)", border: "2px solid var(--surface)" }} />
      </div>
      <div className="row tiny muted" style={{ justifyContent: "space-between" }}><span>g = 1, classical can match</span><span>g = √N = {max.toFixed(1)}, maximal room</span></div>
    </div>
  );
}

function ClinicalUse() {
  const { model, cohort } = useApp();
  const [kind, setKind] = useState<"proj" | "rbf">("proj");
  const H = cohort.horizon;
  const terms = outcomeTerms(cohort);
  const r = model.loo[kind];
  const cal = useMemo(() => calibration(r, model.times, model.events, H), [r, model, H]);
  const ths = useMemo(() => Array.from({ length: 30 }, (_, i) => 0.02 + i * 0.02), []);
  const dc = useMemo(() => decisionCurve(r, model.times, model.events, H, ths), [r, model, H, ths]);
  const sp = useMemo(() => screeningPoint(r, model.times, model.events, H, 0.9), [r, model, H]);
  const br = useMemo(() => brier(r, model.times, model.events, H), [r, model, H]);
  const calMax = Math.max(0.1, ...cal.map((c) => Math.max(c.predicted, c.observed))) * 1.15;
  const dcMax = Math.max(0.05, ...dc.map((d) => Math.max(d.model, d.referAll))) * 1.2;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <section className="panel">
      <div className="row">
        <div>
          <div className="h2">Would it help a clinician?</div>
          <p className="small muted" style={{ margin: 0 }}>Calibration, decision-curve analysis and a screening-first referral threshold for the {horizonLabel(H)} risk. {terms.missCost}, so the threshold is set to catch 90% of {terms.progression}.</p>
        </div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Model">
          <button aria-pressed={kind === "proj"} onClick={() => setKind("proj")}>Quantum kernel</button>
          <button aria-pressed={kind === "rbf"} onClick={() => setKind("rbf")}>Classical kernel</button>
        </div>
      </div>
      <div className="two" style={{ marginTop: 14 }}>
        <div>
          <b className="small">Calibration</b>
          <XYChart diagonal xMax={calMax} yMax={calMax} xLabel={`Predicted ${horizonLabel(H)} risk`} yLabel="Observed" height={230}
            series={[{ label: "model", color: kind === "proj" ? "var(--violet)" : "var(--ink-2)", pts: cal.map((c) => ({ x: c.predicted, y: c.observed })), dots: true }]} />
          <div className="tiny muted">Risk quintiles; observed = Kaplan–Meier. Points on the dashed line mean predicted risks can be taken at face value. Brier score {br.brier.toFixed(3)} (skill {br.skill >= 0 ? "+" : ""}{br.skill.toFixed(3)} vs no model).</div>
        </div>
        <div>
          <b className="small">Decision curve</b>
          <XYChart xMax={0.6} yMin={-0.05} yMax={dcMax} xLabel="Risk threshold for referral" yLabel="Net benefit" height={230} yFmt={(v) => v.toFixed(2)}
            series={[
              { label: "Refer by model", color: kind === "proj" ? "var(--violet)" : "var(--ink-2)", pts: dc.map((d) => ({ x: d.threshold, y: d.model })) },
              { label: "Refer everyone", color: "var(--ink-3)", dash: "5 4", pts: dc.map((d) => ({ x: d.threshold, y: d.referAll })) },
            ]} />
          <div className="legend"><span><i style={{ background: kind === "proj" ? "var(--violet)" : "var(--ink-2)" }} />Refer by model</span><span><i style={{ background: "var(--ink-3)" }} />Refer everyone</span><span>Zero line: refer no one</span></div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div>
          <b className="small">Screening threshold (catches ≥90%)</b>
          {sp ? (
            <div className="scroll-x"><table className="table" style={{ marginTop: 6 }}>
              <thead><tr><th>Refer if risk ≥</th><th>{terms.progression[0].toUpperCase() + terms.progression.slice(1)} caught</th><th>Patients referred</th><th>Specificity</th><th>{terms.free} if not referred</th><th>{terms.event} if referred</th></tr></thead>
              <tbody><tr><td><b>{pct(sp.threshold)}</b></td><td><b>{pct(sp.sensitivity)}</b></td><td>{pct(sp.referral)}</td><td>{pct(sp.specificity)}</td><td>{pct(sp.npv)}</td><td>{pct(sp.ppv)}</td></tr></tbody>
            </table></div>
          ) : <p className="small muted">Not enough events to set a threshold.</p>}
          <div className="tiny muted">Leave-one-out predictions with the deployed bandwidth (slightly optimistic); <code>python -m engine.clinical</code> gives fully out-of-fold estimates.</div>
        </div>
      </div>
    </section>
  );
}

function QubitCurve() {
  const { model } = useApp();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof qubitCurve>> | null>(null);
  const [p, setP] = useState<number | null>(null);
  const run = async () => { setRows(null); setP(0); setRows(await qubitCurve(model, setP)); setP(null); };
  const all = rows ? rows.flatMap((r) => [r.quantum, r.classical]) : [0.5, 0.8];
  const lo = Math.max(0.3, Math.floor((Math.min(...all) - 0.05) * 20) / 20), hi = Math.min(1, Math.ceil((Math.max(...all) + 0.03) * 20) / 20);
  return (
    <section className="panel">
      <div className="row">
        <div>
          <div className="h2">Do more qubits help?</div>
          <p className="small muted" style={{ margin: 0 }}>Pathways are added one biological theme at a time (never chosen by outcome). Quantum and classical kernels see the same pathways at every size.</p>
        </div>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={run} disabled={p !== null}>{rows ? "Run again" : "Run"}</button>
      </div>
      {p !== null && <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}><div style={{ width: `${p * 100}%`, height: "100%", background: "var(--violet)", transition: "width .2s" }} /></div>}
      {rows && (
        <div className="two" style={{ marginTop: 12 }}>
          <div>
            <XYChart xMax={12} yMin={lo} yMax={hi} xLabel="Qubits (pathways encoded)" yLabel="C-index" xFmt={(v) => String(Math.round(v))} yFmt={(v) => v.toFixed(2)} height={230}
              series={[
                { label: "Quantum", color: "var(--violet)", dots: true, pts: rows.map((r) => ({ x: r.qubits, y: r.quantum })) },
                { label: "Classical", color: "var(--ink-2)", dots: true, pts: rows.map((r) => ({ x: r.qubits, y: r.classical })) },
              ]} />
            <div className="legend"><span><i style={{ background: "var(--violet)" }} />Projected quantum kernel</span><span><i style={{ background: "var(--ink-2)" }} />Classical RBF kernel</span></div>
          </div>
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Qubits</th><th>Couplings</th><th>Quantum</th><th>Classical</th><th>Difference</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.qubits}><td>{r.qubits}</td><td>{r.couplings}</td><td><b>{r.quantum.toFixed(3)}</b></td><td>{r.classical.toFixed(3)}</td><td>{r.quantum - r.classical >= 0 ? "+" : ""}{(r.quantum - r.classical).toFixed(3)}</td></tr>)}</tbody>
            </table>
            <p className="tiny muted">Leave-one-out with the deployed bandwidths. <code>python -m engine.qubits</code> runs the cross-validated version on any cohort or diagnosis task.</p>
          </div>
        </div>
      )}
    </section>
  );
}