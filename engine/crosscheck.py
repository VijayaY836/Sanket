"""Compute Qiskit Statevector Bloch vectors for a few patients. Load the output in the app
(Data > Verify against Qiskit) to confirm the browser simulator matches Qiskit exactly.

    python -m engine.crosscheck --cohort out/cohort.json --scale 0.4
"""
import argparse
from qiskit.quantum_info import Statevector
from .common import load_config, load_cohort, save_json, OUT
from .featuremap import feature_map, bloch_vectors

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "cohort.json"))
    ap.add_argument("--scale", type=float, default=0.4)
    ap.add_argument("--patients", type=int, default=5)
    a = ap.parse_args()
    cfg = load_config()
    coh = load_cohort(a.cohort)
    out = {"spec": {"reps": cfg["reps"], "beta": cfg["beta"], "scale": a.scale}, "edges": coh["edges"], "patients": []}
    for p in coh["patients"][: a.patients]:
        sv = Statevector(feature_map(p["pathways"], coh["edges"], cfg["reps"], cfg["beta"], a.scale))
        out["patients"].append({"id": p["id"], "pathways": p["pathways"], "bloch": bloch_vectors(sv).tolist()})
    save_json(out, OUT / "crosscheck.json")
