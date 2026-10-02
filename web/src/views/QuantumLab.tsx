import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { LARGE, useApp } from "../store";
import { layerTrace, gateCounts, Layer } from "../lib/quantum";
import { depolarisedBloch, looCIndex, projKernelFrom, shotNoisyFidelity } from "../lib/analysis";
import { eigSym, psdProject } from "../lib/linalg";
import { BlochSphere, Heatmap, XYChart } from "../components/viz";
import { noiseCurve, NOISE_P2 } from "../lib/experiments";
import { IPlay } from "../icons";

/** Transpiled on IBM Heron (FakeFez calibration), Qiskit 2.5, optimization level 3, 12 qubits, 2 Trotter steps. Computed by the team. */
export const HW_TABLE = [
  { enc: "SANKET pathway topology", kernel: "Projected", twoq: 94, depth: 33, fid: 0.67, ok: true },
  { enc: "SANKET pathway topology", kernel: "Fidelity", twoq: 188, depth: 70, fid: 0.48, ok: true },
  { enc: "All-to-all Hamiltonian", kernel: "Projected", twoq: 433, depth: 151, fid: 0.21, ok: false },
  { enc: "Standard ZZ map (full)", kernel: "Fidelity", twoq: 906, depth: 333, fid: 0.04, ok: false },
];

