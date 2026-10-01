"""Full benchmark for the report: nested CV for quantum and classical kernels (same as the app),
plus standard survival baselines, repeated cross-validation and paired significance tests.

    python -m engine.benchmark --cohort out/cohort.json --repeats 20
Writes out/results.json and figures in out/figures/.
"""
from __future__ import annotations
import argparse
import numpy as np
from scipy.stats import wilcoxon
from .common import load_config, load_cohort, save_json, OUT
from .model import kernel_candidates, nested_loo, risk_from_row, c_index, geometric_difference, loo_risks


def fold_cindex_kernel(lst, tr, te, t, e, H, k):
    """Choose bandwidth by inner LOO on the training fold, then score the test fold (neighbours from training only)."""
    best, best_c = 0, -1
    for ci, (_, K) in enumerate(lst):
        r = np.array([risk_from_row(K[j], t, e, H, [j], k, allowed=tr) for j in tr])
        c = c_index(r, t[tr], e[tr])
        if c > best_c:
            best_c, best = c, ci
    K = lst[best][1]
    r = np.array([risk_from_row(K[j], t, e, H, [j], k, allowed=tr) for j in te])
    return c_index(r, t[te], e[te])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "cohort.json"))
    ap.add_argument("--repeats", type=int, default=20)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--no-baselines", action="store_true")
    a = ap.parse_args()
    cfg = load_config()
    coh = load_cohort(a.cohort)
    Z = np.array([p["pathways"] for p in coh["patients"]], float)
    t = np.array([p["time"] for p in coh["patients"]], float)
    e = np.array([p["event"] for p in coh["patients"]], int)
    H, k = coh.get("horizon", 36), cfg["neighbours"]
    print(f"{len(t)} patients, {e.sum()} events, {Z.shape[1]} qubits")

    cands, extras = kernel_candidates(Z, coh["edges"], cfg)
    print("Nested leave-one-out (same protocol as the app)...")
    nested = nested_loo(cands, t, e, H, k)
    for kind, r in nested.items():
        print(f"  {kind:5s} C = {r['c']:.3f}  95% CI [{r['ci'][0]:.2f}, {r['ci'][1]:.2f}]")

    # geometric difference against the best classical bandwidth (deployed choice)
    def deployed(lst):
        cs = [c_index(loo_risks(K, t, e, H, k), t, e) for _, K in lst]
        return lst[int(np.argmax(cs))][1]
    Kc = deployed(cands["rbf"])
    geo = {kind: geometric_difference(Kc, deployed(cands[kind])) for kind in ("proj", "fid")}
    print(f"Geometric difference: projected {geo['proj']:.2f}, fidelity {geo['fid']:.2f}")

    # repeated stratified K-fold with baselines
    from sklearn.model_selection import StratifiedKFold, GridSearchCV, KFold
    models = ["proj", "fid", "rbf"]
    use_baselines = not a.no_baselines
    if use_baselines:
        from sksurv.util import Surv
        from sksurv.linear_model import CoxnetSurvivalAnalysis
        from sksurv.ensemble import RandomSurvivalForest
        y = Surv.from_arrays(event=e.astype(bool), time=t)
        models += ["coxnet", "rsf"]
    per = {m: [] for m in models}
    for rep in range(a.repeats):
        skf = StratifiedKFold(a.folds, shuffle=True, random_state=rep)
        fold_scores = {m: [] for m in models}
        for tr, te in skf.split(Z, e):
            for m in ("proj", "fid", "rbf"):
                fold_scores[m].append(fold_cindex_kernel(cands[m], tr, te, t, e, H, k))
            if use_baselines:
                # elastic-net Cox, penalty chosen by inner 3-fold CV on the training fold only
                cox = GridSearchCV(CoxnetSurvivalAnalysis(l1_ratio=0.5, fit_baseline_model=False),
                                   {"alphas": [[0.01], [0.03], [0.1], [0.3]]}, cv=KFold(3, shuffle=True, random_state=rep), error_score=0.5).fit(Z[tr], y[tr])
                fold_scores["coxnet"].append(c_index(cox.predict(Z[te]), t[te], e[te]))
                rsf = RandomSurvivalForest(n_estimators=200, min_samples_leaf=5, random_state=rep).fit(Z[tr], y[tr])
                fold_scores["rsf"].append(c_index(rsf.predict(Z[te]), t[te], e[te]))
        for m in models:
            per[m].append(float(np.mean(fold_scores[m])))
        print(f"  repeat {rep + 1}/{a.repeats}: " + ", ".join(f"{m} {per[m][-1]:.3f}" for m in models))

    # paired tests: projected quantum kernel vs every other model, Holm correction
    tests = []
    for m in models:
        if m == "proj":
            continue
        try:
            p = float(wilcoxon(per["proj"], per[m]).pvalue)
        except ValueError:
            p = 1.0
        tests.append({"vs": m, "mean_diff": float(np.mean(per["proj"]) - np.mean(per[m])), "p": p})
    order = np.argsort([x["p"] for x in tests])
    for rank, i in enumerate(order):
        tests[i]["p_holm"] = min(1.0, tests[i]["p"] * (len(tests) - rank))
    summary = {m: {"mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1))} for m, v in per.items()}
    results = {"cohort": coh["name"], "n": int(len(t)), "events": int(e.sum()),
               "nested_loo": {m: {kk: vv for kk, vv in r.items() if kk != "risks"} for m, r in nested.items()},
               "geometric_difference": geo, "repeated_cv": {"folds": a.folds, "repeats": a.repeats, "summary": summary, "per_repeat": per},
               "tests_vs_projected": tests}
    save_json(results, OUT / "results.json")
    figures(nested, per, t, e)


def figures(nested, per, t, e):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    d = OUT / "figures"; d.mkdir(parents=True, exist_ok=True)
    names = list(per)
    fig, ax = plt.subplots(figsize=(6, 0.6 * len(names) + 1))
    for i, m in enumerate(names):
        v = np.array(per[m]); ax.errorbar(v.mean(), i, xerr=v.std(ddof=1), fmt="s", capsize=4)
    ax.axvline(0.5, ls="--", c="grey"); ax.set_yticks(range(len(names)), names); ax.set_xlabel("C-index (repeated CV, mean ± sd)")
    fig.tight_layout(); fig.savefig(d / "cindex_forest.png", dpi=200)
    print(f"wrote {d / 'cindex_forest.png'}")


if __name__ == "__main__":
    main()
