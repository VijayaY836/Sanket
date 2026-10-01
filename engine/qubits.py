"""Do more qubits help? Performance as pathways (qubits) are added in a fixed, label-free order.

Qubits are added one biological theme at a time (proliferation, stress, genome, microenvironment, ...), never by
looking at outcomes. At each size the quantum kernel and the classical RBF kernel see exactly the same pathways
(information-matched), with bandwidths tuned inside training folds.

    python -m engine.qubits --task survival --cohort out/metabric_cohort.json --max-n 1000
    python -m engine.qubits --task survival --cohort out/cohort.json
    python -m engine.qubits --task metabric_basal
    python -m engine.qubits --task golub
Writes out/results_qubits_<name>.json and out/figures/qubits_<name>.png
"""
from __future__ import annotations
import argparse
import warnings
from pathlib import Path
import numpy as np
from sklearn.model_selection import RepeatedStratifiedKFold
from .common import OUT, load_config, save_json
from .experiments_common import priority_order, sub_edges, proj_candidates, rbf_candidates, load_task
from .model import c_index

warnings.filterwarnings("ignore")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", default="survival", choices=["survival", "golub", "metabric_basal"])
    ap.add_argument("--cohort", default=str(OUT / "metabric_cohort.json"))
    ap.add_argument("--max-n", type=int, default=1000)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--sizes", default="2,4,6,8,10,12")
    a = ap.parse_args()
    cfg = load_config()
    coh, Z, kind, target = load_task(a.task, a.cohort, a.max_n)
    order = priority_order(coh["pathways"])
    sizes = [s for s in map(int, a.sizes.split(",")) if s <= len(order)]
    name = Path(a.cohort).stem if a.task == "survival" else a.task
    strat = target[1] if kind == "survival" else target
    print(f"{coh['name']}: {len(Z)} patients, task {a.task}; qubit order: {[coh['pathways'][i]['short'] for i in order]}")
    rows = []
    for q in sizes:
        keep = order[:q]; Zq = Z[:, keep]; Eq = sub_edges(coh["edges"], keep)
        Kp, Kr = proj_candidates(Zq, Eq), rbf_candidates(Zq)
        res = {"proj": [], "rbf": []}
        rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=a.repeats, random_state=21)
        for i, (tr, te) in enumerate(rskf.split(Zq, strat)):
            for m, cands in (("proj", Kp), ("rbf", Kr)):
                if kind == "survival":
                    from .scale import pick_bandwidth, risks
                    t, e, H = target
                    b = pick_bandwidth(cands, tr, t, e, H, cfg["neighbours"], 3, i)
                    res[m].append(c_index(risks(cands[b][1], te, tr, t, e, H, cfg["neighbours"]), t[te], e[te]))
                else:
                    from .classify import svm_auc
                    res[m].append(svm_auc(cands, tr, te, target, i)[0])
        d = np.array(res["proj"]) - np.array(res["rbf"])
        row = {"qubits": q, "pathways": [coh["pathways"][k]["short"] for k in keep], "edges": len(Eq),
               "proj": float(np.mean(res["proj"])), "proj_sd": float(np.std(res["proj"], ddof=1)),
               "rbf": float(np.mean(res["rbf"])), "rbf_sd": float(np.std(res["rbf"], ddof=1)), "diff": float(d.mean())}
        rows.append(row)
        print(f"  {q:2d} qubits ({len(Eq):2d} couplings): quantum {row['proj']:.3f}  classical {row['rbf']:.3f}  difference {row['diff']:+.3f}", flush=True)
    metric = "C-index" if kind == "survival" else "AUC"
    save_json({"task": a.task, "cohort": coh["name"], "n": int(len(Z)), "metric": metric, "order": [coh["pathways"][i]["short"] for i in order], "rows": rows},
              OUT / f"results_qubits_{name}.json")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6, 4))
    for m, lab in (("proj", "Projected quantum kernel"), ("rbf", "Classical RBF kernel")):
        mu = np.array([r[m] for r in rows]); sd = np.array([r[m + "_sd"] for r in rows])
        ax.plot(sizes, mu, marker="o", label=lab); ax.fill_between(sizes, mu - sd, mu + sd, alpha=0.15)
    ax.set_xlabel("Qubits (pathways encoded)"); ax.set_ylabel(metric); ax.set_title(coh["name"]); ax.legend()
    fig.tight_layout(); (OUT / "figures").mkdir(parents=True, exist_ok=True); fig.savefig(OUT / "figures" / f"qubits_{name}.png", dpi=200)
    print(f"wrote {OUT / 'figures' / f'qubits_{name}.png'}")


if __name__ == "__main__":
    main()