export default function QuantumLab() {
  const { model, cohort, sel, setSel } = useApp();
  const trace = useMemo(() => layerTrace(model.angles[sel], cohort.edges, model.spec), [model, sel, cohort]);
  const [col, setCol] = useState(trace.length - 1);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setCol(trace.length - 1), [trace]);
  useEffect(() => {
    if (!playing) return;
    if (col >= trace.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setCol((c) => c + 1), 420);
    return () => clearTimeout(t);
  }, [playing, col, trace.length]);
  const g = gateCounts(cohort.pathways.length, cohort.edges.length, model.spec);

  return (
    <div className="grid quantum-page">
      <div className="topbar">
        <div>
          <h2 className="page-title">Circuit and noise</h2>
          <p className="page-sub">Step through the exact circuit run for this patient, then see what hardware noise does to the kernel and how it is repaired.</p>
        </div>
      </div>

      <section className="panel lab-workspace">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="h2">Feature map, {cohort.patients[sel].id}</div>
          <span className="chip chip-violet">{g.h} H, {g.rz} Rz, {g.rzz} ZZ, {g.rx} Rx</span>
          <span className="chip chip-grey">bandwidth {model.spec.scale}, {model.spec.reps} Trotter steps</span>
          <span className="spacer" />
          <select value={sel} onChange={(e) => setSel(+e.target.value)} aria-label="Patient" style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
            {cohort.patients.map((p, i) => <option key={p.id} value={i}>{p.id}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => { setCol(0); setPlaying(true); }}><IPlay /> Run circuit</button>
        </div>
        <div className="circuit-wrap"><CircuitView trace={trace} col={col} onPick={setCol} labels={cohort.pathways.map((p) => p.short)} /></div>
        <div className="slider" style={{ marginTop: 12 }}>
          <div className="slider-head"><span>Step {col} of {trace.length - 1}: {describe(trace[col])}</span><b>Mean arrow length {mean(trace[col].bloch.map((v) => Math.hypot(...v))).toFixed(2)}</b></div>
          <input type="range" min={0} max={trace.length - 1} value={col} onChange={(e) => { setPlaying(false); setCol(+e.target.value); }} aria-label="Circuit step" />
        </div>
        <div className="constellation" style={{ marginTop: 10 }}>
          {trace[col].bloch.map((v, k) => (
            <div className="sphere-cell" key={k}><BlochSphere v={v} size={78} spin={false} /><div className="lbl">q{k} {cohort.pathways[k].short}</div></div>
          ))}
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Simulated exactly in your browser (4,096 complex amplitudes). The engine checks these Bloch vectors against Qiskit's Statevector to 10⁻¹⁴.</p>
      </section>

      <section className="panel">
        <div className="h2">Hardware cost on IBM Heron</div>
        <p className="lead small">Shaping the entanglement like the biology keeps circuits short enough to survive real hardware. Like-for-like, our fidelity kernel needs about 5× fewer two-qubit gates than the standard ZZ feature map (188 vs 906).</p>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Encoding, 12 qubits, 2 Trotter steps</th><th>Kernel</th><th>Two-qubit gates</th><th>Two-qubit depth</th><th>Estimated fidelity</th><th>Verdict</th></tr></thead>
            <tbody>
              {HW_TABLE.map((r) => (
                <tr key={r.enc + r.kernel}>
                  <td style={{ fontWeight: r.ok ? 700 : 400 }}>{r.enc}</td><td>{r.kernel}</td>
                  <td><b>{r.twoq}</b></td><td>{r.depth}</td>
                  <td><FidBar v={r.fid} /></td>
                  <td><span className={`chip ${r.ok ? "chip-teal" : r.fid > 0.1 ? "chip-amber" : "chip-eosin"}`}>{r.ok ? "Ready for hardware" : r.fid > 0.1 ? "Noise-limited" : "Noise-dominated"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Computed by the team with Qiskit 2.5 transpilation (optimisation level 3, best of 8 seeds) onto IBM Heron using the FakeFez calibration snapshot, on the real 14-edge crosstalk graph from GSE26549. Estimated fidelity is the product of calibrated gate and readout success rates.</p>
      </section>

      {model.n > LARGE ? <LargeCohortNoiseNotice /> : <><NoiseLab /><ExpressivityNoise /></>}
    </div>
  );
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
function describe(l: Layer) {
  if (l.rep < 0) return "start, every qubit in |0⟩";
  if (l.kind === "h") return "Hadamard on every qubit";
  if (l.kind === "rz") return `Trotter step ${l.rep + 1}: pathway scores set Z rotations`;
  if (l.kind === "rzz") return `Trotter step ${l.rep + 1}: entangle ${l.edges!.length} interacting pathway pairs`;
  return `Trotter step ${l.rep + 1}: X mixing`;
}
const FidBar = ({ v }: { v: number }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <span style={{ width: 70, height: 6, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${v * 100}%`, background: v > 0.5 ? "var(--teal)" : v > 0.1 ? "var(--amber)" : "var(--eosin)" }} /></span>
    {v.toFixed(2)}
  </span>
);

function CircuitView({ trace, col, onPick, labels }: { trace: Layer[]; col: number; onPick: (c: number) => void; labels: string[] }) {
  const n = labels.length, rowH = 28, colW = 42, L = 120, T = 22;
  const W = L + trace.length * colW + 20, H = T + n * rowH + 10;
  const y = (k: number) => T + k * rowH + rowH / 2;
  const x = (c: number) => L + c * colW + colW / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Quantum circuit">
      <rect x={x(col) - colW / 2} y={4} width={colW} height={H - 8} rx={8} fill="var(--violet-soft)" />
      {labels.map((l, k) => (
        <g key={k}>
          <text x={8} y={y(k) + 4} fontSize={11.5} fill="var(--ink-2)">q{k} <tspan fontWeight={600} fill="var(--ink)">{l}</tspan></text>
          <line x1={L - 6} x2={W - 10} y1={y(k)} y2={y(k)} stroke="var(--line)" strokeWidth={1.4} />
        </g>
      ))}
      {trace.map((l, c) => {
        if (l.rep < 0) return null;
        const past = c <= col;
        const op = past ? 1 : 0.3;
        const label = l.kind === "h" ? "H" : l.kind === "rz" ? "Rz" : l.kind === "rx" ? "Rx" : "";
        return (
          <g key={c} opacity={op} style={{ cursor: "pointer", transition: "opacity .25s" }} onClick={() => onPick(c)}>
            <rect x={x(c) - colW / 2} y={0} width={colW} height={H} fill="transparent" />
            {l.kind === "rzz" ? l.edges!.map(([a, b]) => (
              <g key={`${a}${b}`}>
                <line x1={x(c)} x2={x(c)} y1={y(a)} y2={y(b)} stroke="var(--eosin)" strokeWidth={2} />
                <circle cx={x(c)} cy={y(a)} r={5} fill="var(--eosin)" /><circle cx={x(c)} cy={y(b)} r={5} fill="var(--eosin)" />
              </g>
            )) : labels.map((_, k) => (
              <g key={k}>
                <rect x={x(c) - 14} y={y(k) - 10} width={28} height={20} rx={5} fill={l.kind === "h" ? "var(--teal-soft)" : "var(--surface)"} stroke={l.kind === "h" ? "var(--teal)" : "var(--violet)"} strokeWidth={1.3} />
                <text x={x(c)} y={y(k) + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--ink)">{label}</text>
              </g>
            ))}
            {l.kind === "rz" && <text x={x(c)} y={13} textAnchor="middle" fontSize={10} fill="var(--ink-3)">step {l.rep + 1}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function NoiseLab() {
  const { model, theme } = useApp();
  const [p2, setP2] = useState(0.006);
  const [shots, setShots] = useState(256);
  const dp2 = useDeferredValue(p2), dshots = useDeferredValue(shots);
  const exactC = useMemo(() => looCIndex(model.K.proj, model), [model]);
  const dep = useMemo(() => {
    const d = depolarisedBloch(model, dp2);
    const K = projKernelFrom(d.bloch, model.gammaQ);
    return { K, c: looCIndex(K, model), shrink: mean(d.shrink) };
  }, [model, dp2]);
  const fid = useMemo(() => {
    const noisy = shotNoisyFidelity(model.K.fid, dshots, 5);
    const rep = psdProject(noisy);
    const ev = eigSym(noisy).values.sort((a, b) => a - b);
    return { noisy, rep, ev, cNoisy: looCIndex(noisy, model), cRep: looCIndex(rep.K, model) };
  }, [model, dshots]);
  const order = useMemo(() => model.loo.proj.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]), [model]);

  return (
    <section className="two">
      <div className="panel">
        <div className="h2">Depolarising noise</div>
        <p className="small muted" style={{ marginTop: 0 }}>Each two-qubit gate error shrinks the Bloch arrows. The projected kernel is rebuilt and re-evaluated live.</p>
        <div className="slider">
          <div className="slider-head"><span>Two-qubit gate error</span><b>{(p2 * 100).toFixed(1)}%</b></div>
          <input type="range" min={0} max={0.03} step={0.001} value={p2} onChange={(e) => setP2(+e.target.value)} aria-label="Two-qubit gate error" />
        </div>
        <div className="row" style={{ alignItems: "flex-start", marginTop: 12 }}>
          <Heatmap K={dep.K} order={order} size={200} label="Projected kernel under noise, sorted by risk" themeKey={theme} />
          <div className="grid" style={{ gap: 10 }}>
            <div><div className="num">{dep.c.toFixed(3)}</div><div className="tiny muted">C-index with noise (exact: {exactC.toFixed(3)})</div></div>
            <div><div className="num">{dep.shrink.toFixed(2)}</div><div className="tiny muted">mean arrow shrink factor</div></div>
            <p className="tiny muted" style={{ maxWidth: 220, margin: 0 }}>Kernels from measured Bloch vectors are always valid (positive semidefinite), even when noisy.</p>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="h2">Finite shots and kernel repair</div>
        <p className="small muted" style={{ marginTop: 0 }}>A fidelity kernel estimated pair by pair from shots can become mathematically invalid. Clipping negative eigenvalues repairs it.</p>
        <div className="seg" role="group" aria-label="Shots per circuit">
          {[64, 256, 1024, 4096].map((s) => <button key={s} aria-pressed={shots === s} onClick={() => setShots(s)}>{s} shots</button>)}
        </div>
        <Spectrum ev={fid.ev} />
        <div className="three" style={{ gap: 10 }}>
          <div><div className="num" style={{ color: fid.rep.minEigBefore < 0 ? "var(--eosin)" : "var(--teal)" }}>{fid.rep.minEigBefore.toFixed(3)}</div><div className="tiny muted">smallest eigenvalue before repair</div></div>
          <div><div className="num">{fid.cNoisy.toFixed(3)}</div><div className="tiny muted">C-index, noisy</div></div>
          <div><div className="num">{fid.cRep.toFixed(3)}</div><div className="tiny muted">C-index, repaired</div></div>
        </div>
      </div>
    </section>
  );
}

function LargeCohortNoiseNotice() {
  return (
    <section className="panel">
      <div className="h2">Noise laboratory</div>
      <p className="small muted" style={{ marginBottom: 0 }}>The browser skips noisy full-kernel simulations for this 1,975-patient cohort because they require large matrix calculations and would block the page. The circuit walkthrough and hardware cost remain live above; run <code>python -m engine.noise --task survival --cohort out/metabric_cohort.json</code> for the registered noise analysis.</p>
    </section>
  );
}

function Spectrum({ ev }: { ev: number[] }) {
  const W = 520, H = 120, n = ev.length, max = Math.max(...ev.map(Math.abs), 1e-6);
  const lo = Math.min(...ev), scale = (H / 2 - 8) / Math.max(max ** 0.5, 1e-6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Eigenvalue spectrum" style={{ margin: "12px 0" }}>
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--ink-3)" strokeOpacity={0.5} />
      {ev.map((v, i) => {
        const h = Math.sign(v) * Math.sqrt(Math.abs(v)) * scale;
        return <rect key={i} x={(i / n) * W} width={W / n - 1} y={h > 0 ? H / 2 - h : H / 2} height={Math.max(Math.abs(h), 0.8)} fill={v < 0 ? "var(--eosin)" : "var(--violet)"} opacity={0.85} />;
      })}
      <text x={4} y={H - 4} fontSize={10.5} fill="var(--ink-3)">Eigenvalues (sqrt scale), {ev.filter((v) => v < 0).length} negative, min {lo.toFixed(3)}</text>
    </svg>
  );
}

const ENC_COLORS = ["var(--teal)", "#2e75b6", "var(--violet)", "var(--amber)", "var(--eosin)"];
function ExpressivityNoise() {
  const { model } = useApp();
  const [shots, setShots] = useState(1024);
  const [res, setRes] = useState<Awaited<ReturnType<typeof noiseCurve>> | null>(null);
  const [p, setP] = useState<number | null>(null);
  const run = async () => { setRes(null); setP(0); setRes(await noiseCurve(model, shots, setP)); setP(null); };
  const all = res ? res.flatMap((r) => r.pts.map((x) => x.score)) : [0.5, 0.8];
  const lo = Math.max(0.3, Math.floor((Math.min(...all) - 0.03) * 20) / 20), hi = Math.min(1, Math.ceil((Math.max(...all) + 0.03) * 20) / 20);
  return (
    <section className="panel">
      <div className="row">
        <div>
          <div className="h2">Expressivity versus noise</div>
          <p className="small muted" style={{ margin: 0 }}>Gentle encodings (small rotations, one Trotter step) against expressive ones (large rotations, two steps), under rising two-qubit gate error and finite shots. Which should run on real hardware?</p>
        </div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Shots">{[256, 1024, 4096].map((s) => <button key={s} aria-pressed={shots === s} onClick={() => setShots(s)}>{s} shots</button>)}</div>
        <button className="btn btn-primary" onClick={run} disabled={p !== null}>{res ? "Run again" : "Run"}</button>
      </div>
      {p !== null && <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}><div style={{ width: `${p * 100}%`, height: "100%", background: "var(--violet)", transition: "width .2s" }} /></div>}
      {res && (
        <div className="two" style={{ marginTop: 12 }}>
          <div>
            <XYChart xMax={NOISE_P2[NOISE_P2.length - 1]} yMin={lo} yMax={hi} xLabel="Two-qubit gate error" yLabel="C-index" xFmt={(v) => `${(v * 100).toFixed(1)}%`} yFmt={(v) => v.toFixed(2)} height={240}
              series={res.map((r, i) => ({ label: `${r.scale}/${r.reps}`, color: ENC_COLORS[i], dots: true, pts: r.pts.map((x) => ({ x: x.p2, y: x.score })) }))} />
            <div className="legend">{res.map((r, i) => <span key={i}><i style={{ background: ENC_COLORS[i] }} />bandwidth {r.scale}, {r.reps} step{r.reps > 1 ? "s" : ""}</span>)}</div>
          </div>
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Encoding</th><th>Exact</th><th>At 3% error</th><th>Drop</th></tr></thead>
              <tbody>{res.map((r, i) => { const w = r.pts[r.pts.length - 1].score; return <tr key={i}><td><span className="dot" style={{ background: ENC_COLORS[i], display: "inline-block", marginRight: 6 }} />{r.scale}, {r.reps} step{r.reps > 1 ? "s" : ""}</td><td>{r.exact.toFixed(3)}</td><td><b>{w.toFixed(3)}</b></td><td>{(r.exact - w) >= 0 ? "−" : "+"}{Math.abs(r.exact - w).toFixed(3)}</td></tr>; })}</tbody>
            </table>
            <p className="tiny muted">Global-depolarising approximation per qubit plus binomial shot noise. One Trotter step roughly halves the two-qubit gates on hardware. <code>python -m engine.noise</code> runs the cross-validated version; the IBM run checks the approximation.</p>
          </div>
        </div>
      )}
    </section>
  );
}
