import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { sizeCurve, verdict, KERNEL_LABEL } from "../lib/analysis";
import { kaplanMeier, logRank } from "../lib/survival";
import { Forest, Heatmap, LineBand, SurvivalChart } from "../components/viz";

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
            <p className="tiny muted" style={{ marginBottom: 0, display: large ? "none" : undefined }}>Harrell's concordance index with 95% bootstrap intervals. Nested leave-one-out: for each held-out patient, the kernel bandwidth is chosen using only the other {model.n - 1} patients. Survival model: kernel-weighted Kaplan–Meier (Beran) over the 15 most similar patients.</p>
          </>
        )}
      </section>

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