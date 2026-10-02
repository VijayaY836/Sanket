import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Cohort, syntheticCohort } from "./lib/cohort";
import { KernelKind, Model, nestedCV } from "./lib/analysis";
import { geometricDifference } from "./lib/linalg";
import ModelWorker from "./model.worker?worker&inline";

export type View = "overview" | "case" | "constellation" | "lab" | "evidence" | "advantage" | "readiness" | "hardware" | "workbench";
type Nested = Record<KernelKind, { c: number; ci: [number, number]; picks: number[] }>;

interface Ctx {
  cohort: Cohort;
  model: Model;
  setCohort: (c: Cohort) => void;
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
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);

  const setCohort = useCallback((c: Cohort) => {
    const request = ++requestRef.current;
    workerRef.current?.terminate();
    setModel(null); setNested(null); setGeo(null); setNP(0);
    setCohortRaw(c);
    const worker = new ModelWorker();
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<Model>) => {
      if (request !== requestRef.current) return;
      worker.terminate();
      workerRef.current = null;
      const m = event.data;
      setModel(m);
      // start on the most instructive patient: a progressor with high predicted risk
      let best = 0;
      m.loo.proj.forEach((r, i) => { if (m.events[i] && r > m.loo.proj[best]) best = i; });
      setSel(best);
    };
    worker.postMessage(c);
  }, []);

  useEffect(() => {
    setCohort(syntheticCohort());
    return () => workerRef.current?.terminate();
  }, [setCohort]);

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

  const value = useMemo(() => (cohort && model ? { cohort, model, setCohort, sel, setSel, view, go, theme, cycleTheme, nested, nestedProgress, geo, large: model.n > LARGE } : null), [cohort, model, setCohort, sel, view, go, theme, nested, nestedProgress, geo]);
  if (!value) return <Loading patients={cohort?.patients.length ?? 86} />;
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
