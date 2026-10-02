import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "../store";
import { attribution, predictPatient, Prediction, whatIf } from "../lib/analysis";
import { Bars, GeneStrip, PathwayGraph, pct, SurvivalChart } from "../components/viz";
import { screeningPoint } from "../lib/clinical";
import { CaseHero } from "../components/caseHero";
import { survivalAt } from "../lib/survival";
import { IDownload } from "../icons";

const TIER: Record<Prediction["tier"], { title: string; action: string; color: string }> = {
  high: { title: "High risk of progression", action: "Consider referral to oral oncology and close surveillance.", color: "var(--eosin)" },
  intermediate: { title: "Intermediate risk", action: "Consider shorter review intervals and repeat biopsy if the lesion changes.", color: "var(--amber)" },
  low: { title: "Low risk", action: "Routine surveillance.", color: "var(--teal)" },
  uncertain: { title: "Not enough similar patients", action: "Prediction withheld. Refer for specialist review.", color: "var(--ink-3)" },
};

export default function PatientCase() {
  const { model, cohort, sel, setSel } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"risk" | "id">("risk");
  const [stage, setStage] = useState(0);
  const [run, setRun] = useState(0);
  const [fhir, setFhir] = useState(false);
  const p = cohort.patients[sel];
  const pred = useMemo(() => predictPatient(model, sel), [model, sel]);
  const attr = useMemo(() => attribution(model, sel), [model, sel]);
  const timers = useRef<number[]>([]);

  // one orchestrated reveal per patient: genes -> pathways -> qubits -> prediction
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    setStage(0);
    const steps = [1900, 2800, 3700];
    timers.current = steps.map((ms, k) => window.setTimeout(() => setStage(k + 1), ms));
    return () => timers.current.forEach(clearTimeout);
  }, [sel, run]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = cohort.patients.map((pt, i) => ({ pt, i, risk: model.loo.proj[i] }))
      .filter(({ pt }) => !q || pt.id.toLowerCase().includes(q) || (pt.meta?.histology ?? "").toLowerCase().includes(q) || (pt.meta?.site ?? "").toLowerCase().includes(q));
    return sort === "risk" ? rows.sort((a, b) => b.risk - a.risk) : rows;
  }, [cohort, model, query, sort]);

  const top = useMemo(() => attr.map((v, k) => ({ v, k })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3).map((x) => x.k), [attr]);
  const [wz, setWz] = useState<number[]>(p.pathways);
  useEffect(() => setWz(p.pathways), [p]);
  const wi = useMemo(() => whatIf(model, sel, wz), [model, sel, wz]);
  const changed = wz.some((v, k) => v !== p.pathways[k]);
  const tier = TIER[pred.tier];
  const screen = useMemo(() => screeningPoint(model.loo.proj, model.times, model.events, cohort.horizon, 0.9), [model, cohort]);

  return (
    <div className="case">
      <aside className="panel cohort-list" aria-label="Cohort">
        <div className="head">
          <div className="row"><b>Cohort</b><span className="spacer" /><span className="tiny muted">{cohort.patients.length} patients</span></div>
          <input type="search" placeholder="Search ID, histology, site" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search patients" />
          <div className="seg" role="group" aria-label="Sort">
            <button aria-pressed={sort === "risk"} onClick={() => setSort("risk")}>By risk</button>
            <button aria-pressed={sort === "id"} onClick={() => setSort("id")}>By ID</button>
          </div>
        </div>
        <div className="cohort-scroll" role="listbox" aria-label="Patients">
          {list.map(({ pt, i, risk }) => (
            <button key={pt.id} className="pt-row" role="option" aria-selected={i === sel} onClick={() => setSel(i)}>
              <span className="pt-id">{pt.id}</span>
              <span className="riskbar"><span style={{ width: pct(risk), background: risk >= 0.5 ? "var(--eosin)" : risk >= 0.25 ? "var(--amber)" : "var(--teal)" }} /></span>
              <span className="pt-meta">{pt.meta?.histology ?? "Histology n/a"}{pt.meta?.site ? `, ${pt.meta.site.toLowerCase()}` : ""}</span>
            </button>
          ))}
          {!list.length && <p className="small muted" style={{ padding: 14 }}>No patients match that search. Try a histology grade such as "severe".</p>}
        </div>
      </aside>

      <div className="grid">
        <CaseHero p={p} cohort={cohort} risk={pred.risk} stage={stage} color={tier.color}
          verdict={screen && pred.tier !== "uncertain" ? (pred.risk >= screen.threshold ? `Screening rule: refer (risk at or above ${pct(screen.threshold)})` : `Screening rule: routine surveillance (risk below ${pct(screen.threshold)})`) : pred.tier === "uncertain" ? "Too few similar patients: refer for specialist review" : null}
          onReplay={() => setRun((r) => r + 1)} onFhir={() => setFhir(true)} />

        <section className="pipeline" aria-label="Analysis pipeline">
          <Stage n={1} title="Genes measured" active={stage >= 0} progress={stage >= 1 ? 1 : undefined}>
            <GeneStrip z={p.pathways} labels={cohort.pathways.map((x) => x.short.slice(0, 4))} run={run * 1000 + sel} height={140} />
          </Stage>
          <Stage n={2} title="Pathway scores" active={stage >= 1} progress={stage >= 2 ? 1 : undefined}>
            <Faded on={stage >= 1}>
              <Bars domain={2.5} labelW={58} items={cohort.pathways.slice(0, 6).map((pw, k) => ({ label: pw.short, value: p.pathways[k] }))} format={(v) => (v > 0 ? "+" : "") + v.toFixed(1)} />
              <div className="tiny muted" style={{ marginTop: 6 }}>Top 6 of 12 shown, z-scored against the cohort</div>
            </Faded>
          </Stage>
          <Stage n={3} title="Encoded on 12 qubits" active={stage >= 2} progress={stage >= 3 ? 1 : undefined}>
            <Faded on={stage >= 2}><PathwayGraph cohort={cohort} z={stage >= 2 ? p.pathways : undefined} size={190} /></Faded>
          </Stage>
          <Stage n={4} title="Prediction" active={stage >= 3}>
            <Faded on={stage >= 3}>
              <div className="num-l" style={{ color: tier.color }}>{pct(pred.risk)}</div>
              <div className="small muted" style={{ marginTop: 6 }}>chance of oral cancer within {cohort.horizon / 12} years</div>
              <div className="tiny muted" style={{ marginTop: 10 }}>From the {pred.neighbours.length} most similar patients in quantum feature space</div>
            </Faded>
          </Stage>
        </section>

        <AnimatePresence>
          {stage >= 3 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="grid">
              <section className="result">
                <div className="panel" style={{ display: "grid", gap: 12, alignContent: "start" }}>
                  <div className="h2">Predicted future</div>
                  <div className="milestones">
                    {[12, 36, 60].map((m) => (
                      <div key={m} className="milestone"><div className="milestone-num" style={{ color: tier.color }}>{pct(1 - survivalAt(pred.curve, m))}</div><div className="tiny muted">risk by {m / 12} year{m > 12 ? "s" : ""}</div></div>
                    ))}
                  </div>
                  <div className={`tier tier-${pred.tier}`}><b>{tier.title}</b>{tier.action}</div>
                  {screen && pred.tier !== "uncertain" && (
                    <div className="small" style={{ borderLeft: "3px solid var(--violet)", paddingLeft: 10 }}>
                      <b>Screening rule:</b> refer if risk ≥ {pct(screen.threshold)}, which catches {pct(screen.sensitivity)} of progressions in this cohort while referring {pct(screen.referral)} of patients. This patient: <b>{pred.risk >= screen.threshold ? "refer" : "routine surveillance"}</b>.
                    </div>
                  )}
                  <div className="tiny muted">Tier labels are illustrative; the screening rule is derived from this cohort's out-of-sample predictions. Based on {pred.effN.toFixed(1)} effective neighbours.</div>
                </div>
                <div className="panel">
                  <div className="row"><div className="h2">Cancer-free over time</div><span className="spacer" />
                    <div className="legend"><span><i style={{ background: tier.color }} />{p.id}</span><span><i style={{ background: "var(--ink-3)" }} />Whole cohort</span>{changed && <span><i style={{ background: "var(--violet)" }} />What-if</span>}</div>
                  </div>
                  <SurvivalChart horizon={cohort.horizon} series={[
                    { curve: model.km, color: "var(--ink-3)", label: "cohort", dash: "4 4", width: 1.5 },
                    { curve: pred.curve, color: tier.color, label: p.id, fill: true },
                    ...(changed ? [{ curve: wi.pred.curve, color: "var(--violet)", label: "whatif", dash: "6 3" }] : []),
                  ]} />
                </div>
              </section>

              <section className="three">
                <div className="panel">
                  <div className="h2">Why this risk</div>
                  <p className="small muted" style={{ marginTop: 0 }}>Change in risk if each pathway were at the cohort average. Positive pushes risk up.</p>
                  <Bars domain={Math.max(0.05, ...attr.map(Math.abs))} items={cohort.pathways.map((pw, k) => ({ label: pw.short, value: attr[k] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8)}
                    format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`} posColor="var(--eosin)" negColor="var(--teal)" />
                  <div className="tiny muted" style={{ marginTop: 8 }}>Percentage points of 3-year risk.</div>
                </div>
                <div className="panel">
                  <div className="h2">Most similar patients</div>
                  <p className="small muted" style={{ marginTop: 0 }}>Nearest in quantum feature space. These drive the curve.</p>
                  {pred.neighbours.slice(0, 6).map(({ j, w }) => {
                    const q = cohort.patients[j];
                    return (
                      <button key={q.id} className="neighbour" onClick={() => setSel(j)} style={{ width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--line)", cursor: "pointer", textAlign: "left" }}>
                        <span className="dot" style={{ background: q.event ? "var(--eosin)" : "var(--teal)" }} />
                        <span><b>{q.id}</b> <span className="muted">{q.event ? `progressed at ${(q.time / 12).toFixed(1)}y` : `cancer-free ${(q.time / 12).toFixed(1)}y`}</span></span>
                        <span className="small" style={{ fontWeight: 600 }}>{w.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="panel">
                  <div className="h2">What if</div>
                  <p className="small muted" style={{ marginTop: 0 }}>Move the pathways that matter most. The circuit is re-simulated live.</p>
                  <div className="grid" style={{ gap: 14 }}>
                    {top.map((k) => (
                      <div className="slider" key={k}>
                        <div className="slider-head"><span>{cohort.pathways[k].label}</span><b>{wz[k] > 0 ? "+" : ""}{wz[k].toFixed(1)}</b></div>
                        <input type="range" min={-3} max={3} step={0.1} value={wz[k]} onChange={(e) => setWz((z) => z.map((v, i) => (i === k ? +e.target.value : v)))} aria-label={`${cohort.pathways[k].label} score`} />
                      </div>
                    ))}
                    <div className="row"><div><div className="num" style={{ color: "var(--violet)" }}>{pct(wi.pred.risk)}</div><div className="tiny muted">what-if 3-year risk</div></div>
                      <span className="spacer" /><button className="btn" disabled={!changed} onClick={() => setWz(p.pathways)}>Reset</button></div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {fhir && <FhirModal onClose={() => setFhir(false)} id={p.id} risk={pred.risk} tier={tier.title} attr={attr} />}
    </div>
  );
}

function Stage({ n, title, active, progress, children }: { n: number; title: string; active: boolean; progress?: number; children: React.ReactNode }) {
  return (
    <div className="stage" data-active={active}>
      <div className="stage-top"><span className="stage-step">{n}</span>{title}</div>
      {children}
      {progress !== undefined && <motion.div className="stage-progress" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.5 }} />}
    </div>
  );
}
const Faded = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
  <motion.div initial={false} animate={{ opacity: on ? 1 : 0.12, filter: on ? "blur(0px)" : "blur(2px)" }} transition={{ duration: 0.5 }}>{children}</motion.div>
);

function FhirModal({ onClose, id, risk, tier, attr }: { onClose: () => void; id: string; risk: number; tier: string; attr: number[] }) {
  const { cohort } = useApp();
  const json = JSON.stringify({
    resourceType: "DiagnosticReport",
    status: "preliminary",
    category: [{ text: "Clinical decision support (research use only)" }],
    code: { text: "Oral precancer progression risk, SANKET hybrid quantum model" },
    subject: { reference: `Patient/${id}` },
    effectiveDateTime: new Date().toISOString(),
    conclusion: `${tier}. Estimated ${Math.round(risk * 100)}% risk of oral cancer within ${cohort.horizon / 12} years.`,
    contained: [{
      resourceType: "Observation", id: "risk", status: "preliminary",
      code: { text: `${cohort.horizon / 12}-year progression risk` },
      valueQuantity: { value: +(risk * 100).toFixed(1), unit: "%" },
      component: cohort.pathways.map((pw, k) => ({ code: { text: `Contribution: ${pw.label}` }, valueQuantity: { value: +(attr[k] * 100).toFixed(1), unit: "percentage points" } })),
    }],
    result: [{ reference: "#risk" }],
  }, null, 2);
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/fhir+json" })); a.download = `${id}-sanket-report.json`; a.click(); };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="FHIR report" onClick={onClose}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="row"><div className="h2">HL7 FHIR R4 DiagnosticReport</div><span className="spacer" /><button className="btn" onClick={download}><IDownload /> Download JSON</button><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
        <p className="small muted">The format used by India's Ayushman Bharat Digital Mission for health records.</p>
        <pre className="code">{json}</pre>
      </div>
    </div>
  );
}