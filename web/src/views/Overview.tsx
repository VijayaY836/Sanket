import { useMemo } from "react";
import { useApp } from "../store";
import { predictPatient, verdict } from "../lib/analysis";
import { CountUp } from "../components/tissue";
import { Story } from "../components/story";

export default function Overview() {
  const { model, go, setSel, nested, nestedProgress, cohort, large } = useApp();
  const pair = useMemo(() => {
    const r = model.loo.proj;
    let a = -1;
    r.forEach((v, i) => { if (model.events[i] && (a < 0 || v > r[a])) a = i; });
    const hist = cohort.patients[a]?.meta?.histology;
    // a stable patient with long follow-up and a low but non-zero predicted risk, preferring the same histology
    const cands = r.map((v, i) => ({ v, i })).filter(({ v, i }) => !model.events[i] && model.times[i] > 60 && v > 0.01 && v < 0.2);
    cands.sort((x, y) => (cohort.patients[y.i].meta?.histology === hist ? 1 : 0) - (cohort.patients[x.i].meta?.histology === hist ? 1 : 0) || x.v - y.v);
    const b = cands.length ? cands[0].i : r.indexOf(Math.min(...r));
    return [a, b].map((i) => ({ i, p: cohort.patients[i], pred: predictPatient(model, i) }));
  }, [model, cohort]);
  const v = nested ? verdict(nested.proj, nested.rbf) : null;
  const followUp = [...model.times].sort((x, y) => x - y)[Math.floor(model.n / 2)];
  const storyPair = useMemo(() => pair.map(({ i, p, pred }) => ({ i, id: p.id, risk: pred.risk, curve: pred.curve, histology: p.meta?.histology })), [pair]);
  const hw = (cohort.hardware ?? []).filter((h) => !/not hardware/i.test(h.note ?? ""));
  const hwBest = hw.reduce<typeof hw[number] | null>((b, h) => (!b || h.patients > b.patients ? h : b), null);

  return (
    <div className="grid" style={{ gap: 22 }}>
      <Story cohort={cohort} model={model}
        pair={storyPair}
        stats={{
          quantum: nested ? nested.proj.c : model.cidx.proj.c, classical: nested ? nested.rbf.c : model.cidx.rbf.c,
          hwBackend: hwBest?.backend, hwPatients: hwBest?.patients,
          hwCorr: (hwBest as unknown as { correlation_with_exact?: number } | null)?.correlation_with_exact,
          hwKernel: (hwBest as unknown as { kernel_agreement?: number } | null)?.kernel_agreement,
        }}
        onOpenCase={() => { setSel(pair[0].i); go("case"); }} onEvidence={() => go("evidence")} />

      <section className="panel-flat overview-care-path" style={{ padding: "16px 20px" }}>
        <div className="row" style={{ gap: 10 }}>
          <b className="small">Where SANKET fits</b>
          {["Oral screening by a dentist", "Biopsy of the suspicious patch", "SANKET risk from the biopsy's gene activity", "Referral or routine surveillance"].map((x, i, arr) => (
            <span key={x} className="row" style={{ gap: 10 }}>
              <span className={`chip ${i === 2 ? "chip-violet" : "chip-grey"}`}>{x}</span>
              {i < arr.length - 1 && <span className="muted">→</span>}
            </span>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>Decision support after biopsy, not a replacement for it. Research prototype, not for clinical use.</div>
      </section>

      <section className="panel-flat" style={{ padding: 0 }}>
        <div className="facts-strip">
          <div className="fact"><div className="num"><CountUp value={model.n} /></div><div className="small muted">patients with precancer</div></div>
          <div className="fact"><div className="num"><CountUp value={model.events.reduce((a, b) => a + b, 0)} /></div><div className="small muted">progressed to cancer</div></div>
          <div className="fact"><div className="num"><CountUp value={followUp / 12} decimals={1} suffix="y" /></div><div className="small muted">median follow-up</div></div>
          <div className="fact"><div className="num">{model.q}</div><div className="small muted">qubits, one per pathway</div></div>
          <div className="fact"><div className="num">~5×</div><div className="small muted">fewer two-qubit gates than a standard map on IBM Heron (188 vs 906)</div></div>
          <div className="fact">
            <div className="num">{nested ? nested.proj.c.toFixed(2) : "…"}</div>
            <div className="small muted">{nested ? `quantum C-index vs ${nested.rbf.c.toFixed(2)} classical (${large ? "leave-one-out preview" : "nested CV"})` : `nested CV running, ${Math.round(nestedProgress * 100)}%`}</div>
          </div>
        </div>
      </section>

      {v && (
        <section className="panel row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h2">{v.text}</div>
            <div className="muted small">We test whether quantum can help before claiming it does. On real data this verdict is recomputed automatically.</div>
          </div>
          <button className="btn" onClick={() => go("evidence")}>Open the evidence</button>
        </section>
      )}
    </div>
  );
}
