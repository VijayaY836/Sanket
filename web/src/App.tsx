import { AnimatePresence, motion } from "framer-motion";
import { useApp, View } from "./store";
import { ICase, ICircuit, IChip, IData, IEvidence, IOverview, IGauge, ISpark, IStars, ITheme, Mark } from "./icons";
import Overview from "./views/Overview";
import PatientCase from "./views/PatientCase";
import Constellation from "./views/Constellation";
import QuantumLab from "./views/QuantumLab";
import Evidence from "./views/Evidence";
import Advantage from "./views/Advantage";
import Readiness from "./views/Readiness";
import Hardware from "./views/Hardware";
import Workbench from "./views/Workbench";

const NAV: { group: string; items: { id: View; label: string; icon: () => JSX.Element }[] }[] = [
  { group: "Story", items: [
    { id: "overview", label: "Overview", icon: IOverview },
    { id: "case", label: "Patient case", icon: ICase },
  ] },
  { group: "Quantum", items: [
    { id: "constellation", label: "Constellation", icon: IStars },
    { id: "lab", label: "Circuit and noise", icon: ICircuit },
    { id: "advantage", label: "When quantum wins", icon: ISpark },
  ] },
  { group: "Proof", items: [
    { id: "evidence", label: "Evidence", icon: IEvidence },
    { id: "hardware", label: "Hardware", icon: IChip },
  ] },
  { group: "Tools", items: [
    { id: "readiness", label: "Readiness check", icon: IGauge },
    { id: "workbench", label: "Data", icon: IData },
  ] },
];

export default function App() {
  const { view, go, cohort, theme, cycleTheme } = useApp();
  const Page = { overview: Overview, case: PatientCase, constellation: Constellation, lab: QuantumLab, evidence: Evidence, advantage: Advantage, readiness: Readiness, hardware: Hardware, workbench: Workbench }[view];
  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <div className="brand">
          <Mark />
          <div>
            <div className="brand-name">SANKET</div>
            <div className="brand-sub">Precancer progression, hybrid quantum ML</div>
          </div>
        </div>
        {NAV.map((g) => (
          <div className="nav-group" key={g.group}>
            <div className="nav-group-label">{g.group}</div>
            {g.items.map((n) => (
              <button key={n.id} className="nav-btn" aria-current={view === n.id ? "page" : undefined} onClick={() => go(n.id)}>
                {view === n.id && <motion.span layoutId="nav-active" className="nav-active" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <span className="nav-ico"><n.icon /></span><span className="nav-txt">{n.label}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="rail-foot">
          {cohort.source === "synthetic"
            ? <span className="chip chip-amber" title={cohort.description}>Synthetic cohort</span>
            : <span className="chip chip-teal" title={cohort.description}>Real cohort loaded</span>}
          <div className="tiny muted">{cohort.patients.length} patients, {cohort.pathways.length} qubits</div>
          {(cohort.hardware ?? []).some((h) => !/not hardware/i.test(h.note ?? "")) && <span className="chip chip-violet" title="Recorded IBM quantum hardware runs">Run on IBM hardware</span>}
          <button className="btn btn-ghost" onClick={cycleTheme} style={{ justifyContent: "flex-start", padding: "6px 4px" }}>
            <ITheme /> Theme: {theme}
          </button>
          <div className="tiny muted">Research prototype. Not for diagnosis.</div>
        </div>
      </nav>
      <main className="main">
        {cohort.source === "synthetic" && (
          <div className="banner" role="note">
            <b>Synthetic data.</b>
            <span>Every number on screen is computed live, but the 86 patients are generated stand-ins shaped like GEO GSE26549. Load the engine's <code>cohort.json</code> under Data to run on real patients.</span>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <Page />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}