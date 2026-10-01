import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useSpring } from "framer-motion";
import { Curve } from "../lib/survival";
import { Vec3 } from "../lib/quantum";
import { Cohort } from "../lib/cohort";

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/* ---------- shared animation clock (one rAF loop for every sphere) ---------- */
const subs = new Set<(t: number) => void>();
let raf = 0;
function loop(t: number) { subs.forEach((f) => f(t / 1000)); raf = requestAnimationFrame(loop); }
export function useTicker(fn: (t: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f = (t: number) => ref.current(t);
    subs.add(f);
    if (subs.size === 1) raf = requestAnimationFrame(loop);
    return () => { subs.delete(f); if (!subs.size) cancelAnimationFrame(raf); };
  }, []);
}
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------- survival curves ---------- */
export interface Series { curve: Curve; color: string; label: string; dash?: string; width?: number }
export function SurvivalChart({ series, horizon, maxT = 120, height = 260 }: { series: Series[]; horizon?: number; maxT?: number; height?: number }) {
  const W = 620, H = height, L = 40, R = 14, T = 14, B = 34;
  const x = (t: number) => L + (Math.min(t, maxT) / maxT) * (W - L - R);
  const y = (s: number) => T + (1 - s) * (H - T - B);
  const path = (c: Curve) => {
    let d = `M${x(0)},${y(1)}`;
    for (let i = 1; i < c.t.length; i++) { if (c.t[i] > maxT) break; d += `H${x(c.t[i])}V${y(c.s[i])}`; }
    return d + `H${x(maxT)}`;
  };
  const ticks = [];
  for (let t = 0; t <= maxT; t += 24) ticks.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Predicted cancer-free survival curves" style={{ display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((s) => (
        <g key={s}>
          <line x1={L} x2={W - R} y1={y(s)} y2={y(s)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 8} y={y(s) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{s * 100}%</text>
        </g>
      ))}
      {ticks.map((t) => (<text key={t} x={x(t)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{t / 12}y</text>))}
      <text x={W - R} y={H - 0} textAnchor="end" fontSize={10.5} fill="var(--ink-3)">Years since biopsy</text>
      {horizon !== undefined && (
        <g>
          <line x1={x(horizon)} x2={x(horizon)} y1={T} y2={H - B} stroke="var(--ink-3)" strokeDasharray="3 4" />
          <text x={x(horizon) + 5} y={T + 10} fontSize={11} fill="var(--ink-2)">{horizon / 12}-year risk</text>
        </g>
      )}
      {series.map((s, i) => (
        <motion.path key={s.label + path(s.curve)} d={path(s.curve)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.6} strokeDasharray={s.dash}
          initial={{ pathLength: reduceMotion() ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: i * 0.12, ease: "easeInOut" }} />
      ))}
    </svg>
  );
}

