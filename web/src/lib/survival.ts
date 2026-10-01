// Kernel survival analysis. Beran's estimator = kernel-weighted Kaplan–Meier.
export interface Curve { t: number[]; s: number[] }

export function beran(weights: number[], times: number[], events: number[]): Curve {
  const idx = times.map((_, i) => i).filter((i) => weights[i] > 0).sort((a, b) => times[a] - times[b]);
  let atRisk = idx.reduce((s, i) => s + weights[i], 0);
  const t: number[] = [0], s: number[] = [1];
  let S = 1, k = 0;
  while (k < idx.length) {
    const tt = times[idx[k]];
    let dW = 0, leave = 0;
    while (k < idx.length && times[idx[k]] === tt) {
      const i = idx[k];
      if (events[i]) dW += weights[i];
      leave += weights[i];
      k++;
    }
    if (dW > 0 && atRisk > 0) { S *= 1 - dW / atRisk; t.push(tt); s.push(S); }
    atRisk -= leave;
  }
  return { t, s };
}

export const kaplanMeier = (times: number[], events: number[]) => beran(times.map(() => 1), times, events);

export function survivalAt(c: Curve, time: number) {
  let v = 1;
  for (let i = 0; i < c.t.length; i++) { if (c.t[i] <= time) v = c.s[i]; else break; }
  return v;
}

/** Keep the k largest weights (local neighbourhood); everything else 0. */
export function topK(w: number[], k: number) {
  const order = w.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
  const out = new Array(w.length).fill(0);
  for (let r = 0; r < Math.min(k, order.length); r++) out[order[r][1]] = order[r][0];
  return out;
}

/** Effective number of neighbours behind a prediction; small => uncertain. */
export const effectiveN = (w: number[]) => { const s = w.reduce((a, b) => a + b, 0), s2 = w.reduce((a, b) => a + b * b, 0); return s2 > 0 ? (s * s) / s2 : 0; };

/** Harrell's concordance index (higher risk should fail sooner). */
export function cIndex(risk: number[], times: number[], events: number[]) {
  let num = 0, den = 0;
  for (let i = 0; i < risk.length; i++) {
    if (!events[i]) continue;
    for (let j = 0; j < risk.length; j++) {
      if (times[j] > times[i]) {
        den++;
        if (risk[i] > risk[j]) num++;
        else if (risk[i] === risk[j]) num += 0.5;
      }
    }
  }
  return den ? num / den : 0.5;
}

export function bootstrapCI(risk: number[], times: number[], events: number[], rand: () => number, B = 400) {
  const n = risk.length, vals: number[] = [];
  for (let b = 0; b < B; b++) {
    const r: number[] = [], t: number[] = [], e: number[] = [];
    for (let i = 0; i < n; i++) { const k = Math.floor(rand() * n); r.push(risk[k]); t.push(times[k]); e.push(events[k]); }
    vals.push(cIndex(r, t, e));
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(0.025 * B)], vals[Math.floor(0.975 * B)]] as [number, number];
}

/** Two-group log-rank test; returns chi-square (1 df) and p-value. */
export function logRank(times: number[], events: number[], group: number[]) {
  const uniq = Array.from(new Set(times.filter((_, i) => events[i]))).sort((a, b) => a - b);
  let O1 = 0, E1 = 0, V = 0;
  for (const t of uniq) {
    let n = 0, n1 = 0, d = 0, d1 = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= t) { n++; if (group[i]) n1++; }
      if (times[i] === t && events[i]) { d++; if (group[i]) d1++; }
    }
    if (n < 2) continue;
    O1 += d1; E1 += (d * n1) / n;
    V += (d * (n1 / n) * (1 - n1 / n) * (n - d)) / (n - 1);
  }
  const chi = V > 0 ? (O1 - E1) ** 2 / V : 0;
  // p-value for chi-square with 1 df: erfc(sqrt(chi/2))
  const x = Math.sqrt(chi / 2);
  const t = 1 / (1 + 0.3275911 * x);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return { chi, p: erfc };
}
