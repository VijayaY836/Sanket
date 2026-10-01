import { AnimatePresence, motion } from "framer-motion";
import { useApp, View } from "./store";
import { ICase, ICircuit, IChip, IData, IEvidence, IOverview, ISpark, IStars, ITheme, Mark } from "./icons";
import Overview from "./views/Overview";
import PatientCase from "./views/PatientCase";
import Constellation from "./views/Constellation";
import QuantumLab from "./views/QuantumLab";
import Evidence from "./views/Evidence";
import Advantage from "./views/Advantage";
import Hardware from "./views/Hardware";
import Workbench from "./views/Workbench";

const NAV: { id: View; label: string; icon: () => JSX.Element }[] = [
  { id: "overview", label: "Overview", icon: IOverview },
  { id: "case", label: "Patient case", icon: ICase },
  { id: "constellation", label: "Constellation", icon: IStars },
  { id: "lab", label: "Circuit and noise", icon: ICircuit },
  { id: "evidence", label: "Evidence", icon: IEvidence },
  { id: "advantage", label: "When quantum wins", icon: ISpark },
  { id: "hardware", label: "Hardware", icon: IChip },
  { id: "workbench", label: "Data", icon: IData },
];

export default function App() {
  const { view, go, cohort, theme, cycleTheme } = useApp();
  const Page = { overview: Overview, case: PatientCase, constellation: Constellation, lab: QuantumLab, evidence: Evidence, advantage: Advantage, hardware: Hardware, workbench: Workbench }[view];
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
        {NAV.map((n) => (
          <button key={n.id} className="nav-btn" aria-current={view === n.id ? "page" : undefined} onClick={() => go(n.id)}>
            <n.icon /> {n.label}
          </button>
        ))}
        <div className="rail-foot">
          {cohort.source === "synthetic"
            ? <span className="chip chip-amber" title={cohort.description}>Synthetic cohort</span>
            : <span className="chip chip-teal" title={cohort.description}>Real cohort loaded</span>}
          <div className="tiny muted">{cohort.patients.length} patients, {cohort.pathways.length} qubits</div>
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