/* ---------- risk dial ---------- */
export function RiskDial({ risk, size = 220 }: { risk: number; size?: number }) {
  const sp = useSpring(0, { stiffness: 70, damping: 18 });
  useEffect(() => { sp.set(risk); }, [risk, sp]);
  const [shown, setShown] = useState(0);
  useEffect(() => sp.on("change", (v) => setShown(v)), [sp]);
  const r = 80, cx = 100, cy = 100, v = Math.min(Math.max(shown, 0), 1);
  const pt = (a: number) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
  const arc = (a0: number, a1: number) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`; };
  const col = v >= 0.5 ? "var(--eosin)" : v >= 0.25 ? "var(--amber)" : "var(--teal)";
  const [tx, ty] = pt(v);
  return (
    <svg viewBox="0 0 200 112" width={size} role="img" aria-label={`Predicted risk ${pct(risk)}`}>
      <path d={arc(0, 1)} stroke="var(--surface-2)" strokeWidth={16} fill="none" strokeLinecap="round" />
      {[0.25, 0.5].map((t) => { const [a, b] = pt(t); const [c, d] = [cx + (r - 13) * Math.cos(Math.PI * (1 - t)), cy - (r - 13) * Math.sin(Math.PI * (1 - t))]; return <line key={t} x1={a} y1={b} x2={c} y2={d} stroke="var(--ink-3)" strokeWidth={1.2} />; })}
      {v > 0.002 && <path d={arc(0, v)} stroke={col} strokeWidth={16} fill="none" strokeLinecap="round" />}
      <circle cx={tx} cy={ty} r={9} fill="var(--surface)" stroke={col} strokeWidth={3} />
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={40} fontWeight={800} fill="var(--ink)" style={{ fontFamily: "var(--display)" }}>{Math.round(v * 100)}%</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">3-year risk</text>
    </svg>
  );
}

/* ---------- diverging bars ---------- */
export function Bars({ items, domain, format = (v) => v.toFixed(2), posColor = "var(--violet)", negColor = "var(--teal)", labelW = 112, oneSided = false }: { items: { label: string; value: number }[]; domain: number; format?: (v: number) => string; posColor?: string; negColor?: string; labelW?: number; oneSided?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((it) => {
        const half = oneSided ? 100 : 50, origin = oneSided ? 0 : 50;
        const w = Math.min(Math.abs(it.value) / domain, 1) * half;
        return (
          <div key={it.label} style={{ display: "grid", gridTemplateColumns: `${labelW}px 1fr 44px`, alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            <div style={{ position: "relative", height: 12, background: "var(--surface-2)", borderRadius: 6 }}>
              {!oneSided && <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "var(--ink-3)" }} />}
              <motion.div initial={false} animate={{ width: `${w}%`, left: it.value >= 0 ? `${origin}%` : `${origin - w}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }}
                style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 6, background: it.value >= 0 ? posColor : negColor }} />
            </div>
            <span style={{ textAlign: "right", fontWeight: 600 }}>{format(it.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- kernel heatmap ---------- */
export function Heatmap({ K, order, size = 260, label, themeKey }: { K: number[][]; order?: number[]; size?: number; label: string; themeKey?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ i: number; j: number; v: number } | null>(null);
  const ord = useMemo(() => order ?? K.map((_, i) => i), [K, order]);
  useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const n = K.length, dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    const hex = (h: string) => { const m = h.replace("#", ""); const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m; return [0, 2, 4].map((k) => parseInt(v.slice(k, k + 2), 16)); };
    const lo = hex(cssVar("--surface-2")), hi = hex(cssVar("--violet")), neg = hex(cssVar("--eosin"));
    const cell = (size * dpr) / n;
    let mn = Infinity, mx = -Infinity;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) { mn = Math.min(mn, K[a][b]); mx = Math.max(mx, K[a][b]); }
    const span = mx - mn || 1;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const v = K[ord[a]][ord[b]];
      const col = v < 0 ? neg : hi, t = v < 0 ? Math.min(-v / Math.max(-mn, 1e-6), 1) : Math.min(Math.max((v - Math.max(mn, 0)) / (mx - Math.max(mn, 0) || span), 0), 1);
      const rgb = lo.map((l, k) => Math.round(l + (col[k] - l) * Math.pow(t, 0.8)));
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(b * cell, a * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }, [K, ord, size, themeKey]);
  return (
    <figure style={{ margin: 0 }}>
      <canvas ref={ref} style={{ width: size, height: size, maxWidth: "100%", borderRadius: 8, display: "block" }} aria-label={label}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const n = K.length; const j = Math.floor(((e.clientX - r.left) / r.width) * n), i = Math.floor(((e.clientY - r.top) / r.height) * n); if (i >= 0 && j >= 0 && i < n && j < n) setHover({ i: ord[i], j: ord[j], v: K[ord[i]][ord[j]] }); }}
        onMouseLeave={() => setHover(null)} />
      <figcaption className="tiny muted" style={{ marginTop: 6, minHeight: 18 }}>{hover ? `Patients ${hover.i + 1} and ${hover.j + 1}: similarity ${hover.v.toFixed(3)}` : label}</figcaption>
    </figure>
  );
}

