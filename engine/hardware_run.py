"""Run SANKET's projected quantum kernel on IBM quantum hardware, then compare hardware with simulation.

Default encoding is the one the noise study recommends: bandwidth 0.25, ONE Trotter step (about half the
two-qubit gates of the two-step circuit, with the same accuracy and the best noise robustness).

One circuit per patient. The Estimator measures the 36 single-qubit expectations <X>, <Y>, <Z> on 12 qubits, which
are exactly the Bloch vectors the projected kernel needs. After the job finishes the script:
  * compares measured with exact Bloch vectors (error per qubit, correlation)
  * builds the projected kernel from the hardware data and scores it (leave-one-out C-index) against the
    same kernel from exact simulation, on the patients that were run
  * writes the job record and measured vectors into the cohort file, so the app's Hardware page shows them

    # 1. one-time account setup
    python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S; S.save_account(channel='ibm_quantum_platform', token='YOUR_TOKEN', overwrite=True)"

    # 2. local dry run on a noisy IBM Heron model (no account needed)
    python -m engine.hardware_run --backend fake --patients 4

    # 3. small real run, then the full cohort
    python -m engine.hardware_run --backend least_busy --patients 8
    python -m engine.hardware_run --backend least_busy

    # 4. if you closed the terminal while queued, fetch the finished job later
    python -m engine.hardware_run --fetch JOB_ID --patients 8

    # gate counts only (no run)
    python -m engine.hardware_run --transpile-only --backend fake
"""
from __future__ import annotations
import argparse
import datetime as dt
import numpy as np
from qiskit.quantum_info import SparsePauliOp
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from .common import load_config, load_cohort, save_json, OUT
from .featuremap import feature_map
from .fastsim import bloch_batch, projected_kernel
from .model import c_index, loo_risks


def pick_patients(P, k, seed=7):
    """Stratified random subset (keeps the event rate), so a small run is still informative."""
    if not k or k >= len(P):
        return list(range(len(P)))
    rng = np.random.default_rng(seed)
    ev = [i for i, p in enumerate(P) if p.get("event")]; ne = [i for i, p in enumerate(P) if not p.get("event")]
    k_ev = max(1, round(k * len(ev) / len(P)))
    idx = list(rng.choice(ev, min(k_ev, len(ev)), replace=False)) + list(rng.choice(ne, min(k - k_ev, len(ne)), replace=False))
    return sorted(int(i) for i in idx)


def get_backend(name, n):
    if name == "fake":
        from qiskit_ibm_runtime.fake_provider import FakeFez
        return FakeFez(), None
    from qiskit_ibm_runtime import QiskitRuntimeService
    svc = QiskitRuntimeService()
    be = svc.least_busy(operational=True, simulator=False, min_num_qubits=n) if name == "least_busy" else svc.backend(name)
    return be, svc


def build_pubs(P, idx, edges, reps, beta, scale, backend, n):
    pm = generate_preset_pass_manager(optimization_level=3, backend=backend, seed_transpiler=7)
    obs = [SparsePauliOp.from_sparse_list([(Pa, [k], 1.0)], num_qubits=n) for k in range(n) for Pa in "XYZ"]
    pubs, twoq, depth = [], [], []
    for i in idx:
        isa = pm.run(feature_map(P[i]["pathways"], edges, reps, beta, scale))
        pubs.append((isa, [o.apply_layout(isa.layout) for o in obs]))
        ops = isa.count_ops(); twoq.append(sum(v for g, v in ops.items() if g in ("cz", "ecr", "cx")))
        depth.append(isa.depth(lambda ins: ins.operation.num_qubits == 2))
    return pubs, twoq, depth


def run_estimator(backend, pubs, shots, resilience, fake):
    from qiskit_ibm_runtime import EstimatorV2, Batch
    if fake:
        est = EstimatorV2(mode=backend); est.options.default_shots = shots
        return est.run(pubs)
    def submit(mode):
        est = EstimatorV2(mode=mode)
        est.options.default_shots = shots
        est.options.resilience_level = resilience
        return est.run(pubs)
    try:
        with Batch(backend=backend) as batch:
            job = submit(batch)
    except Exception as err:  # some plans do not allow batch mode: fall back to a single job
        print(f"Batch mode unavailable ({err.__class__.__name__}); submitting as a single job.")
        job = submit(backend)
    if True:
        print(f"Submitted job {job.job_id()} to {backend.name}. Queue times vary; you can close this terminal and run")
        print(f"   python -m engine.hardware_run --fetch {job.job_id()} ...same options...   later.")
        return job


