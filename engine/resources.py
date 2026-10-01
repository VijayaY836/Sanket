"""Gate-count study on IBM Heron (FakeFez calibration): SANKET's crosstalk circuit vs all-to-all and the standard ZZ map.

    python -m engine.resources                     # edges from out/cohort.json
    python -m engine.resources --cohort path.json --seeds 8
Writes out/resources.json. Same random angles for every circuit so the comparison is like-for-like.
"""
from __future__ import annotations
import argparse, json
import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit.circuit.library import zz_feature_map
from qiskit_ibm_runtime.fake_provider import FakeFez
from .common import OUT, save_json


def ham_map(x, edges, reps=2, beta=0.5):
    n = len(x); qc = QuantumCircuit(n); qc.h(range(n))
    for _ in range(reps):
        for i in range(n): qc.rz(2 * x[i], i)
        for i, j in edges: qc.rzz(2 * x[i] * x[j], i, j)
        for i in range(n): qc.rx(2 * beta, i)
    return qc


def stats(qc, be, seeds):
    tgt = be.target; best = None
    for seed in range(seeds):
        t = transpile(qc, be, optimization_level=3, seed_transpiler=seed)
        twoq = sum(v for k, v in t.count_ops().items() if k in ("cz", "ecr", "cx"))
        d2 = t.depth(lambda ins: ins.operation.num_qubits == 2)
        if best is None or twoq < best[1]: best = (t, twoq, d2)
    t, twoq, d2 = best
    logf = 0.0
    for ins in t.data:
        name = ins.operation.name
        if name in ("barrier", "delay"): continue
        qs = tuple(t.find_bit(q).index for q in ins.qubits)
        try:
            p = tgt[name][qs]
            if p is not None and p.error is not None: logf += np.log(max(1e-12, 1 - p.error))
        except KeyError:
            pass
    return dict(twoq=int(twoq), depth2q=int(d2), est_fid=round(float(np.exp(logf)), 3))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "cohort.json"))
    ap.add_argument("--seeds", type=int, default=8)
    ap.add_argument("--only-bio", action="store_true")
    a = ap.parse_args()
    coh = json.load(open(a.cohort, encoding="utf-8"))
    edges = [tuple(e) for e in coh["edges"]]; n = len(coh["pathways"])
    be = FakeFez()
    rng = np.random.default_rng(0); x = rng.uniform(0, np.pi / 2, n); y = rng.uniform(0, np.pi / 2, n)
    sets = [("sanket", edges)] + ([] if a.only_bio else [("all_to_all", [(i, j) for i in range(n) for j in range(i + 1, n)])])
    res = {"edges": len(edges)}
    for name, el in sets:
        U = ham_map(x, el)
        proj = U.copy(); proj.measure_all()
        fid = U.compose(ham_map(y, el).inverse()); fid.measure_all()
        res[name] = {"projected": stats(proj, be, a.seeds), "fidelity": stats(fid, be, a.seeds)}
        print(name, res[name])
    if not a.only_bio:
        zz = zz_feature_map(n, reps=2, entanglement="full").assign_parameters(x)
        zzf = zz.compose(zz_feature_map(n, reps=2, entanglement="full").assign_parameters(y).inverse()); zzf.measure_all()
        res["zz_full_fidelity"] = stats(zzf, be, a.seeds); print("zz", res["zz_full_fidelity"])
    save_json(res, OUT / "resources.json")


if __name__ == "__main__":
    main()