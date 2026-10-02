/**
 * Gene-activity files -> 12 pathway scores in the browser.
 *
 * ssGSEA (Barbie et al., Nature 2009) as run by the engine through gseapy with sample_norm_method="rank": genes are
 * ranked within each sample (average ties, scaled to 10,000), weighted by rank^0.25, and the enrichment score is the
 * sum of the running difference between the weighted hit and miss distributions. Scores are then standardised across
 * the uploaded samples, exactly as engine/pathways.py does. On test data this matches gseapy to 3 x 10^-4 after
 * standardisation (enrichment scores within 0.1%).
 */

export interface ExprTable { genes: string[]; samples: string[]; values: Float64Array[]; labels: (string | null)[] | null; dropped: number }

const LABEL_ROW = /^(diagnosis|label|labels|class|status|group|histology)$/i;

/** Genes as rows, samples as columns; optional row named "diagnosis" (or label/class/status/group) with one value per sample. */
export function parseExpression(text: string): ExprTable {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length);
  if (lines.length < 3) throw new Error("The file has fewer than 3 lines.");
  const delim = (lines[0].match(/\t/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  const header = split(lines[0]);
  const samples = header.slice(1);
  if (samples.length < 3) throw new Error("Expected genes as rows and at least 3 samples as columns, with gene symbols in the first column.");
  let labels: (string | null)[] | null = null;
  const byGene = new Map<string, { sum: Float64Array; n: number }>();
  let dropped = 0;
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const key = cells[0];
    if (!key) continue;
    if (LABEL_ROW.test(key)) { labels = samples.map((_, j) => (cells[j + 1] ?? "").trim() || null); continue; }
    const vals = new Float64Array(samples.length);
    let ok = true;
    for (let j = 0; j < samples.length; j++) { const v = Number(cells[j + 1]); if (!Number.isFinite(v)) { ok = false; break; } vals[j] = v; }
    if (!ok) { dropped++; continue; }
    const sym = key.toUpperCase();
    const cur = byGene.get(sym);
    if (cur) { for (let j = 0; j < vals.length; j++) cur.sum[j] += vals[j]; cur.n++; }
    else byGene.set(sym, { sum: vals, n: 1 });
  }
  const genes = [...byGene.keys()];
  if (genes.length < 500) throw new Error(`Only ${genes.length} genes were readable. Rows must be gene symbols (e.g. TP53, MYC) with numeric values; for GEO probe IDs, use the engine.`);
  const values = genes.map((g) => { const e = byGene.get(g)!; return e.n === 1 ? e.sum : e.sum.map((x) => x / e.n); });
  return { genes, samples, values, labels, dropped };
}

/** Average ranks (1 = lowest) of one column. */
function averageRanks(col: Float64Array): Float64Array {
  const n = col.length, idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => col[a] - col[b]);
  const r = new Float64Array(n);
  for (let i = 0; i < n;) {
    let j = i; while (j + 1 < n && col[idx[j + 1]] === col[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}

export interface ScoreResult { z: number[][]; raw: number[][]; coverage: { key: string; found: number; size: number }[] }

/** Sample x pathway ssGSEA scores, standardised across samples (as the engine does). */
export function ssgseaScores(t: ExprTable, sets: Record<string, string[]>, keys: string[], minSize = 10): ScoreResult {
  const G = t.genes.length, N = t.samples.length;
  const pos = new Map(t.genes.map((g, i) => [g, i]));
  const members = keys.map((k) => { const s = sets[k] ?? []; const ids = [...new Set(s.map((g) => pos.get(g.toUpperCase())).filter((i): i is number => i !== undefined))]; return { k, ids, size: s.length }; });
  const coverage = members.map((m) => ({ key: m.k, found: m.ids.length, size: m.size }));
  const short = coverage.filter((c) => c.found < minSize);
  if (short.length) throw new Error(`Too few genes found for ${short.map((c) => `${c.key} (${c.found} of ${c.size})`).join(", ")}. Gene symbols must match MSigDB Hallmark symbols.`);
  const raw: number[][] = Array.from({ length: N }, () => new Array(keys.length).fill(0));
  const isHit = members.map((m) => { const h = new Uint8Array(G); m.ids.forEach((i) => (h[i] = 1)); return h; });
  for (let j = 0; j < N; j++) {
    const col = new Float64Array(G); for (let i = 0; i < G; i++) col[i] = t.values[i][j];
    const r = averageRanks(col);
    const w = new Float64Array(G); for (let i = 0; i < G; i++) w[i] = Math.pow((10000 * r[i]) / G, 0.25);
    const order = Array.from({ length: G }, (_, i) => i).sort((a, b) => r[b] - r[a] || a - b); // highest first, stable
    members.forEach((m, p) => {
      const hit = isHit[p];
      let wsum = 0; for (const i of m.ids) wsum += w[i];
      const nMiss = G - m.ids.length;
      let ph = 0, pm = 0, es = 0;
      for (const i of order) { if (hit[i]) ph += w[i] / wsum; else pm += 1 / nMiss; es += ph - pm; }
      raw[j][p] = es;
    });
  }
  const z = raw.map((row) => row.slice());
  for (let p = 0; p < keys.length; p++) {
    const col = raw.map((row) => row[p]), mean = col.reduce((a, b) => a + b, 0) / N;
    const sd = Math.sqrt(col.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(N - 1, 1)) || 1;
    for (let j = 0; j < N; j++) z[j][p] = (raw[j][p] - mean) / sd;
  }
  return { z, raw, coverage };
}
