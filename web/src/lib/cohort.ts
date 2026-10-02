import { mulberry32, normal } from "./rng";

export interface PathwayDef { key: string; label: string; short: string; group: "Proliferation" | "Stress" | "Genome" | "Microenvironment" }
export interface Patient {
  id: string;
  pathways: number[]; // z-scored ssGSEA pathway scores, same order as cohort.pathways
  time: number;       // months to oral cancer, or to last follow-up if censored
  event: 0 | 1;       // 1 = progressed to oral cancer
  meta?: { age?: number; sex?: string; site?: string; histology?: string };
}
export interface HardwareRecord { backend: string; jobId: string; date: string; shots: number; patients: number; note?: string }
export interface Cohort {
  name: string;
  disease: string;
  source: "synthetic" | "real";
  description: string;
  timeUnit: "months";
  horizon: number; // months used for the headline risk
  pathways: PathwayDef[];
  edges: [number, number][]; // pathway crosstalk graph (shared-gene overlap)
  patients: Patient[];
  hardware?: HardwareRecord[];
  /** Bloch vectors measured on hardware, keyed by patient id (written by engine/hardware.py). */
  measuredBloch?: Record<string, [number, number, number][]>;
  /** Encoding used for the recorded hardware run (written by engine/hardware_run.py). */
  featureMap?: { reps: number; beta: number; scale: number };
}

export function outcomeTerms(cohort: Pick<Cohort, "name" | "disease">) {
  const breast = /breast|metabric/i.test(`${cohort.name} ${cohort.disease}`);
  return breast ? {
    risk: "breast cancer relapse",
    event: "Relapsed",
    eventPast: "relapsed",
    free: "Relapse-free",
    freePast: "relapse-free",
    progression: "relapses",
    specialist: "breast oncology",
  } : {
    risk: "oral cancer",
    event: "Developed cancer",
    eventPast: "progressed",
    free: "Cancer-free",
    freePast: "cancer-free",
    progression: "progressions",
    specialist: "oral oncology",
  };
}

export const HALLMARK_12: PathwayDef[] = [
  { key: "HALLMARK_MYC_TARGETS_V1", label: "MYC targets", short: "MYC", group: "Proliferation" },
  { key: "HALLMARK_E2F_TARGETS", label: "E2F targets", short: "E2F", group: "Proliferation" },
  { key: "HALLMARK_G2M_CHECKPOINT", label: "G2/M checkpoint", short: "G2M", group: "Proliferation" },
  { key: "HALLMARK_MTORC1_SIGNALING", label: "mTORC1 signalling", short: "mTORC1", group: "Proliferation" },
  { key: "HALLMARK_UNFOLDED_PROTEIN_RESPONSE", label: "Unfolded protein response", short: "UPR", group: "Stress" },
  { key: "HALLMARK_OXIDATIVE_PHOSPHORYLATION", label: "Oxidative phosphorylation", short: "OXPHOS", group: "Stress" },
  { key: "HALLMARK_P53_PATHWAY", label: "p53 pathway", short: "p53", group: "Genome" },
  { key: "HALLMARK_DNA_REPAIR", label: "DNA repair", short: "DNA repair", group: "Genome" },
  { key: "HALLMARK_HYPOXIA", label: "Hypoxia", short: "Hypoxia", group: "Stress" },
  { key: "HALLMARK_EPITHELIAL_MESENCHYMAL_TRANSITION", label: "Epithelial–mesenchymal transition", short: "EMT", group: "Microenvironment" },
  { key: "HALLMARK_TNFA_SIGNALING_VIA_NFKB", label: "TNF-α signalling via NF-κB", short: "TNF-α", group: "Microenvironment" },
  { key: "HALLMARK_INFLAMMATORY_RESPONSE", label: "Inflammatory response", short: "Inflammation", group: "Microenvironment" },
];

// Candidate crosstalk graph (12 edges). The engine recomputes it from Hallmark gene-set overlap.
export const EDGES_12: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [3, 4], [0, 5], [6, 7], [6, 2], [8, 9], [8, 3], [10, 11], [11, 9], [7, 1],
];

const SITES = ["Buccal mucosa", "Lateral tongue", "Floor of mouth", "Gingiva", "Palate"];
const HIST = ["Hyperplasia", "Mild dysplasia", "Moderate dysplasia", "Severe dysplasia"];

