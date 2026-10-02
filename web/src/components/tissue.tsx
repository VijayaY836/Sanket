import { useEffect, useRef, useState } from "react";
import { Cohort } from "../lib/cohort";
import { mulberry32, normal } from "../lib/rng";
import { cssVar } from "./viz";

/**
 * The slide becomes the circuit: an H&E-like tissue section (violet nuclei on eosin stroma) whose nuclei gather into
 * the 12 pathway qubits, which then wire up along the real crosstalk graph. Plays once; hover a qubit to name it.
 */
interface Nucleus { x: number; y: number; tx: number; ty: number; rx: number; ry: number; a: number; shade: number; delay: number; k: number }

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function rgba(hex: string, a: number) {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function TissueField({ cohort, height = 460, run = 0, z }: { cohort: Cohort; height?: number; run?: number; z?: number[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef(-1);
  const drawFinal = useRef<(() => void) | null>(null);
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    const box = wrap.current, c = cvs.current;
    if (!box || !c) return;
    let raf = 0, cancelled = false;
    const setup = () => {
      cancelAnimationFrame(raf);
      const W = box.clientWidth, H = height, dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bodyFont = getComputedStyle(c).getPropertyValue("--body").trim() || "system-ui";
      const col = { violet: cssVar("--violet"), eosin: cssVar("--eosin"), ink: cssVar("--ink"), surface: cssVar("--surface"), teal: cssVar("--teal"), ink3: cssVar("--ink-3") };
      const rand = mulberry32(26549);
      const q = cohort.pathways.length, cx = W * 0.5, cy = H * 0.52, R = Math.min(W * 0.36, H * 0.38);
      const nodes = cohort.pathways.map((_, k) => { const t = -Math.PI / 2 + (2 * Math.PI * k) / q; return { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t), t }; });

      // eosin stroma, painted once
      const stroma = document.createElement("canvas");
      stroma.width = W * dpr; stroma.height = H * dpr;
      const sc = stroma.getContext("2d")!; sc.scale(dpr, dpr);
      for (let i = 0; i < 70; i++) {
        const x = rand() * W, y = rand() * H, r = 40 + rand() * 120;
        const g = sc.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(col.eosin, 0.10 + rand() * 0.08)); g.addColorStop(1, rgba(col.eosin, 0));
        sc.fillStyle = g; sc.beginPath(); sc.arc(x, y, r, 0, Math.PI * 2); sc.fill();
      }
      sc.strokeStyle = rgba(col.eosin, 0.10); sc.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        let x = rand() * W, y = rand() * H, a = rand() * Math.PI;
        sc.beginPath(); sc.moveTo(x, y);
        for (let s = 0; s < 6; s++) { a += (rand() - 0.5) * 0.5; x += Math.cos(a) * 18; y += Math.sin(a) * 18; sc.lineTo(x, y); }
        sc.stroke();
      }

      // nuclei: epithelial gland rings plus scattered stromal cells
      const N = Math.round(Math.min(1800, Math.max(700, (W * H) / 300)));
      const glands = Array.from({ length: Math.max(6, Math.round(W / 160)) }, () => ({ x: rand() * W, y: rand() * H, r: 26 + rand() * 46 }));
      const nuclei: Nucleus[] = [];
      for (let i = 0; i < N; i++) {
        let x: number, y: number, a: number;
        if (rand() < 0.72) {
          const gl = glands[Math.floor(rand() * glands.length)], th = rand() * Math.PI * 2, rr = gl.r + normal(rand) * 5;
          x = gl.x + rr * Math.cos(th); y = gl.y + rr * 0.8 * Math.sin(th); a = th + Math.PI / 2;
        } else { x = rand() * W; y = rand() * H; a = rand() * Math.PI; }
        const ang = (Math.atan2(y - cy, x - cx) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2);
        const k = 0, best = 0;
        const spread = 9 + rand() * 4;
        nuclei.push({ x, y, tx: spread, ty: ang, rx: 2 + rand() * 1.6, ry: 1.3 + rand() * 1.1, a, shade: 0.45 + rand() * 0.5, delay: best, k });
      }
      // balanced flow: split nuclei by angle around the centre into equal groups, one group per qubit
      const byAngle = nuclei.map((n, i) => [n.ty, i] as [number, number]).sort((p1, p2) => p1[0] - p2[0]);
      byAngle.forEach(([, i], r) => {
        const n = nuclei[i], k = Math.floor((r / nuclei.length) * q + 0.5) % q;
        const spread = n.tx;
        n.k = k; n.tx = nodes[k].x + normal(rand) * spread; n.ty = nodes[k].y + normal(rand) * spread;
        n.delay = Math.hypot(nodes[k].x - n.x, nodes[k].y - n.y) / Math.hypot(W, H);
      });
      const act = (k: number) => (z ? Math.max(-1, Math.min(1, z[k] / 2.5)) : 0);

      const frame = (ms: number, hov: number) => {
        const tissueFade = clamp01((ms - 1300) / 1300);
        const edgeP = clamp01((ms - 2300) / 900), nodeP = clamp01((ms - 2500) / 700);
        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = 1 - 0.94 * tissueFade; ctx.drawImage(stroma, 0, 0, W, H); ctx.globalAlpha = 1;
        // crosstalk edges
        if (edgeP > 0) {
          cohort.edges.forEach(([i, j], e) => {
            const p = clamp01(edgeP * 1.6 - e / cohort.edges.length * 0.6);
            if (p <= 0) return;
            const A = nodes[i], B = nodes[j], lit = hov === i || hov === j;
            ctx.strokeStyle = lit ? col.eosin : rgba(col.ink3, 0.55); ctx.lineWidth = lit ? 2.6 : 1.4;
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + (B.x - A.x) * ease(p), A.y + (B.y - A.y) * ease(p)); ctx.stroke();
          });
        }
        // nuclei travelling to their qubit
        for (const n of nuclei) {
          const u = ease(clamp01((ms - 900 - n.delay * 900) / 1500));
          const x = n.x + (n.tx - n.x) * u, y = n.y + (n.ty - n.y) * u;
          ctx.fillStyle = rgba(col.violet, n.shade * (1 - 0.55 * nodeP));
          ctx.beginPath(); ctx.ellipse(x, y, n.rx * (1 - 0.35 * u), n.ry * (1 - 0.2 * u), n.a * (1 - u), 0, Math.PI * 2); ctx.fill();
        }
        // qubit nodes and labels
        if (nodeP > 0) {
          nodes.forEach((nd, k) => {
            const r = (hov === k ? 19 : 16) * (0.6 + 0.4 * nodeP), v = act(k);
            ctx.globalAlpha = nodeP;
            ctx.fillStyle = col.surface; ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = v >= 0 ? rgba(col.violet, 0.25 + 0.6 * Math.abs(v)) : rgba(col.teal, 0.25 + 0.6 * Math.abs(v));
            ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = hov === k ? col.eosin : rgba(col.violet, 0.9); ctx.lineWidth = hov === k ? 2.5 : 1.5; ctx.stroke();
            ctx.fillStyle = col.ink; ctx.font = `700 10.5px ${bodyFont}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(`q${k}`, nd.x, nd.y + 0.5);
            const lx = nd.x + Math.cos(nd.t) * (r + 18), ly = nd.y + Math.sin(nd.t) * (r + 14);
            ctx.fillStyle = hov === k ? col.ink : rgba(col.ink3, 1); ctx.font = `${hov === k ? 700 : 500} 12px ${bodyFont}`;
            ctx.textAlign = Math.cos(nd.t) > 0.3 ? "left" : Math.cos(nd.t) < -0.3 ? "right" : "center";
            ctx.fillText(hov === k ? cohort.pathways[k].label : cohort.pathways[k].short, lx, ly);
            ctx.globalAlpha = 1;
          });
        }
      };

      const END = 3300;
      drawFinal.current = () => frame(END, hoverRef.current);
      if (reduced()) { frame(END, hoverRef.current); return; }
      const t0 = performance.now();
      const loop = (now: number) => {
        if (cancelled) return;
        const ms = now - t0;
        frame(ms, hoverRef.current);
        if (ms < END) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      // hit testing for hover
      (c as HTMLCanvasElement & { _nodes?: typeof nodes })._nodes = nodes;
    };
    setup();
    let lastW = box.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(box.clientWidth - lastW) > 8) { lastW = box.clientWidth; setup(); } });
    ro.observe(box);
    return () => { cancelled = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [cohort, height, run, z]);

  useEffect(() => { hoverRef.current = hover; drawFinal.current?.(); }, [hover]);

  const onMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const c = ev.currentTarget as HTMLCanvasElement & { _nodes?: { x: number; y: number }[] };
    const r = c.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let k = -1, best = 26 * 26;
    (c._nodes ?? []).forEach((n, j) => { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < best) { best = d; k = j; } });
    if (k !== hover) setHover(k);
  };
  return (
    <div ref={wrap} style={{ width: "100%", position: "relative" }}>
      <canvas ref={cvs} onMouseMove={onMove} onMouseLeave={() => setHover(-1)} className="tissue-canvas" style={{ cursor: hover >= 0 ? "pointer" : "default" }}
        role="img" aria-label="A stained tissue section whose cell nuclei gather into twelve pathway qubits connected by their shared-gene links" />
    </div>
  );
}

/** Animated count-up for headline figures (respects reduced motion). */
export function CountUp({ value, decimals = 0, suffix = "", duration = 900 }: { value: number; decimals?: number; suffix?: string; duration?: number }) {
  const [v, setV] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) { setV(value); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const u = clamp01((now - t0) / duration); setV(value * ease(u)); if (u < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}
