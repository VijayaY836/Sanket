"""Large-cohort evaluation (METABRIC). Registered protocol:

  * models on the same 12 pathway scores: projected quantum kernel, fidelity quantum kernel, classical RBF kernel
    (each with Beran survival over 15 neighbours, bandwidth chosen by inner 3-fold CV), elastic-net Cox,
    random survival forest, hybrid elastic-net Cox on pathways + quantum Bloch features,
    clinical Cox on NPI, and elastic-net Cox on clinical variables + pathways
  * 5 x repeated stratified 5-fold CV; Harrell's C-index on each test fold
  * primary comparison: projected quantum kernel vs classical RBF kernel, corrected repeated k-fold t-test
    (Bouckaert & Frank 2004), two-sided; secondary comparisons Holm-corrected
  * data-size curve: training sizes 50..1600, 20 repeats, fixed held-out test set of 300 per repeat

    python -m engine.scale --cohort out/metabric_cohort.json
    python -m engine.scale --cohort out/metabric_cohort.json --quick     # small smoke test
"""
from __future__ import annotations
import argparse
import time
import numpy as np
from scipy import stats
from .common import ROOT, OUT, load_config, load_cohort, save_json
from .model import kernel_candidates, beran, survival_at, c_index

CFG = ROOT / "engine" / "config_metabric.yaml"


# ---------- kernel survival at scale ----------
def risks(K, test, train, t, e, H, k):
    out = np.empty(len(test))
    tt, ee = t[train], e[train]
    for a, i in enumerate(test):
        row = K[i, train]
        kk = min(k, len(train) - 1)
        top = np.argpartition(-row, kk)[:kk]
        w = np.zeros(len(train)); w[top] = row[top]
        T, S = beran(w, tt, ee)
        out[a] = 1 - survival_at(T, S, H)
    return out


def pick_bandwidth(cands, train, t, e, H, k, inner, seed):
    from sklearn.model_selection import StratifiedKFold
    skf = StratifiedKFold(inner, shuffle=True, random_state=seed)
    best, best_c = 0, -1
    for ci, (_, K) in enumerate(cands):
        cs = []
        for itr, ite in skf.split(train, e[train]):
            r = risks(K, train[ite], train[itr], t, e, H, k)
            cs.append(c_index(r, t[train[ite]], e[train[ite]]))
        if np.mean(cs) > best_c:
            best_c, best = float(np.mean(cs)), ci
    return best


def kernel_score(cands, train, test, t, e, H, k, inner, seed):
    b = pick_bandwidth(cands, train, t, e, H, k, inner, seed)
    return c_index(risks(cands[b][1], test, train, t, e, H, k), t[test], e[test]), cands[b][0]


# ---------- linear / tree baselines ----------
def _prep(X, train):
    X = X.astype(float).copy()
    med = np.nanmedian(X[train], axis=0)
    idx = np.where(np.isnan(X)); X[idx] = np.take(med, idx[1])
    mu, sd = X[train].mean(0), X[train].std(0) + 1e-9
    return (X - mu) / sd


def coxnet_score(X, train, test, y, t, e, seed):
    from sksurv.linear_model import CoxnetSurvivalAnalysis
    from sklearn.model_selection import GridSearchCV, KFold
    Xs = _prep(X, train)
    gs = GridSearchCV(CoxnetSurvivalAnalysis(l1_ratio=0.5, fit_baseline_model=False),
                      {"alphas": [[a] for a in (0.003, 0.01, 0.03, 0.1, 0.3)]},
                      cv=KFold(3, shuffle=True, random_state=seed), error_score=0.5).fit(Xs[train], y[train])
    return c_index(gs.predict(Xs[test]), t[test], e[test]), gs.best_score_


def cox_score(X, train, test, y, t, e):
    from sksurv.linear_model import CoxPHSurvivalAnalysis
    Xs = _prep(X, train)
    m = CoxPHSurvivalAnalysis(alpha=1e-4).fit(Xs[train], y[train])
    return c_index(m.predict(Xs[test]), t[test], e[test])