/**
 * Synthetic stand-in for GSE26549 (86 oral premalignant lesion patients, ~35 progressed).
 * Clearly labelled as synthetic everywhere in the UI. Replace with engine output (cohort.json).
 */
export function syntheticCohort(seed = 26549): Cohort {
  const rand = mulberry32(seed);
  const N = 86;
  const raw: number[][] = [], eta: number[] = [];
  for (let p = 0; p < N; p++) {
    const P = normal(rand), S = normal(rand), G = normal(rand), M = normal(rand);
    const e = () => normal(rand) * 0.6;
    const z = [
      0.9 * P + e(), 0.85 * P + e(), 0.8 * P + 0.2 * G + e(), 0.6 * P + 0.4 * S + e(),
      0.7 * S + e(), 0.5 * S + 0.4 * P + e(), 0.7 * G + e(), 0.8 * G + 0.2 * P + e(),
      0.75 * S + 0.3 * M + e(), 0.8 * M + e(), 0.7 * M + e(), 0.75 * M + 0.2 * S + e(),
    ];
    raw.push(z);
    // progression hazard: proliferation, impaired repair and hypoxic/EMT microenvironment, plus an interaction
    eta.push(1.8 * (0.55 * z[0] + 0.4 * z[1] + 0.3 * z[2] - 0.45 * z[7] + 0.3 * z[8] + 0.3 * z[9] + 0.15 * z[11] - 0.35 * z[0] * z[7] * 0.5));
  }
  // standardise each pathway across the cohort (ssGSEA scores are z-scored by the engine too)
  const K = raw[0].length;
  for (let k = 0; k < K; k++) {
    const col = raw.map((r) => r[k]);
    const m = col.reduce((a, b) => a + b, 0) / N;
    const sd = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / (N - 1));
    raw.forEach((r) => (r[k] = +((r[k] - m) / sd).toFixed(3)));
  }
  const patients: Patient[] = raw.map((z, i) => {
    const u = Math.max(rand(), 1e-9);
    const T = 205 * Math.pow(-Math.log(u) / Math.exp(eta[i]), 1 / 1.3);
    const C = 30 + rand() * 90;
    const event = T <= C ? 1 : 0;
    const time = Math.max(1, Math.round(Math.min(T, C)));
    const g = Math.max(0, Math.min(3, Math.round(1.2 + 0.8 * eta[i] + normal(rand) * 0.7)));
    return {
      id: `OPL-${String(i + 1).padStart(3, "0")}`,
      pathways: z,
      time,
      event: event as 0 | 1,
      meta: { age: Math.round(48 + rand() * 28), sex: rand() < 0.62 ? "M" : "F", site: SITES[Math.floor(rand() * SITES.length)], histology: HIST[g] },
    };
  });
  return {
    name: "Oral precancer cohort (synthetic stand-in)",
    disease: "Oral potentially malignant disorders",
    source: "synthetic",
    description: "Generated to mimic the shape of GEO GSE26549 (86 patients). Not real patients. Load the engine's cohort.json to use real data.",
    timeUnit: "months",
    horizon: 36,
    pathways: HALLMARK_12,
    edges: EDGES_12,
    patients,
  };
}

export function validateCohort(x: unknown): Cohort {
  const c = x as Cohort;
  const fail = (m: string) => { throw new Error(m); };
  if (!c || typeof c !== "object") fail("File is not a JSON object.");
  if (!Array.isArray(c.pathways) || c.pathways.length < 2 || c.pathways.length > 14) fail("`pathways` must list 2–14 pathways (one per qubit).");
  if (!Array.isArray(c.patients) || c.patients.length < 10) fail("`patients` must contain at least 10 patients.");
  c.patients.forEach((p, i) => {
    if (!Array.isArray(p.pathways) || p.pathways.length !== c.pathways.length) fail(`Patient ${i + 1}: expected ${c.pathways.length} pathway scores.`);
    if (typeof p.time !== "number" || (p.event !== 0 && p.event !== 1)) fail(`Patient ${i + 1}: needs numeric \`time\` and \`event\` 0 or 1.`);
  });
  if (!Array.isArray(c.edges)) c.edges = [];
  c.edges.forEach(([a, b]) => { if (a >= c.pathways.length || b >= c.pathways.length) fail("An edge points to a pathway that does not exist."); });
  c.horizon = c.horizon || 36;
  c.timeUnit = "months";
  c.source = c.source || "real";
  return c;
}