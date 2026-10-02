import { CSSProperties, ReactNode, useLayoutEffect, useRef } from "react";
import { motion, MotionValue, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Curve } from "../lib/survival";

/**
 * Shared "cinematic" building blocks for the interior pages, in the darkfield style of the patient case file:
 * a hero with live figures and a small animated illustration, scroll reveals, numbered chapters, and a
 * scroll-stacked card deck.
 */

const EASE = [0.2, 0.7, 0.2, 1] as const;

export interface HeroStat { value: ReactNode; label: string }

export function PageHero({ kicker, title, lede, stats, art, children }: { kicker: string; title: ReactNode; lede: ReactNode; stats?: HeroStat[]; art?: ReactNode; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE, delay: d } });
  return (
    <section className="cine-hero">
      <div className="cine-hero-copy">
        <motion.div className="case-kicker" {...rise(0)}>{kicker}</motion.div>
        <motion.h2 className="cine-title" {...rise(0.06)}>{title}</motion.h2>
        <motion.p className="cine-lede" {...rise(0.12)}>{lede}</motion.p>
        {stats && stats.length > 0 && (
          <motion.div className="cine-stats" {...rise(0.18)}>
            {stats.map((s) => <div className="cine-stat" key={s.label}><div className="cine-stat-num">{s.value}</div><div className="cine-stat-lbl">{s.label}</div></div>)}
          </motion.div>
        )}
        {children && <motion.div className="row" style={{ marginTop: 18 }} {...rise(0.24)}>{children}</motion.div>}
      </div>
      {art && <motion.div className="cine-art" aria-hidden="true" {...(reduce ? {} : { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.9, ease: EASE, delay: 0.1 } })}>{art}</motion.div>}
    </section>
  );
}

/** Fades and lifts its content into place the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className, style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} style={style}>{children}</div>;
  return (
    <motion.div className={className} style={style} initial={{ opacity: 0, y: 34, scale: 0.985 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }} transition={{ duration: 0.75, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

/** Numbered chapter heading that splits a long page into acts. */
export function Chapter({ n, title, lede }: { n: number; title: string; lede?: ReactNode }) {
  return (
    <Reveal className="chapter">
      <span className="chapter-n">{String(n).padStart(2, "0")}</span>
      <div><h3 className="chapter-title">{title}</h3>{lede && <p className="chapter-lede">{lede}</p>}</div>
    </Reveal>
  );
}

export interface StackItem { key: string; kicker: string; figure: ReactNode; caption: string; title: ReactNode; body: ReactNode; art?: ReactNode }

/** Cards pin one over another as the page scrolls; earlier cards recede behind the newest. */
export function CardStack({ items, label }: { items: StackItem[]; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  // Natural (unpinned) top of each card in page coordinates. Sticky cards report their pinned position,
  // so this is rebuilt from the stack's own top, the card heights and the gap between them.
  const tops = useRef<number[]>([]);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el), gap = parseFloat(cs.rowGap) || 0;
      let y = el.getBoundingClientRect().top + window.scrollY + (parseFloat(cs.paddingTop) || 0);
      tops.current = [...el.children].map((c) => { const t = y; y += (c as HTMLElement).offsetHeight + gap; return t; });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [items.length]);
  const { scrollY } = useScroll();
  return (
    <div ref={box} className="stack" aria-label={label}>
      {items.map((it, i) => <StackCard key={it.key} it={it} i={i} n={items.length} scrollY={scrollY} tops={tops} />)}
    </div>
  );
}