def rsf_score(X, train, test, y, t, e, seed):
    from sksurv.ensemble import RandomSurvivalForest
    m = RandomSurvivalForest(n_estimators=200, min_samples_leaf=15, max_features="sqrt", n_jobs=-1, random_state=seed).fit(X[train], y[train])
    return c_index(m.predict(X[test]), t[test], e[test])


def corrected_ttest(d, n_train, n_test, k, r):
    """Bouckaert & Frank (2004) corrected repeated k-fold cross-validation t-test."""
    d = np.asarray(d); n = k * r
    var = d.var(ddof=1)
    if var == 0:
        return 0.0, 1.0
    tstat = d.mean() / np.sqrt((1 / n + n_test / n_train) * var)
    return float(tstat), float(2 * stats.t.sf(abs(tstat), n - 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "metabric_cohort.json"))
    ap.add_argument("--quick", action="store_true", help="smoke test: 400 patients, 1 repeat, short size curve")
    ap.add_argument("--skip-size-curve", action="store_true")
    ap.add_argument("--config", default=str(CFG))
    a = ap.parse_args()
    cfg = load_config(a.config)
    coh = load_cohort(a.cohort)
    P = coh["patients"]
    rng0 = np.random.default_rng(0)
    if a.quick and len(P) > 400:
        P = [P[i] for i in sorted(rng0.choice(len(P), 400, replace=False))]
    Z = np.array([p["pathways"] for p in P], float)
    t = np.array([p["time"] for p in P], float); e = np.array([p["event"] for p in P], int)
    clin_keys = list(P[0].get("clinical", {}).keys())
    C = np.array([[np.nan if p["clinical"].get(c) is None else p["clinical"][c] for c in clin_keys] for p in P], float) if clin_keys else None
    H, k = coh.get("horizon", 60), cfg["neighbours"]
    from sksurv.util import Surv
    y = Surv.from_arrays(event=e.astype(bool), time=t)
    print(f"{len(t)} patients, {e.sum()} events, clinical: {clin_keys}")

    t0 = time.time()
    print("Building quantum and classical kernels...")
    cands, extras = kernel_candidates(Z, coh["edges"], cfg)
    for kind in cands:
        cands[kind] = [(p, K.astype(np.float32)) for p, K in cands[kind]]
    print(f"  done in {time.time() - t0:.0f}s")

    from sklearn.model_selection import RepeatedStratifiedKFold
    folds, reps = cfg["cv_folds"], (1 if a.quick else cfg["cv_repeats"])
    rskf = RepeatedStratifiedKFold(n_splits=folds, n_repeats=reps, random_state=7)
    models = ["proj", "fid", "rbf", "coxnet", "rsf", "hybrid"] + (["clinical_npi", "clinical_plus_pathways"] if C is not None else [])
    per = {m: [] for m in models}
    picks = {m: [] for m in ("proj", "fid", "rbf")}
    n_tr = n_te = 0
    for split, (tr, te) in enumerate(rskf.split(Z, e)):
        n_tr, n_te = len(tr), len(te)
        for kind in ("proj", "fid", "rbf"):
            c, p = kernel_score(cands[kind], tr, te, t, e, H, k, cfg["inner_folds"], split)
            per[kind].append(c); picks[kind].append(p)
        per["coxnet"].append(coxnet_score(Z, tr, te, y, t, e, split)[0])
        per["rsf"].append(rsf_score(Z, tr, te, y, t, e, split))
        # hybrid: pathways + Bloch vectors; bandwidth chosen by inner CV score
        best = max(((coxnet_score(np.hstack([Z, extras[s]["bloch"].reshape(len(Z), -1)]), tr, te, y, t, e, split), s) for s in cfg["scale_grid"]),
                   key=lambda x: x[0][1])
        per["hybrid"].append(best[0][0])
        if C is not None:
            npi = clin_keys.index("NPI") if "NPI" in clin_keys else 0
            per["clinical_npi"].append(cox_score(C[:, [npi]], tr, te, y, t, e))
            per["clinical_plus_pathways"].append(coxnet_score(np.hstack([C, Z]), tr, te, y, t, e, split)[0])
        print(f"  split {split + 1}/{folds * reps}: " + ", ".join(f"{m} {per[m][-1]:.3f}" for m in models), flush=True)

    summary = {m: {"mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0} for m, v in per.items()}
    tests = []
    for m in models:
        if m == "proj": continue
        d = np.array(per["proj"]) - np.array(per[m])
        tstat, p = corrected_ttest(d, n_tr, n_te, folds, reps) if len(d) > 1 else (0.0, 1.0)
        tests.append({"vs": m, "mean_diff": float(d.mean()), "t": tstat, "p": p, "primary": m == "rbf"})
    sec = sorted([x for x in tests if not x["primary"]], key=lambda x: x["p"])
    running = 0.0
    for rank, x in enumerate(sec):
        running = max(running, min(1.0, x["p"] * (len(sec) - rank))); x["p_holm"] = running
    for x in tests:
        if x["primary"]: x["p_holm"] = x["p"]
    print("\nMean C-index:")
    for m in sorted(models, key=lambda m: -summary[m]["mean"]):
        print(f"  {m:24s} {summary[m]['mean']:.3f} ± {summary[m]['sd']:.3f}")
    for x in tests:
        print(f"  proj vs {x['vs']:22s} diff {x['mean_diff']:+.3f}  p {x['p']:.4f}  {'PRIMARY' if x['primary'] else 'Holm ' + format(x['p_holm'], '.4f')}")

    curve = None
    if not a.skip_size_curve:
        curve = size_curve(cands, extras, Z, t, e, y, H, k, cfg, quick=a.quick)
    results = {"cohort": coh["name"], "n": int(len(t)), "events": int(e.sum()), "protocol": "registered; see engine/config_metabric.yaml",
               "repeated_cv": {"folds": folds, "repeats": reps, "summary": summary, "per_split": per, "bandwidth_picks": picks},
               "tests_vs_projected": tests, "size_curve": curve, "seconds": round(time.time() - t0)}
    save_json(results, OUT / ("results_metabric_quick.json" if a.quick else "results_metabric.json"))
    if curve:
        plot_curve(curve)


def size_curve(cands, extras, Z, t, e, y, H, k, cfg, quick=False):
    from sklearn.model_selection import train_test_split
    sizes = [s for s in cfg["size_curve_sizes"] if s <= len(t) - cfg["size_curve_test"]]
    reps = 3 if quick else cfg["size_curve_repeats"]
    if quick: sizes = sizes[:3]
    out = {s: {"proj": [], "rbf": [], "coxnet": []} for s in sizes}
    idx = np.arange(len(t))
    for r in range(reps):
        pool, test = train_test_split(idx, test_size=cfg["size_curve_test"], stratify=e, random_state=100 + r)
        rng = np.random.default_rng(200 + r)
        for s in sizes:
            tr = rng.choice(pool, s, replace=False)
            if e[tr].sum() < 5: continue
            for kind in ("proj", "rbf"):
                out[s][kind].append(kernel_score(cands[kind], tr, test, t, e, H, k, cfg["inner_folds"], r)[0])
            out[s]["coxnet"].append(coxnet_score(Z, tr, test, y, t, e, r)[0])
        print(f"  size curve repeat {r + 1}/{reps}", flush=True)
    return [{"size": s, **{m: {"mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0, "n": len(v)} for m, v in out[s].items()}} for s in sizes]


def plot_curve(curve):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    d = OUT / "figures"; d.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 4))
    for m, lab in (("proj", "Projected quantum kernel"), ("rbf", "Classical RBF kernel"), ("coxnet", "Elastic-net Cox")):
        xs = [c["size"] for c in curve]; mu = np.array([c[m]["mean"] for c in curve]); sd = np.array([c[m]["sd"] for c in curve])
        ax.plot(xs, mu, marker="o", label=lab); ax.fill_between(xs, mu - sd, mu + sd, alpha=0.15)
    ax.set_xscale("log"); ax.set_xlabel("Training patients"); ax.set_ylabel("Test C-index"); ax.axhline(0.5, ls="--", c="grey"); ax.legend()
    fig.tight_layout(); fig.savefig(d / "metabric_size_curve.png", dpi=200)
    print(f"wrote {d / 'metabric_size_curve.png'}")


if __name__ == "__main__":
    main()