def analyse(P, idx, measured, exact, horizon, k):
    err = np.linalg.norm(measured - exact, axis=2)                   # (patients, qubits)
    corr = float(np.corrcoef(measured.ravel(), exact.ravel())[0, 1])
    shrink = float(np.linalg.norm(measured, axis=2).mean() / max(np.linalg.norm(exact, axis=2).mean(), 1e-9))
    out = {"mean_error_per_qubit": float(err.mean()), "correlation_with_exact": corr, "length_ratio_measured_vs_exact": shrink}
    t = np.array([P[i]["time"] for i in idx], float); e = np.array([P[i]["event"] for i in idx], int)
    if len(idx) >= 20 and e.sum() >= 3 and (len(e) - e.sum()) >= 3:
        Kh, Ke = projected_kernel(measured), projected_kernel(exact)
        kk = min(k, len(idx) - 1)
        out["c_index_hardware_kernel"] = float(c_index(loo_risks(Kh, t, e, horizon, kk), t, e))
        out["c_index_exact_kernel"] = float(c_index(loo_risks(Ke, t, e, horizon, kk), t, e))
        out["kernel_agreement"] = float(np.corrcoef(Kh[np.triu_indices(len(idx), 1)], Ke[np.triu_indices(len(idx), 1)])[0, 1])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "cohort.json"))
    ap.add_argument("--backend", default="fake", help="fake | least_busy | <backend name, e.g. ibm_fez>")
    ap.add_argument("--patients", type=int, default=0, help="stratified random subset (0 = all)")
    ap.add_argument("--shots", type=int, default=1024)
    ap.add_argument("--scale", type=float, default=0.25)
    ap.add_argument("--reps", type=int, default=1, help="Trotter steps (1 recommended by the noise study)")
    ap.add_argument("--resilience", type=int, default=1, help="0 none, 1 readout mitigation (TREX), 2 adds ZNE")
    ap.add_argument("--fetch", help="job ID of a finished IBM job to analyse instead of submitting")
    ap.add_argument("--transpile-only", action="store_true")
    a = ap.parse_args()
    cfg = load_config()
    coh = load_cohort(a.cohort); P = coh["patients"]; edges = coh["edges"]; n = len(coh["pathways"])
    idx = pick_patients(P, a.patients)
    if a.fetch:
        from qiskit_ibm_runtime import QiskitRuntimeService
        job = QiskitRuntimeService().job(a.fetch); backend = job.backend()
        print(f"Fetching job {a.fetch} on {backend.name} (status {job.status()}); use the same --patients/--scale/--reps as the original run")
        twoq, depth = [float("nan")], [float("nan")]
    else:
        backend, _ = get_backend(a.backend, n)
        print(f"{coh['name']}: {len(idx)} patients on {backend.name}; encoding bandwidth {a.scale}, {a.reps} Trotter step(s), {a.shots} shots")
        pubs, twoq, depth = build_pubs(P, idx, edges, a.reps, cfg["beta"], a.scale, backend, n)
        print(f"Transpiled: {np.mean(twoq):.0f} two-qubit gates and two-qubit depth {np.mean(depth):.0f} per circuit (mean over patients)")
        if a.transpile_only:
            return
        job = run_estimator(backend, pubs, a.shots, a.resilience, a.backend == "fake")
    res = job.result()
    measured = np.stack([np.clip(np.asarray(r.data.evs).reshape(n, 3), -1, 1) for r in res])
    exact = bloch_batch(np.array([P[i]["pathways"] for i in idx]), edges, a.reps, cfg["beta"], a.scale)
    stats = analyse(P, idx, measured, exact, coh.get("horizon", 36), cfg["neighbours"])

    print("\nHardware versus exact simulation:")
    print(f"  mean Bloch-vector error per qubit   {stats['mean_error_per_qubit']:.3f}")
    print(f"  correlation of measured with exact   {stats['correlation_with_exact']:.3f}")
    print(f"  arrow length, measured / exact       {stats['length_ratio_measured_vs_exact']:.2f}  (below 1 = noise shrinkage)")
    if "c_index_hardware_kernel" in stats:
        print(f"  C-index from hardware kernel         {stats['c_index_hardware_kernel']:.3f}")
        print(f"  C-index from exact kernel            {stats['c_index_exact_kernel']:.3f}  (same {len(idx)} patients, leave-one-out)")
        print(f"  kernel agreement (correlation)       {stats['kernel_agreement']:.3f}")
    else:
        print("  (run at least 20 patients, with events and non-events, to score the hardware kernel)")

    fake = a.backend == "fake" and not a.fetch
    rec = {"backend": backend.name, "jobId": job.job_id(), "date": dt.date.today().isoformat(), "shots": a.shots, "patients": len(idx),
           "note": ("local noisy simulation (FakeFez), not hardware" if fake else f"resilience level {a.resilience}") + f"; bandwidth {a.scale}, {a.reps} Trotter step(s)",
           **({"twoQubitGates": round(float(np.mean(twoq)), 1), "twoQubitDepth": round(float(np.mean(depth)), 1)} if not a.fetch else {}),
           **{k: round(v, 4) for k, v in stats.items()}}
    coh.setdefault("hardware", []).append(rec)
    coh.setdefault("measuredBloch", {}).update({P[i]["id"]: measured[j].round(4).tolist() for j, i in enumerate(idx)})
    coh["featureMap"] = {"reps": a.reps, "beta": cfg["beta"], "scale": a.scale}
    save_json(coh, a.cohort)
    save_json(rec, OUT / f"hardware_{job.job_id()}.json")
    print("\nRecorded in the cohort file; reload it in the app's Data page to see the run on the Hardware page.")


if __name__ == "__main__":
    main()