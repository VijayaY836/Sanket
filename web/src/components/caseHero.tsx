import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cohort, outcomeTerms, Patient } from "../lib/cohort";
import { IDownload, IReplay } from "../icons";

const STAGES = ["Reading 20,000 genes", "Scoring 12 pathways", "Encoding on 12 qubits", "Prediction ready"];
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Large animated ring: 12 pathway beads around the outside light up as the patient is encoded. */
function RiskRing({ risk, ready, stage, z, color, outcome }: { risk: number; ready: boolean; stage: number; z: number[]; color: string; outcome: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!ready) { setV(0); return; }
    if (reduced()) { setV(risk); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const u = Math.min(1, (now - t0) / 1100); const e = 1 - Math.pow(1 - u, 3); setV(risk * e); if (u < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [risk, ready]);
  const S = 260, c = S / 2, r = 92, C = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: S, display: "block" }} role="img" aria-label={ready ? `Predicted risk ${Math.round(risk * 100)} percent` : "Analysing"}>
      <defs>
        <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9c8cff" /><stop offset="1" stopColor={color} /></linearGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={14} />
      {!ready && <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ink-3)" strokeWidth={14} strokeLinecap="round" strokeDasharray={`${C * 0.18} ${C}`} className="ring-spin" style={{ transformOrigin: "50% 50%" }} />}
      {ready && <circle cx={c} cy={c} r={r} fill="none" stroke="url(#ringgrad)" strokeWidth={14} strokeLinecap="round" strokeDasharray={`${C * v} ${C}`} transform={`rotate(-90 ${c} ${c})`} />}
      {z.map((zk, k) => {
        const t = -Math.PI / 2 + (2 * Math.PI * k) / z.length, x = c + (r + 30) * Math.cos(t), y = c + (r + 30) * Math.sin(t);
        const on = stage >= 2, mag = Math.min(1, Math.abs(zk) / 2.5);
        return <circle key={k} cx={x} cy={y} r={on ? 4 + 4 * mag : 3} fill={zk >= 0 ? "#9c8cff" : "#4fd1c5"} opacity={on ? 0.35 + 0.65 * mag : 0.25} style={{ transition: `all .5s ${k * 40}ms` }} />;
      })}
      <text x={c} y={c - 4} textAnchor="middle" fontSize={ready ? 54 : 15} fontWeight={700} fill="var(--ink)" style={{ fontFamily: "var(--display)" }}>{ready ? `${Math.round(v * 100)}%` : STAGES[Math.min(stage, 3)]}</text>
      {ready && <text x={c} y={c + 24} textAnchor="middle" fontSize={12} fill="var(--ink-2)">risk of {outcome}</text>}
      {ready && <text x={c} y={c + 40} textAnchor="middle" fontSize={12} fill="var(--ink-2)">within 3 years</text>}
    </svg>
  );
}

export function CaseHero({ p, cohort, risk, stage, color, verdict, onReplay, onFhir }: {
  p: Patient; cohort: Cohort; risk: number; stage: number; color: string; verdict: string | null; onReplay: () => void; onFhir: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  useEffect(() => setReveal(false), [p.id]);
  const ready = stage >= 3;
  const terms = outcomeTerms(cohort);
  const facts = [p.meta?.age && `Age ${p.meta.age}`, p.meta?.sex && (p.meta.sex === "M" ? "Male" : p.meta.sex === "F" ? "Female" : p.meta.sex), p.meta?.histology, p.meta?.site].filter(Boolean) as string[];
  return (
    <section className="case-hero">
      <div className="case-hero-copy">
        <div className="case-kicker">Biopsy case file</div>
        <motion.div key={p.id} className="case-hero-id" initial={reduced() ? false : { opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.5 }}>{p.id}</motion.div>
        <div className="case-facts">{facts.map((f) => <span key={f}>{f}</span>)}</div>
        <div className="case-progress" aria-label="Analysis progress">
          {STAGES.map((s, k) => (
            <div key={s} className={`case-step ${stage >= k ? "on" : ""}`}><span className="case-step-bar"><span style={{ transform: `scaleX(${stage > k || (k === STAGES.length - 1 && stage >= k) ? 1 : stage === k ? 0.6 : 0})` }} /></span><span className="case-step-txt">{s}</span></div>
          ))}
        </div>
        <AnimatePresence>
          {ready && verdict && (
            <motion.div className="case-verdict" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.5 }}>{verdict}</motion.div>
          )}
        </AnimatePresence>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn btn-hero" onClick={() => setReveal((r) => !r)} disabled={!ready}>{reveal ? "Hide outcome" : "Reveal what actually happened"}</button>
          <button className="btn btn-hero-ghost" onClick={onReplay}><IReplay /> Replay</button>
          <button className="btn btn-hero-ghost" onClick={onFhir}><IDownload /> FHIR report</button>
        </div>
      </div>
      <div className="case-hero-ring">
        <RiskRing risk={risk} ready={ready} stage={stage} z={p.pathways} color={color} outcome={terms.risk} />
        <AnimatePresence>
          {reveal && (
            <motion.div className={`case-stamp ${p.event ? "bad" : "good"}`} initial={{ opacity: 0, scale: 1.6, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: -8 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
              <b>{p.event ? terms.event : terms.free}</b>
              <span>{p.event ? `at ${(p.time / 12).toFixed(1)} years` : `at last follow-up, ${(p.time / 12).toFixed(1)} years`}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="case-ring-note">{cohort.pathways.length} beads: this patient's pathway activity, violet up, teal down. The model never saw the outcome.</div>
      </div>
    </section>
  );
}