/* ---------- Bloch sphere (pseudo-3D SVG, shared clock) ---------- */
export function BlochSphere({ v, size = 96, color = "var(--violet)", ghost, spin = true }: { v: Vec3; size?: number; color?: string; ghost?: Vec3; spin?: boolean }) {
  const cur = useRef<Vec3>([...v]);
  const g = useRef<Vec3 | undefined>(ghost);
  const tgt = useRef(v); tgt.current = v; g.current = ghost;
  const arrow = useRef<SVGLineElement>(null), tip = useRef<SVGCircleElement>(null), shadow = useRef<SVGLineElement>(null);
  const garrow = useRef<SVGLineElement>(null);
  const R = 40, e = (22 * Math.PI) / 180, still = reduceMotion() || !spin;
  const project = (p: Vec3, phi: number) => {
    const x1 = p[0] * Math.cos(phi) - p[1] * Math.sin(phi), y1 = p[0] * Math.sin(phi) + p[1] * Math.cos(phi);
    return { X: 50 + R * x1, Y: 50 - R * (p[2] * Math.cos(e) + y1 * Math.sin(e)), Yeq: 50 - R * (y1 * Math.sin(e)), depth: y1 };
  };
  useTicker((t) => {
    const c = cur.current, T = tgt.current;
    for (let k = 0; k < 3; k++) c[k] += (T[k] - c[k]) * 0.12;
    const phi = still ? 0.6 : 0.6 + t * 0.35;
    const p = project(c, phi);
    arrow.current?.setAttribute("x2", String(p.X)); arrow.current?.setAttribute("y2", String(p.Y));
    tip.current?.setAttribute("cx", String(p.X)); tip.current?.setAttribute("cy", String(p.Y));
    tip.current?.setAttribute("r", String(3.2 + 1.2 * (p.depth < 0 ? 1 : 0.4)));
    shadow.current?.setAttribute("x1", String(p.X)); shadow.current?.setAttribute("y1", String(p.Y));
    shadow.current?.setAttribute("x2", String(p.X)); shadow.current?.setAttribute("y2", String(p.Yeq));
    if (g.current && garrow.current) { const q = project(g.current, phi); garrow.current.setAttribute("x2", String(q.X)); garrow.current.setAttribute("y2", String(q.Y)); }
  });
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx={50} cy={50} r={R} fill="var(--surface-2)" opacity={0.55} stroke="var(--line)" />
      <ellipse cx={50} cy={50} rx={R} ry={R * Math.sin(e)} fill="none" stroke="var(--ink-3)" strokeOpacity={0.45} strokeDasharray="2 3" />
      <line x1={50} y1={10} x2={50} y2={90} stroke="var(--ink-3)" strokeOpacity={0.35} />
      <text x={50} y={8} textAnchor="middle" fontSize={8} fill="var(--ink-3)">|0⟩</text>
      <text x={50} y={99} textAnchor="middle" fontSize={8} fill="var(--ink-3)">|1⟩</text>
      {ghost && <line ref={garrow} x1={50} y1={50} x2={50} y2={50} stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="3 2" strokeLinecap="round" />}
      <line ref={shadow} stroke={color} strokeOpacity={0.35} strokeDasharray="1.5 2" />
      <line ref={arrow} x1={50} y1={50} x2={50} y2={50} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      <circle ref={tip} cx={50} cy={50} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={1} />
      <circle cx={50} cy={50} r={1.8} fill="var(--ink-2)" />
    </svg>
  );
}

