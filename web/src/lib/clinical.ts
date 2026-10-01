/** Clinical usefulness of predicted risks: calibration, decision curves and a screening-first threshold. Mirrors engine/clinical.py. */
import { kaplanMeier, survivalAt } from "./survival";

const S = (t: number[], e: number[], H: number) => (t.length ? survivalAt(kaplanMeier(t, e), H) : NaN);
const pick = <T,>(a: T[], m: boolean[]) => a.filter((_, i) => m[i]);

export function calibration(risk: number[], t: number[], e: number[], H: number, groups = 5) {
  const order = risk.map((r, i) => [r, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const out: { predicted: number; observed: number; n: number }[] = [];
  for (let g = 0; g < groups; g++) {
    const idx = order.slice(Math.floor((g * order.length) / groups), Math.floor(((g + 1) * order.length) / groups));
    if (idx.length < 3) continue;
    out.push({ predicted: idx.reduce((s, i) => s + risk[i], 0) / idx.length, observed: 1 - S(idx.map((i) => t[i]), idx.map((i) => e[i]), H), n: idx.length });
  }
  return out;
}

export function decisionCurve(risk: number[], t: number[], e: number[], H: number, thresholds: number[]) {
  const n = t.length, pAll = 1 - S(t, e, H);
  return thresholds.map((pt) => {
    const hi = risk.map((r) => r >= pt), nHi = hi.filter(Boolean).length;
    let nb = 0;
    if (nHi) { const ev = 1 - S(pick(t, hi), pick(e, hi), H); nb = (ev * nHi) / n - ((1 - ev) * nHi / n) * (pt / (1 - pt)); }
    return { threshold: pt, model: nb, referAll: pAll - (1 - pAll) * (pt / (1 - pt)) };
  });
}

export interface ScreeningPoint { threshold: number; sensitivity: number; specificity: number; referral: number; npv: number; ppv: number }
/** Highest risk threshold that still catches >= target of the patients who progress by H. */
export function screeningPoint(risk: number[], t: number[], e: number[], H: number, target = 0.9): ScreeningPoint | null {
  const n = t.length, Sall = S(t, e, H), evAll = (1 - Sall) * n;
  const cands = Array.from(new Set(risk.map((r) => Math.round(r * 1e4) / 1e4))).sort((a, b) => b - a);
  for (const pt of cands) {
    const hi = risk.map((r) => r >= pt), lo = hi.map((x) => !x), nHi = hi.filter(Boolean).length, nLo = n - nHi;
    const evHi = nHi ? (1 - S(pick(t, hi), pick(e, hi), H)) * nHi : 0;
    const sens = evAll > 0 ? evHi / evAll : NaN;
    if (sens >= target) {
      const sLo = nLo ? S(pick(t, lo), pick(e, lo), H) : NaN;
      return { threshold: pt, sensitivity: sens, specificity: nLo ? (sLo * nLo) / (Sall * n) : 0, referral: nHi / n, npv: sLo, ppv: 1 - S(pick(t, hi), pick(e, hi), H) };
    }
  }
  return null;
}

/** IPCW Brier score at H (Graf et al. 1999) and skill relative to the no-information model. */
export function brier(risk: number[], t: number[], e: number[], H: number) {
  const G = kaplanMeier(t, e.map((x) => 1 - x));
  const g = (x: number) => Math.max(survivalAt(G, x - 1e-9), 1e-6);
  const score = (surv: number[]) => surv.reduce((s, p, i) => s + (t[i] <= H && e[i] ? p * p / g(t[i]) : t[i] > H ? (1 - p) ** 2 / g(H) : 0), 0) / t.length;
  const b = score(risk.map((r) => 1 - r)), b0 = score(t.map(() => S(t, e, H)));
  return { brier: b, skill: 1 - b / b0 };
}