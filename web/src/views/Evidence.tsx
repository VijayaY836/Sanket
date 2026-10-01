import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { sizeCurve, verdict, KERNEL_LABEL } from "../lib/analysis";
import { kaplanMeier, logRank } from "../lib/survival";
import { Forest, GScale, Heatmap, LineBand, SurvivalChart, XYChart } from "../components/viz";
import { brier, calibration, decisionCurve, screeningPoint } from "../lib/clinical";
import { qubitCurve } from "../lib/experiments";

export default function Evidence() {
  const { model, nested, nestedProgress, geo, theme, cohort, large } = useApp();
  const [curve, setCurve] = useState<ReturnType<typeof sizeCurve> | null>(null);
  useEffect(() => {
    setCurve(null);
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
  const pickSummary = (picks: number[]) => {
    if (!picks.length) return "";
    const c: Record<string, number> = {};
    picks.forEach((p) => (c[p] = (c[p] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} in ${Math.round((n / picks.length) * 100)}% of folds`).join(", ");
  };

  return (
    <div className="grid">
      <div className="topbar">
        <div>
          <h2 className="page-title">Evidence</h2>
          <p className="page-sub">Does the quantum part help on this cohort? Every number here is recomputed from the loaded data, with the same tuning budget for quantum and classical models.</p>
        </div>
        {cohort.source === "synthetic" && <span className="chip chip-amber">Computed on synthetic patients</span>}
      </div>

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
            <p className="tiny muted" style={{ marginBottom: 0, display: large ? "none" : undefined }}>Information-matched: every model sees exactly the same {model.q} pathway scores, so differences come from the model, not the data. Harrell's concordance index with 95% bootstrap intervals. Nested leave-one-out: for each held-out patient, the kernel bandwidth is chosen using only the other {model.n - 1} patients. Survival model: kernel-weighted Kaplan–Meier (Beran) over the 15 most similar patients.</p>
          </>
        )}
      </section>

      <ClinicalUse />
      <QubitCurve />

      <section className="two">
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
          <SurvivalChart height={230} series={[
            { curve: groups.hi, color: "var(--eosin)", label: "Higher predicted risk" },
            { curve: groups.lo, color: "var(--teal)", label: "Lower predicted risk" },
          ]} />
          <div className="legend"><span><i style={{ background: "var(--eosin)" }} />Higher predicted risk</span><span><i style={{ background: "var(--teal)" }} />Lower predicted risk</span></div>
        </div>
      </section>

      <section className="two">
        <div className="panel">
          <div className="h2">Where would quantum help? Fewer patients</div>
          <p className="small muted" style={{ marginTop: 0 }}>Random subsets of the cohort, 25 repeats each, leave-one-out C-index. Quantum kernels are expected to matter most when data is scarce. On real data the breast cohort extends this to 2,000 patients.</p>
          {curve ? (
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
          <div className="row" style={{ alignItems: "flex-start" }}>
            <Heatmap K={model.K.proj} order={order} size={210} label="Projected quantum kernel" themeKey={theme} />
            <Heatmap K={model.K.rbf} order={order} size={210} label="Classical RBF kernel" themeKey={theme} />
          </div>
        </div>
      </section>
    </div>
  );
}

function ClinicalUse() {
  const { model, cohort } = useApp();
  const [kind, setKind] = useState<"proj" | "rbf">("proj");
  const H = cohort.horizon;
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
          <p className="small muted" style={{ margin: 0 }}>Calibration, decision-curve analysis and a screening-first referral threshold for the {H / 12}-year risk. Missing a lesion that becomes cancer costs far more than an extra review, so the threshold is set to catch 90% of progressions.</p>
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
          <XYChart diagonal xMax={calMax} yMax={calMax} xLabel={`Predicted ${H / 12}-year risk`} yLabel="Observed" height={230}
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
              <thead><tr><th>Refer if risk ≥</th><th>Progressions caught</th><th>Patients referred</th><th>Specificity</th><th>Cancer-free if not referred</th><th>Progress if referred</th></tr></thead>
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