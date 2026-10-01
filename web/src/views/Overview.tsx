import { useMemo } from "react";
import { useApp } from "../store";
import { predictPatient, verdict } from "../lib/analysis";
import { SurvivalChart } from "../components/viz";
import { IPlay } from "../icons";

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

  return (
    <div className="grid" style={{ gap: 22 }}>
      <section className="panel hero">
        <div>
          <h1>Same white patch. Two different futures.</h1>
          <p>About one in five oral precancers turns into cancer, and doctors cannot tell which. SANKET reads the gene activity in a biopsy, encodes it into a quantum circuit wired like the biology, and estimates whether and when a lesion will become cancer.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => { setSel(pair[0].i); go("case"); }}><IPlay /> Open a patient case</button>
            <button className="btn" onClick={() => go("evidence")}>See the evidence</button>
          </div>
        </div>
        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            {pair.map(({ p, pred }, k) => (
              <div key={p.id} style={{ flex: 1, minWidth: 150 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: k === 0 ? "var(--eosin)" : "var(--teal)" }} />
                  <b>{p.id}</b>
                  <span className="muted small">{p.meta?.histology}</span>
                </div>
                <div className="small muted">{Math.round(pred.risk * 100)}% predicted 3-year risk</div>
              </div>
            ))}
          </div>
          <SurvivalChart horizon={cohort.horizon} height={250} series={[
            { curve: pair[0].pred.curve, color: "var(--eosin)", label: pair[0].p.id },
            { curve: pair[1].pred.curve, color: "var(--teal)", label: pair[1].p.id },
            { curve: model.km, color: "var(--ink-3)", label: "Cohort", dash: "4 4", width: 1.5 },
          ]} />
          <div className="legend"><span><i style={{ background: "var(--ink-3)" }} />Whole cohort</span><span>Predictions are leave-one-out: each patient is scored as if new.</span></div>
        </div>
      </section>

      <section className="panel-flat" style={{ padding: 0 }}>
        <div className="steps">
          {[
            ["1", "Genes", "A biopsy's 20,000 gene activities, measured once."],
            ["2", "Pathways", "Compressed into 12 biological pathway scores a biologist can read."],
            ["3", "Qubits", "One pathway per qubit, entangled only where the pathways interact."],
            ["4", "Time to cancer", "Similar patients in quantum feature space give a survival curve."],
          ].map(([n, t, d]) => (
            <div className="step" key={n}><div className="step-n">Step {n}</div><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="panel-flat" style={{ padding: "16px 20px" }}>
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
          <div className="fact"><div className="num">{model.n}</div><div className="small muted">patients with precancer</div></div>
          <div className="fact"><div className="num">{model.events.reduce((a, b) => a + b, 0)}</div><div className="small muted">progressed to cancer</div></div>
          <div className="fact"><div className="num">{(followUp / 12).toFixed(1)}y</div><div className="small muted">median follow-up</div></div>
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