/* ---------- pathway graph (qubits wired like biology) ---------- */
export function PathwayGraph({ cohort, z, size = 300, activeEdges }: { cohort: Cohort; z?: number[]; size?: number; activeEdges?: [number, number][] }) {
  const n = cohort.pathways.length, c = 150, rad = 112;
  const pos = cohort.pathways.map((_, k) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / n; return [c + rad * Math.cos(a), c + rad * Math.sin(a)]; });
  const isActive = (a: number, b: number) => activeEdges?.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return (
    <svg viewBox="0 0 300 300" width="100%" style={{ maxWidth: size, display: "block", margin: "0 auto" }} role="img" aria-label="Pathway crosstalk graph; each node is one qubit">
      {cohort.edges.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]}
          stroke={isActive(a, b) ? "var(--eosin)" : "var(--ink-3)"} strokeOpacity={isActive(a, b) ? 1 : 0.5} strokeWidth={isActive(a, b) ? 3 : 1.6} style={{ transition: "all .3s" }} />
      ))}
      {cohort.pathways.map((p, k) => {
        const v = z ? Math.max(-2.5, Math.min(2.5, z[k])) / 2.5 : 0;
        const fill = v >= 0 ? "var(--violet)" : "var(--teal)";
        const [x, y] = pos[k];
        const lx = c + (rad + 30) * Math.cos(-Math.PI / 2 + (2 * Math.PI * k) / n), ly = c + (rad + 30) * Math.sin(-Math.PI / 2 + (2 * Math.PI * k) / n);
        return (
          <g key={p.key}>
            <circle cx={x} cy={y} r={15} fill="var(--surface)" stroke="var(--line)" />
            <circle cx={x} cy={y} r={15} fill={fill} style={{ transition: "opacity .5s" }} opacity={z ? 0.15 + 0.85 * Math.abs(v) : 0.2} />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="var(--ink)">q{k}</text>
            <text x={lx} y={ly + 3} textAnchor="middle" fontSize={9.5} fill="var(--ink-2)">{p.short}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- forest plot ---------- */
export function Forest({ rows, lo = 0.4, hi = 1 }: { rows: { label: string; c: number; ci: [number, number]; color: string; note?: string }[]; lo?: number; hi?: number }) {
  const W = 760, rowH = 44, L = 250, R = 70, H = rows.length * rowH + 34;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }} role="img" aria-label="Concordance index with 95% confidence intervals">
      <line x1={x(0.5)} x2={x(0.5)} y1={6} y2={H - 26} stroke="var(--ink-3)" strokeDasharray="3 4" />
      <text x={x(0.5)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">0.5 = chance</text>
      {[0.6, 0.7, 0.8, 0.9].filter((t) => t < hi).map((t) => (<text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{t.toFixed(1)}</text>))}
      {rows.map((r, i) => {
        const cy = 18 + i * rowH;
        return (
          <g key={r.label}>
            <text x={0} y={cy + 4} fontSize={13} fontWeight={600} fill="var(--ink)">{r.label}</text>
            {r.note && <text x={0} y={cy + 18} fontSize={10.5} fill="var(--ink-3)">{r.note}</text>}
            <motion.line initial={{ x1: x(r.c), x2: x(r.c) }} animate={{ x1: x(r.ci[0]), x2: x(r.ci[1]) }} transition={{ duration: 0.8 }} y1={cy} y2={cy} stroke={r.color} strokeWidth={3} strokeLinecap="round" />
            <rect x={x(r.c) - 6} y={cy - 6} width={12} height={12} rx={2} fill={r.color} />
            <text x={W - 4} y={cy + 4} textAnchor="end" fontSize={13} fontWeight={700} fill="var(--ink)">{r.c.toFixed(3)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- line chart with ±1 sd band ---------- */
export function LineBand({ series, xLabel, yRange = [0.3, 1] }: { series: { label: string; color: string; pts: { x: number; mean: number; sd: number }[] }[]; xLabel: string; yRange?: [number, number] }) {
  const W = 560, H = 240, L = 44, R = 14, T = 12, B = 36;
  const xs = series[0]?.pts.map((p) => p.x) ?? [0, 1];
  const x = (v: number) => L + ((v - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yRange[0]) / (yRange[1] - yRange[0])) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Performance versus number of patients">
      {[0.4, 0.5, 0.6, 0.7, 0.8, 0.9].filter((v) => v >= yRange[0] && v <= yRange[1]).map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{v.toFixed(1)}</text></g>
      ))}
      {xs.map((v) => (<text key={v} x={x(v)} y={H - 16} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{v}</text>))}
      <text x={(W + L) / 2} y={H - 2} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{xLabel}</text>
      {series.map((s) => {
        const band = s.pts.map((p) => `${x(p.x)},${y(Math.min(p.mean + p.sd, yRange[1]))}`).join(" ") + " " + [...s.pts].reverse().map((p) => `${x(p.x)},${y(Math.max(p.mean - p.sd, yRange[0]))}`).join(" ");
        const line = s.pts.map((p, i) => `${i ? "L" : "M"}${x(p.x)},${y(p.mean)}`).join("");
        return (
          <g key={s.label}>
            <polygon points={band} fill={s.color} opacity={0.14} />
            <motion.path d={line} fill="none" stroke={s.color} strokeWidth={2.6} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
            {s.pts.map((p) => (<circle key={p.x} cx={x(p.x)} cy={y(p.mean)} r={3.5} fill={s.color} />))}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- genes -> pathways collapse (canvas) ---------- */
export function GeneStrip({ z, labels, run, height = 150, onDone }: { z: number[]; labels: string[]; run: number; height?: number; onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = ref.current, box = wrap.current; if (!c || !box) return;
    const W = box.clientWidth, H = height, dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + "px"; c.style.height = H + "px";
    const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr);
    const G = 20000, P = z.length, mid = H / 2 - 8, amp = H / 2 - 22;
    // deterministic pseudo-random gene field derived from the pathway scores
    let seed = 1234 + Math.round(z.reduce((a, b) => a + b * 97, 0));
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const gx = new Float32Array(G), gv = new Float32Array(G), tx = new Float32Array(G), gp = new Uint8Array(G);
    const barW = W / P;
    for (let g = 0; g < G; g++) {
      const p = Math.floor(rnd() * P);
      gp[g] = p; gx[g] = rnd() * W;
      gv[g] = (z[p] * 0.55 + (rnd() - 0.5) * 2.6) / 3;
      tx[g] = p * barW + barW * 0.18 + rnd() * barW * 0.64;
    }
    const violet = cssVar("--violet"), teal = cssVar("--teal"), ink = cssVar("--ink-2");
    const t0 = performance.now(), dur = reduceMotion() ? 1 : 1700;
    let id = 0;
    const draw = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const e = t < 0.25 ? 0 : (() => { const u = (t - 0.25) / 0.75; return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; })();
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 0.55 - 0.25 * e;
      for (let g = 0; g < G; g++) {
        const target = Math.max(-1, Math.min(1, z[gp[g]] / 2.5));
        const v = gv[g] * (1 - e) + target * e;
        const xx = gx[g] * (1 - e) + tx[g] * e;
        ctx.fillStyle = v >= 0 ? violet : teal;
        const h = Math.abs(v) * amp;
        ctx.fillRect(xx, v >= 0 ? mid - h : mid, 1, Math.max(h, 0.6));
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink; ctx.font = "11px Figtree, system-ui"; ctx.textAlign = "center";
      if (e > 0.6) { ctx.globalAlpha = (e - 0.6) / 0.4; if (barW >= 34) labels.forEach((l, p) => ctx.fillText(l, p * barW + barW / 2, H - 4)); else { ctx.textAlign = "left"; ctx.fillText(`${P} pathway scores`, 2, H - 4); } ctx.globalAlpha = 1; }
      else { ctx.textAlign = "left"; ctx.fillText("20,000 genes", 2, H - 4); }
      if (t < 1) id = requestAnimationFrame(draw); else onDone?.();
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, z.join(","), height]);
  return <div ref={wrap} style={{ width: "100%" }}><canvas ref={ref} aria-label="Gene expression collapsing into pathway scores" /></div>;
}