/** A card recedes (shrinks and dims) only while the next card slides up over it. */
function StackCard({ it, i, n, scrollY, tops }: { it: StackItem; i: number; n: number; scrollY: MotionValue<number>; tops: { current: number[] } }) {
  const reduce = useReducedMotion();
  const last = i === n - 1;
  // 0 when the next card's top enters the bottom of the screen, 1 when it has slid up to its pinned place
  const cover = useTransform(scrollY, (y) => {
    const next = tops.current[i + 1];
    if (last || next === undefined) return 0;
    const vh = window.innerHeight, pinned = 24 + (i + 1) * 16;
    return Math.min(1, Math.max(0, (y - (next - vh)) / Math.max(vh - pinned, 1)));
  });
  const scale = useTransform(cover, [0, 1], [1, 0.94]);
  const dim = useTransform(cover, [0.45, 1], [0, 0.5]);
  return (
    <div className="stack-slot" style={{ top: `calc(var(--stack-top) + ${i * 16}px)` }}>
      <motion.article className="stack-card" style={reduce ? undefined : { scale }}>
        <div className="stack-index">{String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")} · {it.kicker}</div>
        <div className="stack-grid">
          <div>
            <div className="stack-figure">{it.figure}</div>
            <div className="stack-caption">{it.caption}</div>
            {it.art && <div className="stack-art">{it.art}</div>}
          </div>
          <div>
            <h3 className="stack-title">{it.title}</h3>
            <div className="stack-body">{it.body}</div>
          </div>
        </div>
        {!reduce && <motion.div className="stack-dim" style={{ opacity: dim }} />}
      </motion.article>
    </div>
  );
}

/* ---------------- hero illustrations (decorative, animated in CSS) ---------------- */

const CX = 160, CY = 130;
const ring = (k: number, n: number, r: number) => [CX + r * Math.cos((2 * Math.PI * k) / n - Math.PI / 2), CY + r * Math.sin((2 * Math.PI * k) / n - Math.PI / 2)];

function Defs() {
  return (
    <defs>
      <linearGradient id="cine-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#9c8cff" /><stop offset="1" stopColor="#ff7a9f" /></linearGradient>
      <radialGradient id="cine-glow"><stop offset="0" stopColor="#9c8cff" stopOpacity=".55" /><stop offset="1" stopColor="#9c8cff" stopOpacity="0" /></radialGradient>
    </defs>
  );
}

/** Pathway graph as a ring of qubits, wired by the cohort's crosstalk edges. */
export function OrbitArt({ n, edges }: { n: number; edges: [number, number][] }) {
  const pts = Array.from({ length: n }, (_, k) => ring(k, n, 96));
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      <circle cx={CX} cy={CY} r={70} fill="url(#cine-glow)" />
      <circle cx={CX} cy={CY} r={118} className="art-spin" fill="none" stroke="rgba(255,255,255,.14)" strokeDasharray="2 7" />
      {edges.map(([a, b], i) => {
        const [x1, y1] = pts[a], [x2, y2] = pts[b];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, qx = mx + (CX - mx) * 0.55, qy = my + (CY - my) * 0.55;
        return <path key={i} d={`M${x1},${y1} Q${qx},${qy} ${x2},${y2}`} fill="none" stroke="url(#cine-g)" strokeWidth={1.4} className="art-dash" style={{ animationDelay: `${-i * 0.6}s` }} />;
      })}
      {pts.map(([x, y], k) => (
        <g key={k}>
          <circle cx={x} cy={y} r={11} fill="rgba(156,140,255,.12)" className="art-pulse" style={{ animationDelay: `${k * 0.22}s` }} />
          <circle cx={x} cy={y} r={4.5} fill={k % 3 === 0 ? "#ff7a9f" : "#c9c0ff"} />
        </g>
      ))}
    </svg>
  );
}

/** Twelve qubit wires with gates and a scan line sweeping through the circuit. */
export function WiresArt({ n, edges }: { n: number; edges: [number, number][] }) {
  const y = (k: number) => 26 + (k * 208) / Math.max(n - 1, 1);
  const cols = [62, 112, 172, 222, 272];
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      {Array.from({ length: n }, (_, k) => <line key={k} x1={20} x2={304} y1={y(k)} y2={y(k)} stroke="rgba(255,255,255,.16)" />)}
      {Array.from({ length: n }, (_, k) => <rect key={k} x={30} y={y(k) - 5} width={12} height={10} rx={2.5} fill="rgba(79,209,197,.5)" />)}
      {edges.slice(0, 10).map(([a, b], i) => {
        const x = cols[(i % 3) + 1] + (i % 2) * 10;
        return <g key={i} className="art-glow" style={{ animationDelay: `${i * 0.35}s` }}><line x1={x} x2={x} y1={y(a)} y2={y(b)} stroke="#ff7a9f" strokeWidth={1.6} /><circle cx={x} cy={y(a)} r={3.2} fill="#ff7a9f" /><circle cx={x} cy={y(b)} r={3.2} fill="#ff7a9f" /></g>;
      })}
      {Array.from({ length: n }, (_, k) => <rect key={k} x={cols[0] - 6} y={y(k) - 5} width={12} height={10} rx={2.5} fill="rgba(156,140,255,.55)" />)}
      {Array.from({ length: n }, (_, k) => <rect key={k} x={cols[4] - 6} y={y(k) - 5} width={12} height={10} rx={2.5} fill="rgba(156,140,255,.55)" />)}
      <rect x={0} y={12} width={34} height={236} fill="url(#cine-g)" opacity={0.22} className="art-scan" />
    </svg>
  );
}

