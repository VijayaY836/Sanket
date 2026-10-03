import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Cohort, validateCohort } from "./lib/cohort";
import { KernelKind, Model, nestedCV } from "./lib/analysis";
import { geometricDifference } from "./lib/linalg";

export type View = "overview" | "detect" | "case" | "constellation" | "lab" | "evidence" | "advantage" | "readiness" | "hardware" | "workbench";
type Nested = Record<KernelKind, { c: number; ci: [number, number]; picks: number[] }>;
/** The two real cohorts bundled with the app. null: a synthetic or user-loaded cohort is active. */
export type Cancer = "oral" | "breast";
export const CANCER_NAME: Record<Cancer, string> = { oral: "Oral cancer", breast: "Breast cancer" };
const LOADERS: Record<Cancer, () => Promise<unknown>> = {
  oral: () => import("./data/cohort_oral.json").then((m) => m.default),
  breast: () => import("./data/cohort_breast.json").then((m) => m.default),
};

interface Ctx {
  cohort: Cohort;
  model: Model;
  /** Load any cohort (synthetic or a user's file); clears the bundled-cancer choice. */
  setCohort: (c: Cohort) => void;
  /** Which bundled cancer is on screen, or null for a synthetic or user-loaded cohort. */
  cancer: Cancer | null;
  chooseCancer: (c: Cancer) => void;
  /** Set while the next cohort's quantum kernels are being built; the current one stays on screen meanwhile. */
  pending: { cancer: Cancer | null; patients: number } | null;
  sel: number;
  setSel: (i: number) => void;
  view: View;
  go: (v: View) => void;
  theme: "light" | "dark" | "system";
  cycleTheme: () => void;
  nested: Nested | null;
  nestedProgress: number;
  geo: { proj: number; fid: number } | null;
  /** Large cohorts (over 150 patients): heavy analyses run in the Python engine instead of the browser. */
  large: boolean;
}
const C = createContext<Ctx | null>(null);
export const LARGE = 150;
export const useApp = () => useContext(C)!;

export function AppProvider({ children }: { children: ReactNode }) {
  const [cohort, setCohortRaw] = useState<Cohort | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [sel, setSel] = useState(0);
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [nested, setNested] = useState<Nested | null>(null);
  const [nestedProgress, setNP] = useState(0);
  const [geo, setGeo] = useState<Ctx["geo"]>(null);
  const [cancer, setCancer] = useState<Cancer | null>(null);
  const [pending, setPending] = useState<Ctx["pending"]>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);

  // The current cohort stays on screen until the next one's model is ready, then both swap together.
  const load = useCallback((c: Cohort, tag: Cancer | null) => {
    const request = ++requestRef.current;
    workerRef.current?.terminate();
    setPending({ cancer: tag, patients: c.patients.length });
    const worker = new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<Model>) => {
      if (request !== requestRef.current) return;
      worker.terminate();
      workerRef.current = null;
      const m = event.data;
      setNested(null); setGeo(null); setNP(0);
      setCohortRaw(c); setModel(m); setCancer(tag); setPending(null);
      // start on the most instructive patient: a progressor with high predicted risk
      let best = 0;
      m.loo.proj.forEach((r, i) => { if (m.events[i] && r > m.loo.proj[best]) best = i; });
      setSel(best);
    };
    worker.postMessage(c);
  }, []);
  const setCohort = useCallback((c: Cohort) => load(c, null), [load]);
  const chooseCancer = useCallback((c: Cancer) => {
    const request = requestRef.current;
    LOADERS[c]().then((raw) => { if (request === requestRef.current) load(validateCohort(raw), c); });
  }, [load]);

  useEffect(() => {
    chooseCancer("oral"); // open on real patients: GSE26549, with the IBM hardware run
    return () => workerRef.current?.terminate();
  }, [chooseCancer]);

  // background analyses: geometric difference, then nested cross-validation
  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    if (model.n > LARGE) {
      // too heavy for the browser: show leave-one-out results of the deployed models; full protocol runs in engine.scale
      setNested({ proj: { ...model.cidx.proj, picks: [] }, fid: { ...model.cidx.fid, picks: [] }, rbf: { ...model.cidx.rbf, picks: [] } });
      setNP(1);
      return;
    }
    const t = setTimeout(async () => {
      const g = { proj: geometricDifference(model.K.rbf, model.K.proj), fid: geometricDifference(model.K.rbf, model.K.fid) };
      if (cancelled) return;
      setGeo(g);
      const r = await nestedCV(model, (p) => !cancelled && setNP(p));
      if (!cancelled) setNested(r);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [model]);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", theme);
  }, [theme]);

  const go = useCallback((v: View) => { setView(v); window.scrollTo({ top: 0 }); }, []);
  const cycleTheme = () => setTheme((t) => (t === "system" ? "dark" : t === "dark" ? "light" : "system"));

  const value = useMemo(() => (cohort && model ? { cohort, model, setCohort, cancer, chooseCancer, pending, sel, setSel, view, go, theme, cycleTheme, nested, nestedProgress, geo, large: model.n > LARGE } : null), [cohort, model, setCohort, cancer, chooseCancer, pending, sel, view, go, theme, nested, nestedProgress, geo]);
  if (!value) return <Loading patients={pending?.patients ?? 86} />;
  return <C.Provider value={value}>{children}</C.Provider>;
}

function Loading({ patients }: { patients: number }) {
  return (
    <div className="loading">
      <div>
        <div className="brand-name" style={{ fontSize: 34 }}>SANKET</div>
        <p className="muted" style={{ marginTop: 10 }}>Building quantum kernels for {patients.toLocaleString()} patients…</p>
      </div>
    </div>
  );
}