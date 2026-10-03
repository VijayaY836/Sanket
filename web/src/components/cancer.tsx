import { motion } from "framer-motion";
import { Cancer, CANCER_NAME, useApp } from "../store";
import detect from "../data/oral_detect.json";

/**
 * The app's two real cancers. One choice drives every page: the prognosis cohort (Overview, Patient case,
 * Constellation, Evidence, Hardware) and the Detect page's tissue samples.
 */
export const CANCERS: Cancer[] = ["oral", "breast"];
const RANK: Record<Cancer, string> = { oral: "India's second most common cancer", breast: "India's most common cancer" };
const COHORT_LINE: Record<Cancer, string> = {
  oral: "Precancer to cancer, 86 patients",
  breast: "Relapse, 300 of 1,975 patients",
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A stained tissue section seen down a microscope: the cancer's colour, with scattered nuclei. */
export function Swatch({ cancer, size = 30 }: { cancer: Cancer; size?: number }) {
  const seed = cancer === "oral" ? 3 : 11;
  const dots = Array.from({ length: 14 }, (_, i) => {
    const a = (i * 137.5 + seed * 20) * (Math.PI / 180), r = 3 + ((i * 7 + seed) % 10);
    return [16 + r * Math.cos(a), 16 + r * Math.sin(a), 1.1 + ((i + seed) % 3) * 0.45] as const;
  });
  return (
    <svg className="swatch" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id={`sw-${cancer}`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor={`var(--${cancer}-soft)`} />
          <stop offset="1" stopColor={`var(--${cancer})`} stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#sw-${cancer})`} stroke={`var(--${cancer})`} strokeWidth="1" />
      {dots.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={`var(--${cancer})`} opacity={0.75} />)}
    </svg>
  );
}

/** The cancer switch: in the rail on wide screens, at the top of the page on phones. */
export function CancerSwitch({ compact = false }: { compact?: boolean }) {
  const { cancer, chooseCancer, pending } = useApp();
  return (
    <div className={`cancer-switch${compact ? " cancer-switch-compact" : ""}`} role="radiogroup" aria-label="Cancer">
      {!compact && <div className="nav-group-label">Cancer</div>}
      {CANCERS.map((c) => {
        const on = cancer === c, busy = pending?.cancer === c;
        return (
          <button key={c} role="radio" aria-checked={on} className={`cancer-opt cancer-${c}`} disabled={busy}
            onClick={() => !on && chooseCancer(c)}>
            {on && <motion.span layoutId={compact ? "cancer-on-c" : "cancer-on"} className="cancer-on" transition={{ type: "spring", stiffness: 380, damping: 34 }} />}
            <Swatch cancer={c} size={compact ? 22 : 30} />
            <span className="cancer-txt">
              <span className="cancer-name">{CANCER_NAME[c]}</span>
              {!compact && <span className="cancer-sub">{busy ? `Building quantum kernels for ${pending!.patients} patients…` : COHORT_LINE[c]}</span>}
            </span>
            {busy && <span className="cancer-busy" aria-hidden="true" />}
          </button>
        );
      })}
      {!compact && cancer === null && !pending && <div className="tiny muted" style={{ padding: "2px 8px" }}>Your own cohort is loaded. Pick a cancer to return to the real patients.</div>}
    </div>
  );
}

type Cell = { head: string; body: string };
function rows(): Record<Cancer, Cell[]> {
  const T = detect.tasks as Record<string, { models: Record<string, { auc: number }>; screening?: Record<string, { sensitivity: number; specificity: number }> }>;
  const ext = (detect.external as { corrected?: { models: Record<string, { auc: number }> } }).corrected;
  const B = (detect as unknown as { breast?: { models: Record<string, { auc: number }>; screening?: Record<string, { sensitivity: number; specificity: number }>;
    external?: { models: Record<string, { auc: number }> } } }).breast;
  const bExt = B?.external ? Object.values(B.external.models).map((m) => m.auc) : [];
  return {
    oral: [
      { head: "Normal, dysplasia or cancer", body: `AUC ${T.oral_cancer_normal.models.proj.auc.toFixed(2)} for cancer${T.oral_dysplasia_normal.screening ? `; catches ${pct(T.oral_dysplasia_normal.screening.proj.sensitivity)} of dysplasias at the screening cut-off` : ""}` },
      { head: "Will a precancer become cancer, and when?", body: "86 patients with leukoplakia, followed for years (GEO GSE26549)" },
      { head: "Tata Memorial Centre, Navi Mumbai", body: ext ? `AUC ${ext.models.proj.auc.toFixed(2)} on Indian patients after correcting a scaling error` : "Registered check reported in full" },
      { head: "All 86 patients on IBM ibm_fez", body: "Hardware and exact simulation agree at 0.98" },
    ],
    breast: [
      { head: "Normal or cancer", body: B ? `AUC ${B.models.proj.auc.toFixed(2)}${B.screening ? `; catches ${pct(B.screening.proj.sensitivity)} of cancers with ${pct(B.screening.proj.specificity)} specificity at the screening cut-off` : ""}` : "Registered analysis" },
      { head: "Will it relapse after diagnosis, and when?", body: "1,975 patients with primary breast cancer (METABRIC)" },
      { head: "Hospital Universitario San Cecilio, Granada", body: bExt.length ? `AUC ${Math.min(...bExt).toFixed(2)} to ${Math.max(...bExt).toFixed(2)} across models on Spanish patients` : "Independent check" },
      { head: "8-patient pilot on IBM ibm_fez", body: "Hardware and exact simulation agree at 0.99" },
    ],
  };
}
const ROW_LABELS = ["Detect from tissue", "Predict the future", "Checked independently", "Run on quantum hardware"];

/** Overview: what SANKET does for each cancer, side by side. The inactive column switches the app. */
export function TwoCancers() {
  const { cancer, chooseCancer, pending } = useApp();
  const R = rows();
  return (
    <section className="two-cancers" aria-labelledby="two-cancers-title">
      <div className="two-cancers-head">
        <h2 id="two-cancers-title" className="two-cancers-title">Two of India's most common cancers. One quantum pipeline.</h2>
        <p className="two-cancers-lede">The same 12 pathways, the same biology-shaped circuit and the same honest tests, run on oral cancer and breast cancer.</p>
      </div>
      <div className="tc-grid" role="table" aria-label="What SANKET does for each cancer">
        <div className="tc-corner" role="columnheader" aria-hidden="true" />
        {CANCERS.map((c) => (
          <div key={c} role="columnheader" className={`tc-col-head cancer-${c}${cancer === c ? " is-on" : ""}`}>
            <Swatch cancer={c} size={40} />
            <div>
              <div className="tc-name">{CANCER_NAME[c]}</div>
              <div className="tc-rank">{RANK[c]}</div>
            </div>
            <span className="spacer" />
            {cancer === c
              ? <span className="tc-state">On screen</span>
              : <button className="btn tc-switch" disabled={pending?.cancer === c} onClick={() => chooseCancer(c)}>{pending?.cancer === c ? "Loading…" : `Show ${CANCER_NAME[c].toLowerCase()}`}</button>}
          </div>
        ))}
        {ROW_LABELS.map((label, r) => (
          <div key={label} role="row" className="tc-row">
            <div role="rowheader" className="tc-label">{label}</div>
            {CANCERS.map((c) => (
              <div key={c} role="cell" className={`tc-cell cancer-${c}${cancer === c ? " is-on" : ""}`}>
                <div className="tc-cell-head">{R[c][r].head}</div>
                <div className="tc-cell-body">{R[c][r].body}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="two-cancers-foot">On both cancers, quantum and classical models tie, as we predicted in writing before running. Detection rankings carry across labs and countries; the cut-off needs local calibration, which is why SANKET's next step is Indian training data from a clinical partner.</p>
    </section>
  );
}