/** A 12-qubit chip: couplers follow the pathway edges and qubits light in turn. */
export function ChipArt({ n, edges }: { n: number; edges: [number, number][] }) {
  const cols = 4, pos = (k: number) => [70 + (k % cols) * 60, 62 + Math.floor(k / cols) * 68];
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      <rect x={34} y={26} width={252} height={208} rx={18} fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.18)" />
      {Array.from({ length: 9 }, (_, i) => <g key={i}><line x1={58 + i * 25} x2={58 + i * 25} y1={14} y2={26} stroke="rgba(255,255,255,.2)" /><line x1={58 + i * 25} x2={58 + i * 25} y1={234} y2={246} stroke="rgba(255,255,255,.2)" /></g>)}
      {edges.map(([a, b], i) => { const [x1, y1] = pos(a), [x2, y2] = pos(b); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#cine-g)" strokeWidth={1.5} opacity={0.55} className="art-dash" style={{ animationDelay: `${-i * 0.5}s` }} />; })}
      {Array.from({ length: n }, (_, k) => { const [x, y] = pos(k); return <g key={k}><rect x={x - 13} y={y - 13} width={26} height={26} rx={7} fill="rgba(79,209,197,.12)" stroke="rgba(79,209,197,.55)" /><rect x={x - 6} y={y - 6} width={12} height={12} rx={3} fill="#4fd1c5" className="art-glow" style={{ animationDelay: `${k * 0.28}s` }} /></g>; })}
    </svg>
  );
}

/** Two groups of patients drifting apart: the separation an advantage needs. */
export function SplitArt() {
  const dots = Array.from({ length: 64 }, (_, i) => { const a = i * 2.39996, r = 10 + 8.5 * Math.sqrt(i); return [Math.cos(a) * r, Math.sin(a) * r * 0.8, i % 2] as const; });
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      <circle cx={CX} cy={CY} r={80} fill="url(#cine-glow)" />
      <g className="art-drift-l">{dots.filter((d) => d[2] === 0).map(([x, y], i) => <circle key={i} cx={CX + x} cy={CY + y} r={3.4} fill="#ff7a9f" opacity={0.85} />)}</g>
      <g className="art-drift-r">{dots.filter((d) => d[2] === 1).map(([x, y], i) => <circle key={i} cx={CX + x} cy={CY + y} r={3.4} fill="#4fd1c5" opacity={0.85} />)}</g>
      <line x1={CX} x2={CX} y1={40} y2={220} stroke="rgba(255,255,255,.22)" strokeDasharray="3 6" />
    </svg>
  );
}

/** Three groups of tissue samples (normal, dysplasia, cancer) drifting apart. */
export function TissueArt() {
  const groups: [string, number, number, number][] = [["#4fd1c5", 92, 150, 0], ["#e9b44c", 160, 92, 1], ["#ff7a9f", 228, 158, 2]];
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      <circle cx={CX} cy={CY} r={95} fill="url(#cine-glow)" />
      {groups.map(([c, gx, gy, g]) => (
        <g key={g} className={g === 0 ? "art-drift-l" : g === 2 ? "art-drift-r" : undefined}>
          {Array.from({ length: g === 1 ? 9 : 22 }, (_, i) => { const a = i * 2.39996 + g, r = 4 + 5.2 * Math.sqrt(i); return <circle key={i} cx={gx + Math.cos(a) * r} cy={gy + Math.sin(a) * r} r={3.3} fill={c} opacity={0.88} />; })}
        </g>
      ))}
      <text x={92} y={212} fill="rgba(238,235,250,.6)" fontSize={12} textAnchor="middle">normal</text>
      <text x={160} y={44} fill="rgba(238,235,250,.6)" fontSize={12} textAnchor="middle">dysplasia</text>
      <text x={228} y={220} fill="rgba(238,235,250,.6)" fontSize={12} textAnchor="middle">cancer</text>
    </svg>
  );
}

