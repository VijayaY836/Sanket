"""Expressivity versus noise: which encodings survive realistic hardware noise?

Encodings vary in expressivity two ways: rotation strength (bandwidth 0.1 gentle ... 1.0 expressive) and depth
(1 or 2 Trotter steps; one step roughly halves the two-qubit gates). Noise model:
  * gate noise: each qubit's Bloch vector shrinks by (1-p1)^(1+2r) (1-p2)^(2 r d_k), d_k = couplings on qubit k,
    p1 = p2/10 (global-depolarising approximation, calibrated to Heron-like error rates of 0.2-3%)
  * finite shots: each Bloch component estimated from S shots per measurement basis (binomial sampling)
Each setting is a fixed kernel (no retuning), evaluated with the same repeated cross-validation; noise is redrawn
for every repeat. The IBM hardware run (engine.hardware) checks the approximation on real devices.

    python -m engine.noise --task survival --cohort out/metabric_cohort.json --max-n 800
    python -m engine.noise --task metabric_basal
Writes out/results_noise_<name>.json and out/figures/noise_<name>.png
"""
from __future__ import annotations
import argparse
import warnings
from pathlib import Path
import numpy as np
from sklearn.model_selection import RepeatedStratifiedKFold
from .common import OUT, load_config, save_json
from .experiments_common import gaussian_from_features, load_task
from .fastsim import bloch_batch
from .model import c_index

warnings.filterwarnings("ignore")
ENCODINGS = [(0.1, 1), (0.25, 1), (0.25, 2), (0.55, 2), (1.0, 2)]
P2 = [0.0, 0.005, 0.01, 0.02, 0.03]


def noisy_bloch(B, edges, reps, p2, shots, rng):
    q = B.shape[1]; deg = np.zeros(q)
    for a_, b_ in edges: deg[a_] += 1; deg[b_] += 1
    f = (1 - p2 / 10) ** (1 + 2 * reps) * (1 - p2) ** (2 * reps * deg)
    Bn = B * f[None, :, None]
    if shots:
        p = np.clip((1 + Bn) / 2, 0, 1)
        Bn = 2 * rng.binomial(shots, p) / shots - 1
    return Bn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", default="survival", choices=["survival", "golub", "metabric_basal"])
    ap.add_argument("--cohort", default=str(OUT / "metabric_cohort.json"))
    ap.add_argument("--max-n", type=int, default=800)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--shots", type=int, default=1024)
    a = ap.parse_args()
    cfg = load_config()
    coh, Z, kind, target = load_task(a.task, a.cohort, a.max_n)
    edges = coh["edges"]; name = Path(a.cohort).stem if a.task == "survival" else a.task
    strat = target[1] if kind == "survival" else target
    print(f"{coh['name']}: {len(Z)} patients, task {a.task}, {a.shots} shots per basis")
    exact = {(s, r): bloch_batch(Z, edges, r, cfg["beta"], s) for s, r in ENCODINGS}
    rskf = list(RepeatedStratifiedKFold(n_splits=5, n_repeats=a.repeats, random_state=31).split(Z, strat))
    rows = []
    for (s, r), B in exact.items():
        for p2 in P2:
            for shots in ([0, a.shots] if p2 == 0 else [a.shots]):
                vals = []
                for rep in range(a.repeats):
                    rng = np.random.default_rng(1000 * rep + int(p2 * 1e4) + shots)
                    K = gaussian_from_features(noisy_bloch(B, edges, r, p2, shots, rng).reshape(len(Z), -1))
                    for tr, te in rskf[rep * 5:(rep + 1) * 5]:
                        if kind == "survival":
                            from .scale import risks
                            t, e, H = target
                            vals.append(c_index(risks(K, te, tr, t, e, H, cfg["neighbours"]), t[te], e[te]))
                        else:
                            from .classify import svm_auc
                            vals.append(svm_auc([("k", K)], tr, te, target, rep)[0])
                rows.append({"scale": s, "trotter_steps": r, "p2": p2, "shots": shots or "exact", "score": float(np.mean(vals)), "sd": float(np.std(vals, ddof=1))})
        line = "  ".join(f"{x['score']:.3f}" for x in rows if x["scale"] == s and x["trotter_steps"] == r)
        print(f"  bandwidth {s:<4} {r} step(s): exact, then p2 = {P2} at {a.shots} shots -> {line}", flush=True)
    metric = "C-index" if kind == "survival" else "AUC"
    summ = []
    for s, r in ENCODINGS:
        ex = next(x["score"] for x in rows if x["scale"] == s and x["trotter_steps"] == r and x["shots"] == "exact")
        worst = next(x["score"] for x in rows if x["scale"] == s and x["trotter_steps"] == r and x["p2"] == P2[-1])
        summ.append({"scale": s, "trotter_steps": r, "exact": ex, "at_3pct": worst, "drop": ex - worst})
    print(f"\nDrop in {metric} from exact simulation to 3% two-qubit error with {a.shots} shots:")
    for x in summ:
        print(f"  bandwidth {x['scale']:<4} {x['trotter_steps']} step(s): {x['exact']:.3f} -> {x['at_3pct']:.3f}  (drop {x['drop']:+.3f})")
    save_json({"task": a.task, "cohort": coh["name"], "n": int(len(Z)), "metric": metric, "shots": a.shots, "rows": rows, "summary": summ,
               "noise_model": "global-depolarising Bloch shrink per qubit (p1 = p2/10) plus binomial shot noise"}, OUT / f"results_noise_{name}.json")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6.4, 4))
    for s, r in ENCODINGS:
        pts = [x for x in rows if x["scale"] == s and x["trotter_steps"] == r and x["shots"] != "exact"]
        ax.plot([x["p2"] * 100 for x in pts], [x["score"] for x in pts], marker="o", label=f"bandwidth {s}, {r} step{'s' if r > 1 else ''}")
    ax.set_xlabel("Two-qubit gate error (%)"); ax.set_ylabel(metric); ax.set_title(f"{coh['name']}, {a.shots} shots"); ax.legend(fontsize=8)
    fig.tight_layout(); (OUT / "figures").mkdir(parents=True, exist_ok=True); fig.savefig(OUT / "figures" / f"noise_{name}.png", dpi=200)
    print(f"wrote {OUT / 'figures' / f'noise_{name}.png'}")


if __name__ == "__main__":
    main()