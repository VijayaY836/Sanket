import { useEffect, useMemo, useRef, useState } from "react";
import { Cohort, CohortTerms, horizonLabel, outcomeTerms } from "../lib/cohort";
import { Model } from "../lib/analysis";
import { Curve } from "../lib/survival";
import { eigSym } from "../lib/linalg";
import { mulberry32, normal } from "../lib/rng";
import { cssVar } from "./viz";

/**
 * A scroll-driven film of the SANKET pipeline. One particle system morphs through eight layouts:
 * tissue -> genes -> pathways -> qubits -> circuit -> patient constellation -> two futures -> proof.
 */
export interface StoryProps {
  cohort: Cohort;
  model: Model;
  pair: { i: number; id: string; risk: number; curve: Curve; histology?: string }[];
  stats: { quantum?: number; classical?: number; hwBackend?: string; hwPatients?: number; hwCorr?: number; hwKernel?: number };
  onOpenCase: () => void;
  onEvidence: () => void;
}

const chapters = (cohort: Cohort, t: CohortTerms) => [
  t.hook,
  { title: `Inside every ${t.sample}, 20,000 genes`, body: `Each sample carries the activity of about twenty thousand genes: far too many numbers for ${cohort.patients.length.toLocaleString()} patients.` },
  { title: "Compressed into 12 pathways a biologist can read", body: "Genes are scored as Hallmark pathways: cell growth, DNA repair, hypoxia, inflammation. This patient's profile, chosen from biology, not from outcomes." },
  { title: "One pathway per qubit, wired like the biology", body: "Qubits are linked only where their pathways share genes. The circuit's shape is the biology's shape." },
  { title: "Each patient runs through the circuit", body: "Pathway scores become rotation angles. The patient's state evolves under a Hamiltonian built from their own biology." },
  { title: "Similar quantum states, similar futures", body: `Every dot is a patient, placed by quantum similarity. Pink dots ${t.event.toLowerCase()}; teal stayed ${t.freePast}.` },
  { title: "Two patients, separated", body: `From the most similar past patients, SANKET draws each patient's ${t.freePast} curve and a ${horizonLabel(cohort.horizon)} risk.` },
  { title: "Tested honestly. Run on real quantum hardware.", body: "" },
];
const N = 1300;
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function hexToRgb(h: string): [number, number, number] {
  const v = h.replace("#", "").trim();
  const s = v.length === 3 ? v.split("").map((c) => c + c).join("") : v.slice(0, 6);
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [120, 110, 180];
}

/** 2-D classical MDS of a kernel (distance^2 = 2 - 2k) for the constellation. */
function embed(K: number[][]) {
  const n = K.length;
  const D = K.map((r) => r.map((k) => 2 - 2 * k));
  const rowM = D.map((r) => r.reduce((a, b) => a + b, 0) / n), all = rowM.reduce((a, b) => a + b, 0) / n;
  const B = D.map((r, i) => r.map((d, j) => -0.5 * (d - rowM[i] - rowM[j] + all)));
  const e = eigSym(B);
  const order = e.values.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  return Array.from({ length: n }, (_, i) => [0, 1].map((c) => e.vectors[i][order[c][1]] * Math.sqrt(Math.max(order[c][0], 0))) as [number, number]);
}