/** A dial sweeping across classical, wait and go. */
export function DialArt() {
  const arc = (a0: number, a1: number, r: number) => { const p = (a: number) => [CX + r * Math.cos(Math.PI * (1 - a)), 170 - r * Math.sin(Math.PI * (1 - a))]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`; };
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      <path d={arc(0, 0.32, 110)} stroke="#c3bee0" strokeWidth={14} fill="none" strokeLinecap="round" opacity={0.55} />
      <path d={arc(0.36, 0.64, 110)} stroke="#e9b44c" strokeWidth={14} fill="none" strokeLinecap="round" opacity={0.75} />
      <path d={arc(0.68, 1, 110)} stroke="url(#cine-g)" strokeWidth={14} fill="none" strokeLinecap="round" />
      <text x={64} y={204} fill="rgba(238,235,250,.6)" fontSize={12} textAnchor="middle">classical</text>
      <text x={CX} y={46} fill="rgba(238,235,250,.6)" fontSize={12} textAnchor="middle">wait</text>
      <text x={256} y={204} fill="rgba(238,235,250,.6)" fontSize={12} textAnchor="middle">go</text>
      <g className="art-needle" style={{ transformOrigin: `${CX}px 170px` }}>
        <line x1={CX} y1={170} x2={CX} y2={82} stroke="#eeebfa" strokeWidth={3} strokeLinecap="round" />
      </g>
      <circle cx={CX} cy={170} r={9} fill="#eeebfa" />
    </svg>
  );
}

/** Rows of gene measurements flowing into twelve pathway scores. */
export function StreamArt({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      {Array.from({ length: 9 }, (_, r) => (
        <g key={r} className="art-flow" style={{ animationDelay: `${-r * 0.7}s` }}>
          {Array.from({ length: 14 }, (_, c) => <rect key={c} x={c * 11} y={24 + r * 24} width={7} height={7} rx={1.5} fill={(r * 7 + c * 3) % 5 === 0 ? "#ff7a9f" : (r + c) % 3 === 0 ? "#4fd1c5" : "rgba(195,190,224,.45)"} />)}
        </g>
      ))}
      <rect x={200} y={14} width={104} height={232} rx={14} fill="rgba(13,10,30,.55)" stroke="rgba(255,255,255,.14)" />
      {Array.from({ length: n }, (_, k) => <g key={k}><circle cx={222} cy={30 + (k * 200) / Math.max(n - 1, 1)} r={4.5} fill="url(#cine-g)" /><rect x={234} y={27 + (k * 200) / Math.max(n - 1, 1)} width={22 + ((k * 37) % 44)} height={6} rx={3} fill="rgba(156,140,255,.5)" className="art-glow" style={{ animationDelay: `${k * 0.2}s` }} /></g>)}
    </svg>
  );
}

/** Real Kaplan–Meier curves of the two predicted-risk groups, drawn in. */
export function CurvesArt({ hi, lo, maxT = 120 }: { hi: Curve; lo: Curve; maxT?: number }) {
  const x = (t: number) => 26 + (Math.min(t, maxT) / maxT) * 270, y = (s: number) => 28 + (1 - s) * 196;
  const path = (c: Curve) => { let d = `M${x(0)},${y(1)}`; for (let i = 1; i < c.t.length; i++) { if (c.t[i] > maxT) break; d += `H${x(c.t[i])}V${y(c.s[i])}`; } return d + `H${x(maxT)}`; };
  return (
    <svg viewBox="0 0 320 260" className="cine-svg">
      <Defs />
      {[0, 0.5, 1].map((s) => <line key={s} x1={26} x2={296} y1={y(s)} y2={y(s)} stroke="rgba(255,255,255,.1)" />)}
      <path d={path(lo)} fill="none" stroke="#4fd1c5" strokeWidth={2.6} pathLength={1} className="art-draw" />
      <path d={path(hi)} fill="none" stroke="#ff7a9f" strokeWidth={2.6} pathLength={1} className="art-draw" style={{ animationDelay: ".25s" }} />
      <text x={296} y={248} fill="rgba(238,235,250,.55)" fontSize={11} textAnchor="end">{maxT / 12} years</text>
      <text x={30} y={20} fill="rgba(238,235,250,.55)" fontSize={11}>lower vs higher predicted risk</text>
    </svg>
  );
}
