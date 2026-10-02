"""Run the projected quantum kernel's measurements on IBM hardware and record the job in cohort.json.

Superseded by engine.hardware_run (one Trotter step, hardware-versus-simulation analysis); kept for the original
two-step encoding. A dry run on the noisy model is only written into the cohort file with --record.

One circuit per patient; the Estimator measures all 36 single-qubit Pauli expectations (X, Y, Z on 12 qubits),
which are exactly the Bloch vectors the projected kernel needs.

    python -m engine.hardware --backend fake --patients 4           # local dry run on a noisy IBM Heron model
    python -m engine.hardware --backend least_busy                  # real QPU (needs saved IBM Quantum account)
    python -m engine.hardware --backend ibm_fez --shots 1024

Save your account once:  python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S; S.save_account(channel='ibm_quantum_platform', token='YOUR_TOKEN', overwrite=True)"
"""
from __future__ import annotations
import argparse
import datetime as dt
import numpy as np
from qiskit.quantum_info import SparsePauliOp
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from .common import load_config, load_cohort, save_json, OUT
from .featuremap import feature_map


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "cohort.json"))
    ap.add_argument("--backend", default="fake", help="fake | least_busy | <backend name>")
    ap.add_argument("--shots", type=int, default=1024)
    ap.add_argument("--patients", type=int, default=0, help="limit for a quick test (0 = all)")
    ap.add_argument("--scale", type=float, default=None, help="bandwidth; default = value chosen in the app/benchmark")
    ap.add_argument("--resilience", type=int, default=1, help="0 none, 1 readout mitigation (TREX), 2 adds ZNE")
    ap.add_argument("--record", action="store_true", help="also write a local dry run (--backend fake) into the cohort file")
    a = ap.parse_args()
    cfg = load_config()
    coh = load_cohort(a.cohort)
    pts = coh["patients"][: a.patients or None]
    n = len(coh["pathways"])
    scale = a.scale or coh.get("featureMap", {}).get("scale")
    if scale is None:  # same rule as the app: bandwidth with the best leave-one-out C-index
        from .model import kernel_candidates, loo_risks, c_index
        Z = np.array([p["pathways"] for p in coh["patients"]]); t = np.array([p["time"] for p in coh["patients"]]); e = np.array([p["event"] for p in coh["patients"]])
        cands, _ = kernel_candidates(Z, coh["edges"], cfg)
        cs = [c_index(loo_risks(K, t, e, coh.get("horizon", 36), cfg["neighbours"]), t, e) for _, K in cands["proj"]]
        scale = cands["proj"][int(np.argmax(cs))][0]

    from qiskit_ibm_runtime import EstimatorV2, Batch
    if a.backend == "fake":
        from qiskit_ibm_runtime.fake_provider import FakeFez
        backend = FakeFez()
    else:
        from qiskit_ibm_runtime import QiskitRuntimeService
        svc = QiskitRuntimeService()
        backend = svc.least_busy(operational=True, simulator=False, min_num_qubits=n) if a.backend == "least_busy" else svc.backend(a.backend)
    print(f"Backend: {backend.name}, {len(pts)} patients, {a.shots} shots, bandwidth {scale}")

    pm = generate_preset_pass_manager(optimization_level=3, backend=backend, seed_transpiler=7)
    obs = [SparsePauliOp.from_sparse_list([(P, [k], 1.0)], num_qubits=n) for k in range(n) for P in "XYZ"]
    pubs = []
    for p in pts:
        isa = pm.run(feature_map(p["pathways"], coh["edges"], cfg["reps"], cfg["beta"], scale))
        pubs.append((isa, [o.apply_layout(isa.layout) for o in obs]))
    print(f"Transpiled: {pubs[0][0].num_nonlocal_gates()} two-qubit gates per circuit")

    if a.backend == "fake":
        est = EstimatorV2(mode=backend)
        est.options.default_shots = a.shots
        job = est.run(pubs)
    else:
        with Batch(backend=backend) as batch:
            est = EstimatorV2(mode=batch)
            est.options.default_shots = a.shots
            est.options.resilience_level = a.resilience
            job = est.run(pubs)
            print(f"Submitted job {job.job_id()} — you can close this and fetch it later from IBM Quantum Platform.")
    res = job.result()
    measured = {p["id"]: np.clip(np.asarray(r.data.evs).reshape(n, 3), -1, 1).round(4).tolist() for p, r in zip(pts, res)}

    rec = {"backend": backend.name, "jobId": job.job_id(), "date": dt.date.today().isoformat(), "shots": a.shots,
           "patients": len(pts), "note": "local noisy simulation (FakeFez), not hardware" if a.backend == "fake" else f"resilience level {a.resilience}"}
    if a.backend == "fake" and not a.record:
        print("Local dry run, not written into the cohort file (add --record to write it there):", rec)
        return
    coh.setdefault("hardware", []).append(rec)
    coh.setdefault("measuredBloch", {}).update(measured)
    coh.setdefault("measuredJob", {}).update({pid: job.job_id() for pid in measured})
    coh["featureMap"] = {"reps": cfg["reps"], "beta": cfg["beta"], "scale": scale}
    save_json(coh, a.cohort)
    print("Recorded:", rec)


if __name__ == "__main__":
    main()