export function Story({ cohort, model, pair, stats, onOpenCase, onEvidence }: StoryProps) {
  const section = useRef<HTMLElement>(null);
  const terms = outcomeTerms(cohort);
  const CHAPTERS = useMemo(() => chapters(cohort, terms), [cohort]); // eslint-disable-line react-hooks/exhaustive-deps
  const cvs = useRef<HTMLCanvasElement>(null);
  const [prog, setProg] = useState(0);
  const target = useRef(0), shown = useRef(0);
  const q = cohort.pathways.length;

  // patients shown in the constellation (cap for speed), always including the hero pair
  const sub = useMemo(() => {
    const n = model.n, cap = 140;
    let idx = Array.from({ length: n }, (_, i) => i);
    if (n > cap) { const r = mulberry32(3); idx = idx.filter((i) => pair.some((p) => p.i === i) || r() < (cap - 2) / n).slice(0, cap); }
    const K = idx.map((i) => idx.map((j) => model.K.proj[i][j]));
    const xy = embed(K);
    const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
    const nx = (v: number) => (v - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1), ny = (v: number) => (v - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys) || 1);
    return idx.map((pi, k) => ({ pi, x: nx(xy[k][0]), y: ny(xy[k][1]), event: model.events[pi], hero: pair.findIndex((p) => p.i === pi) }));
  }, [model, pair]);

  useEffect(() => {
    const onScroll = () => {
      const el = section.current; if (!el) return;
      const r = el.getBoundingClientRect(), total = r.height - window.innerHeight;
      target.current = clamp01(-r.top / Math.max(total, 1));
      if (reducedMotion()) shown.current = target.current;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  useEffect(() => {
    const c = cvs.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    let W = 0, H = 0, raf = 0, alive = true;
    const rand = mulberry32(26549);
    const col = { violet: hexToRgb(cssVar("--violet")), eosin: hexToRgb(cssVar("--eosin")), teal: hexToRgb(cssVar("--teal")), ink: hexToRgb(cssVar("--ink")), ink3: hexToRgb(cssVar("--ink-3")) };
    const z = cohort.patients[pair[0].i].pathways;
    // per-particle randomness, fixed for the session
    const R = Array.from({ length: N }, () => ({ a: rand(), b: rand(), c: normal(rand), d: normal(rand), s: 0.5 + rand() * 0.5, sz: 1.3 + rand() * 1.4 }));
    const glands = Array.from({ length: 9 }, () => ({ x: rand(), y: rand(), r: 0.035 + rand() * 0.05 }));
    const groupOf = (i: number) => i % q, rankIn = (i: number) => Math.floor(i / q), perGroup = Math.ceil(N / q);
    const geneVal = R.map((r, i) => (z[groupOf(i)] * 0.5 + r.c * 0.9) / 2.6);
    type Lay = { x: number; y: number; r: number; g: number; b: number; a: number; s: number };
    const L: Lay[][] = Array.from({ length: 8 }, () => Array.from({ length: N }, () => ({ x: 0, y: 0, r: 0, g: 0, b: 0, a: 1, s: 1 })));

    const layout = () => {
      const narrow = W < 900;
      const cx = narrow ? W * 0.5 : W * 0.63, cy = narrow ? H * 0.27 : H * 0.5;
      const span = narrow ? W * 0.84 : W * 0.6, tall = narrow ? H * 0.32 : H * 0.62;
      const left = cx - span / 2, top = cy - tall / 2;
      const set = (L0: Lay, x: number, y: number, c: number[], a = 1, s = 1) => { L0.x = x; L0.y = y; L0.r = c[0]; L0.g = c[1]; L0.b = c[2]; L0.a = a; L0.s = s; };
      const ringR = Math.min(span, tall) * 0.42;
      const node = (k: number) => { const t = -Math.PI / 2 + (2 * Math.PI * k) / q; return [cx + ringR * Math.cos(t), cy + ringR * Math.sin(t)]; };
      const curveXY = (cv: Curve, u: number) => {
        // point at fraction u along the step curve, in the plot box
        const tMax = 120, pts: [number, number][] = [[0, 1]];
        for (let k = 1; k < cv.t.length && cv.t[k] <= tMax; k++) { pts.push([cv.t[k], cv.s[k - 1]]); pts.push([cv.t[k], cv.s[k]]); }
        pts.push([tMax, pts[pts.length - 1][1]]);
        const lens = pts.slice(1).map((p, k) => Math.abs(p[0] - pts[k][0]) / tMax + Math.abs(p[1] - pts[k][1]));
        let total = lens.reduce((a, b) => a + b, 0), d = u * total, k = 0;
        while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
        const f = lens[k] ? d / lens[k] : 0, p0 = pts[k], p1 = pts[k + 1];
        const tt = p0[0] + (p1[0] - p0[0]) * f, ss = p0[1] + (p1[1] - p0[1]) * f;
        total = 0;
        return [left + (tt / tMax) * span, top + (1 - ss) * tall];
      };
      for (let i = 0; i < N; i++) {
        const r = R[i], k = groupOf(i), j = rankIn(i);
        // 0 tissue
        let x: number, y: number;
        if (r.a < 0.7) { const gl = glands[Math.floor(r.b * glands.length)], th = r.b * 977 % (Math.PI * 2), rr = gl.r * Math.min(W, H) * 2.2 * (1 + 0.12 * Math.sin(th * 3 + gl.x * 9)) + r.c * 6; x = gl.x * W + rr * Math.cos(th); y = gl.y * H + rr * 0.78 * Math.sin(th); }
        else { x = ((r.a - 0.7) / 0.3) * W * 1.1 - W * 0.05; y = r.b * H; }
        set(L[0][i], x, y, col.violet, 0.35 + 0.55 * r.s, 1);
        // 1 genes spectrum
        const gv = Math.max(-1, Math.min(1, geneVal[i])), gx = left + (i / N) * span;
        set(L[1][i], gx, cy - gv * tall * 0.45 * (0.3 + 0.7 * r.s), gv >= 0 ? col.violet : col.teal, 0.75, 0.75);
        // 2 pathway bars
        const zk = Math.max(-2.5, Math.min(2.5, z[k])) / 2.5, colW = span / q, bx = left + colW * (k + 0.5) + (r.b - 0.5) * colW * 0.5;
        set(L[2][i], bx, cy - zk * tall * 0.45 * (j / perGroup), zk >= 0 ? col.violet : col.teal, 0.85, 0.9);
        // 3 qubit ring
        const [nx, ny] = node(k);
        set(L[3][i], nx + r.c * 9, ny + r.d * 9, col.violet, 0.8, 0.85);
        // 4 circuit wires (x animated with time in draw)
        set(L[4][i], left + (j / perGroup) * span, top + (k + 0.5) * (tall / q), col.violet, 0.8, 0.8);
        // 5 constellation
        const p = sub[i % sub.length], px = left + span * (0.08 + 0.84 * p.x), py = top + tall * (0.06 + 0.88 * p.y);
        const main = i < sub.length;
        set(L[5][i], main ? px : px + r.c * 7, main ? py : py + r.d * 7, p.event ? col.eosin : col.teal, main ? 0.95 : 0.16, main ? (p.hero >= 0 ? 2.6 : 1.6) : 0.6);
        // 6 two futures: particles trace the two curves
        const which = i % 2, u = (Math.floor(i / 2) / (N / 2));
        const [fx, fy] = curveXY(pair[which].curve, u);
        set(L[6][i], fx + r.c * 1.2, fy + r.d * 1.2, which === 0 ? col.eosin : col.teal, 0.9, 0.85);
        // 7 proof: a calm drifting field
        set(L[7][i], left + r.a * span, top + r.b * tall, col.violet, 0.12, 0.7);
      }
      return { left, top, span, tall, node, cx, cy };
    };

    let stroma: HTMLCanvasElement | null = null;
    const paintStroma = () => {
      const st = document.createElement("canvas"); st.width = Math.max(1, W); st.height = Math.max(1, H);
      const sc = st.getContext("2d")!, rr = mulberry32(7);
      for (let i = 0; i < 80; i++) {
        const x = rr() * W, y = rr() * H, rad = 50 + rr() * 140, g = sc.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${col.eosin.join(",")},${0.10 + rr() * 0.08})`); g.addColorStop(1, `rgba(${col.eosin.join(",")},0)`);
        sc.fillStyle = g; sc.beginPath(); sc.arc(x, y, rad, 0, 7); sc.fill();
      }
      sc.strokeStyle = `rgba(${col.eosin.join(",")},0.10)`;
      for (let i = 0; i < 110; i++) { let x = rr() * W, y = rr() * H, a = rr() * 3.14; sc.beginPath(); sc.moveTo(x, y); for (let k = 0; k < 7; k++) { a += (rr() - 0.5) * 0.5; x += Math.cos(a) * 20; y += Math.sin(a) * 20; sc.lineTo(x, y); } sc.stroke(); }
      stroma = st;
    };
    let geo = { left: 0, top: 0, span: 0, tall: 0, node: (_k: number) => [0, 0], cx: 0, cy: 0 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = c.clientWidth; H = c.clientHeight;
      c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geo = layout();
      paintStroma();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(c);

    const t0 = performance.now();
    const draw = (now: number) => {
      if (!alive) return;
      shown.current += (target.current - shown.current) * 0.09;
      const p = shown.current;
      setProg((old) => (Math.abs(old - p) > 0.0015 ? p : old));
      const time = (now - t0) / 1000;
      const seg = Math.min(7, Math.floor(p * 8)), local = p * 8 - seg;
      const from = Math.max(0, seg - (local < 0.5 ? 1 : 0)), to = seg;
      const mixT = from === to ? 1 : ease(clamp01((local + 0.5) / 1.0));
      // transition happens in the first half of each chapter (from previous layout to this one)
      const A = L[local < 0.5 && seg > 0 ? seg - 1 : seg], B = L[seg];
      const m = local < 0.5 && seg > 0 ? ease(clamp01(local / 0.5)) : 1;
      void from; void to; void mixT;
      ctx.clearRect(0, 0, W, H);

      // chapter furniture behind the particles
      const fur = (k: number) => (seg === k ? m : seg === k + 1 && local < 0.5 ? 1 - ease(clamp01(local / 0.5)) : 0);
      const fRing = fur(3), fWire = fur(4), fCurve = fur(6);
      const fTissue = seg === 0 ? 1 : seg === 1 && local < 0.5 ? 1 - ease(clamp01(local / 0.5)) : 0;
      if (fTissue > 0 && stroma) { ctx.globalAlpha = fTissue; ctx.drawImage(stroma, 0, 0, W, H); ctx.globalAlpha = 1; }
      if (fRing > 0) {
        ctx.lineWidth = 1.4;
        cohort.edges.forEach(([a, b], e) => {
          const pr = clamp01(fRing * 1.4 - (e / cohort.edges.length) * 0.4);
          const [ax, ay] = geo.node(a), [bx, by] = geo.node(b);
          ctx.strokeStyle = `rgba(${col.ink3.join(",")},${0.55 * fRing})`;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * pr, ay + (by - ay) * pr); ctx.stroke();
        });
      }
      if (fWire > 0) {
        for (let k = 0; k < q; k++) {
          const y = geo.top + (k + 0.5) * (geo.tall / q);
          ctx.strokeStyle = `rgba(${col.ink3.join(",")},${0.35 * fWire})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(geo.left, y); ctx.lineTo(geo.left + geo.span, y); ctx.stroke();
        }
        const cols = [0.12, 0.3, 0.48, 0.66, 0.84];
        cols.forEach((cxp, ci) => {
          const x = geo.left + cxp * geo.span, sweep = (time * 0.35) % 1, lit = Math.abs(sweep - cxp) < 0.08;
          for (let k = 0; k < q; k++) {
            const y = geo.top + (k + 0.5) * (geo.tall / q);
            if (ci % 2 === 1 && k % 3 === 0 && k + 1 < q) {
              ctx.strokeStyle = `rgba(${col.eosin.join(",")},${(lit ? 0.95 : 0.55) * fWire})`; ctx.lineWidth = 2;
              const y2 = geo.top + (k + 1.5) * (geo.tall / q);
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y2); ctx.stroke();
              ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.arc(x, y2, 3.5, 0, 7); ctx.fill();
            } else if (ci % 2 === 0) {
              ctx.fillStyle = `rgba(${(lit ? col.eosin : col.violet).join(",")},${(lit ? 0.9 : 0.35) * fWire})`;
              ctx.fillRect(x - 9, y - 6, 18, 12);
            }
          }
        });
      }
      if (fCurve > 0) {
        ctx.strokeStyle = `rgba(${col.ink3.join(",")},${0.35 * fCurve})`; ctx.lineWidth = 1;
        [0, 0.25, 0.5, 0.75, 1].forEach((s) => { const y = geo.top + (1 - s) * geo.tall; ctx.beginPath(); ctx.moveTo(geo.left, y); ctx.lineTo(geo.left + geo.span, y); ctx.stroke(); });
        const hx = geo.left + (Math.min(cohort.horizon, 120) / 120) * geo.span;
        ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(hx, geo.top); ctx.lineTo(hx, geo.top + geo.tall); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${col.ink3.join(",")},${0.9 * fCurve})`; ctx.font = "12px Figtree, system-ui"; ctx.textAlign = "left";
        ctx.fillText(`${+(cohort.horizon / 12).toFixed(1)} years`, hx + 6, geo.top + 14); ctx.fillText(`100% ${terms.freePast}`, geo.left, geo.top - 8); ctx.fillText("10 years", geo.left + geo.span - 52, geo.top + geo.tall + 18);
      }

      // particles
      for (let i = 0; i < N; i++) {
        const a = A[i], b = B[i];
        let x = a.x + (b.x - a.x) * m, y = a.y + (b.y - a.y) * m;
        // the circuit chapter: data flows along the wires
        if (seg === 4 || (seg === 5 && local < 0.5)) {
          const flow = ((R[i].a + time * 0.06) % 1);
          const wx = geo.left + flow * geo.span, wy = geo.top + (groupOf(i) + 0.5) * (geo.tall / q) + Math.sin(time * 2 + i) * 1.2;
          const w = seg === 4 ? m : 1 - ease(clamp01(local / 0.5));
          x = x + (wx - x) * w; y = y + (wy - y) * w;
        }
        if (seg === 0) { x += Math.sin(time * 0.6 + i) * 0.6; y += Math.cos(time * 0.5 + i) * 0.6; }
        const r = a.r + (b.r - a.r) * m, g = a.g + (b.g - a.g) * m, bl = a.b + (b.b - a.b) * m, al = a.a + (b.a - a.a) * m, s = (a.s + (b.s - a.s) * m) * R[i].sz;
        ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${al})`;
        ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill();
      }
      // qubit labels and hero patient labels
      if (fRing > 0.3) {
        ctx.globalAlpha = (fRing - 0.3) / 0.7;
        for (let k = 0; k < q; k++) {
          const [nx, ny] = geo.node(k), t = -Math.PI / 2 + (2 * Math.PI * k) / q;
          ctx.fillStyle = `rgb(${col.ink.join(",")})`; ctx.font = "600 12px Figtree, system-ui";
          ctx.textAlign = Math.cos(t) > 0.3 ? "left" : Math.cos(t) < -0.3 ? "right" : "center";
          ctx.fillText(cohort.pathways[k].short, nx + Math.cos(t) * 26, ny + Math.sin(t) * 22 + 4);
        }
        ctx.globalAlpha = 1;
      }
      if (fWire > 0.3) {
        ctx.globalAlpha = (fWire - 0.3) / 0.7; ctx.fillStyle = `rgb(${col.ink3.join(",")})`; ctx.font = "11px Figtree, system-ui"; ctx.textAlign = "right";
        for (let k = 0; k < q; k++) ctx.fillText(cohort.pathways[k].short, geo.left - 10, geo.top + (k + 0.5) * (geo.tall / q) + 4);
        ctx.globalAlpha = 1;
      }
      const fStars = fur(5);
      if (fStars > 0.4) {
        ctx.globalAlpha = (fStars - 0.4) / 0.6; ctx.font = "700 13px Figtree, system-ui"; ctx.textAlign = "left";
        sub.filter((s) => s.hero >= 0).forEach((s) => {
          const px = geo.left + geo.span * (0.08 + 0.84 * s.x), py = geo.top + geo.tall * (0.06 + 0.88 * s.y);
          ctx.strokeStyle = `rgb(${(s.hero === 0 ? col.eosin : col.teal).join(",")})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.stroke();
          ctx.fillStyle = `rgb(${col.ink.join(",")})`; ctx.fillText(pair[s.hero].id, px + 14, py + 4);
        });
        ctx.globalAlpha = 1;
      }
      if (fCurve > 0.5) {
        ctx.globalAlpha = (fCurve - 0.5) / 0.5; ctx.font = `800 ${W < 900 ? 15 : 22}px 'Bricolage Grotesque', Figtree, system-ui`; ctx.textAlign = "left";
        pair.forEach((pp, w) => {
          const yy = geo.top + (1 - (1 - pp.risk)) * geo.tall;
          ctx.fillStyle = `rgb(${(w === 0 ? col.eosin : col.teal).join(",")})`;
          ctx.fillText(`${pp.id}  ${Math.round(pp.risk * 100)}%`, geo.left + (38 / 120) * geo.span + 10, Math.min(geo.top + geo.tall - 10, Math.max(geo.top + 24, yy + (w === 0 ? 26 : -10))));
        });
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [cohort, model, pair, sub, q]);

  const chap = Math.min(CHAPTERS.length - 1, Math.floor(prog * CHAPTERS.length));
  // One caption per chapter, switched a moment after the chapter starts and faded on a short timer (CSS),
  // so it reads smoothly at any scroll speed and stays up for the whole chapter. Chapter 0 shows on arrival.
  const active = Math.max(0, Math.min(CHAPTERS.length - 1, Math.floor(prog * CHAPTERS.length - 0.04)));

  return (
    <section ref={section} className="story" style={{ height: `${CHAPTERS.length * 100 + 60}vh` }} aria-label="How SANKET works, as a scrolling story">
      <div className="story-stage">
        <canvas ref={cvs} className="story-canvas" aria-hidden="true" />
        <div className="story-copy">
          {CHAPTERS.map((ch, k) => {
            const on = k === active;
            return (
              <div key={k} className="story-chapter" data-on={on} aria-hidden={!on}>
                {k === 0 && <p className="story-kicker">SANKET · predicting cancer from gene activity with a quantum kernel{stats.hwBackend ? ", run on real IBM hardware" : ""}</p>}
                {k === 0 ? <h1 className="story-title story-title-xl">{ch.title}</h1> : <h2 className="story-title">{ch.title}</h2>}
                {ch.body && <p className="story-body">{ch.body}</p>}
                {k === 2 && <p className="story-note">Patient {pair[0].id}, {pair[0].histology ?? terms.sample}</p>}
                {k === CHAPTERS.length - 1 && (
                  <div className="proof">
                    <div className="proof-grid">
                      {stats.hwBackend && <div><div className="proof-num">{stats.hwPatients}</div><div className="proof-lbl">patients run on IBM's {stats.hwBackend} quantum processor</div></div>}
                      {stats.hwKernel !== undefined && <div><div className="proof-num">{stats.hwKernel.toFixed(2)}</div><div className="proof-lbl">agreement between hardware and simulated patient similarities</div></div>}
                      {stats.quantum !== undefined && stats.classical !== undefined && <div><div className="proof-num">{stats.quantum.toFixed(2)} vs {stats.classical.toFixed(2)}</div><div className="proof-lbl">quantum vs classical, same features, same tuning</div></div>}
                      <div><div className="proof-num">~5×</div><div className="proof-lbl">fewer two-qubit gates than a standard quantum feature map</div></div>
                    </div>
                    <p className="story-body">Where quantum ties classical, SANKET says so. Where data has quantum structure, it wins, and the advantage test tells the two apart.</p>
                    <div className="row">
                      <button className="btn btn-primary btn-lg" onClick={onOpenCase}>Open a patient case</button>
                      <button className="btn btn-lg" onClick={onEvidence}>See the evidence</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <ol className="story-rail" aria-label="Chapters">
          {CHAPTERS.map((ch, k) => (
            <li key={k} className={k === chap ? "on" : k < chap ? "done" : ""}>
              <button onClick={() => { const el = section.current; if (!el) return; const total = el.offsetHeight - window.innerHeight; window.scrollTo({ top: el.offsetTop + total * ((k + 0.55) / CHAPTERS.length), behavior: "smooth" }); }} aria-label={`Chapter ${k + 1}: ${ch.title}`}>
                <span className="story-rail-dot" />
              </button>
            </li>
          ))}
        </ol>
        {/* Scroll cue: the full invitation on arrival, then a compact chapter counter; click to move one chapter on. */}
        {chap < CHAPTERS.length - 1 && (
          <button className={`story-hint${prog < 0.03 ? " story-hint-full" : ""}`}
            onClick={() => { const el = section.current; if (!el) return; const total = el.offsetHeight - window.innerHeight; window.scrollTo({ top: el.offsetTop + total * ((chap + 1 + 0.55) / CHAPTERS.length), behavior: "smooth" }); }}
            aria-label={`Scroll down: chapter ${chap + 2} of ${CHAPTERS.length}`}>
            <span className="scroll-mouse" aria-hidden="true" />
            {prog < 0.03
              ? <span>Scroll to follow one {terms.sample} through SANKET <span className="story-hint-count">{CHAPTERS.length} short chapters</span></span>
              : <span>Chapter {chap + 1} of {CHAPTERS.length}, keep scrolling</span>}
          </button>
        )}
        <div className="story-bar"><span style={{ transform: `scaleX(${prog})` }} /></div>
      </div>
    </section>
  );
}