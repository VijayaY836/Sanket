"""When does quantum win? An engineered-advantage benchmark on real pathway features.

Following Huang et al., "Power of data in quantum machine learning" (Nat. Commun. 12, 2631, 2021):
labels are constructed from the SANKET projected quantum kernel so that the geometric difference to the
best classical RBF kernel is maximal (top eigenvector of sqrt(Kq) (Kc + lam I)^-1 sqrt(Kq)). On such data a
quantum kernel model should learn from far fewer patients than classical models. The same models are then run
on the REAL outcome (relapse/progression within the horizon) as a contrast.

The engineered labels are synthetic by construction and must always be presented as such.

    python -m engine.advantage --cohort out/metabric_cohort.json
    python -m engine.advantage --cohort out/cohort.json --pool 86        # oral cohort
Writes out/results_advantage.json and out/figures/advantage_curve.png.
"""
from __future__ import annotations
import argparse
import warnings
import numpy as np
warnings.filterwarnings("ignore")
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from .common import OUT, load_config, load_cohort, save_json
from .featuremap import angle_of, states_and_bloch
from .model import sq_dists

ALPHAS = [1e-3, 1e-2, 1e-1, 1.0]
RBF_MULTS = [0.25, 0.5, 1, 2, 4]


def psd_sqrt(K):
    w, V = np.linalg.eigh(K)
    return (V * np.sqrt(np.clip(w, 0, None))) @ V.T


def geometric_difference(Kc, Kq, lam):
    n = len(Kc)
    Kc = Kc * n / np.trace(Kc); Kq = Kq * n / np.trace(Kq)
    sq = psd_sqrt(Kq)
    M = sq @ np.linalg.solve(Kc + lam * np.eye(n), sq)
    M = (M + M.T) / 2
    w, V = np.linalg.eigh(M)
    return float(np.sqrt(max(w[-1], 0))), sq, V[:, -1]


def krr_scores(K, tr, te, target, alpha):
    A = K[np.ix_(tr, tr)] + alpha * np.eye(len(tr))
    yt = target[tr] - target[tr].mean()
    coef = np.linalg.solve(A, yt)
    return K[np.ix_(te, tr)] @ coef


def tuned_krr(kernels, tr, te, y, seed, target):
    """kernels: list of (name, K). Pick kernel + ridge by inner 3-fold AUC on the training set only."""
    skf = StratifiedKFold(3, shuffle=True, random_state=seed)
    best, best_auc = None, -1
    for name, K in kernels:
        for a in ALPHAS:
            aucs = []
            for itr, ite in skf.split(tr, y[tr]):
                s = krr_scores(K, tr[itr], tr[ite], target, a)
                if len(set(y[tr[ite]])) > 1:
                    aucs.append(roc_auc_score(y[tr[ite]], s))
            if aucs and np.mean(aucs) > best_auc:
                best_auc, best = float(np.mean(aucs)), (K, a)
    K, a = best
    return roc_auc_score(y[te], krr_scores(K, tr, te, target, a))


def classical_models(X, tr, te, y, seed, target, continuous):
    """Tuned classical learners. With continuous targets they are trained as regressors (same information as the kernels)."""
    from sklearn.model_selection import GridSearchCV
    if continuous:
        from sklearn.linear_model import RidgeCV
        from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
        out = {}
        out["logistic"] = roc_auc_score(y[te], RidgeCV(alphas=np.logspace(-3, 3, 13)).fit(X[tr], target[tr]).predict(X[te]))
        rf = GridSearchCV(RandomForestRegressor(n_estimators=300, random_state=seed, n_jobs=-1),
                          {"min_samples_leaf": [1, 5, 15], "max_features": ["sqrt", 0.5]}, cv=3).fit(X[tr], target[tr])
        out["random_forest"] = roc_auc_score(y[te], rf.predict(X[te]))
        gb = GridSearchCV(HistGradientBoostingRegressor(random_state=seed),
                          {"learning_rate": [0.03, 0.1], "max_depth": [2, 4, None]}, cv=3).fit(X[tr], target[tr])
        out["gradient_boosting"] = roc_auc_score(y[te], gb.predict(X[te]))
        return out
    from sklearn.linear_model import LogisticRegressionCV
    from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
    out = {}
    lr = LogisticRegressionCV(Cs=8, cv=3, max_iter=2000).fit(X[tr], y[tr])
    out["logistic"] = roc_auc_score(y[te], lr.predict_proba(X[te])[:, 1])
    rf = GridSearchCV(RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1),
                      {"min_samples_leaf": [1, 5, 15], "max_features": ["sqrt", 0.5]}, cv=3, scoring="roc_auc").fit(X[tr], y[tr])
    out["random_forest"] = roc_auc_score(y[te], rf.predict_proba(X[te])[:, 1])
    gb = GridSearchCV(HistGradientBoostingClassifier(random_state=seed),
                      {"learning_rate": [0.03, 0.1], "max_depth": [2, 4, None]}, cv=3, scoring="roc_auc").fit(X[tr], y[tr])
    out["gradient_boosting"] = roc_auc_score(y[te], gb.predict_proba(X[te])[:, 1])
    return out


def run_task(name, y, Kq_list, Kc_list, X, sizes, repeats, test_size, seed0=0, target=None):
    continuous = target is not None
    target = target if continuous else y.astype(float)
    idx = np.arange(len(y))
    models = ["quantum_kernel", "classical_rbf_kernel", "logistic", "random_forest", "gradient_boosting"]
    res = {s: {m: [] for m in models} for s in sizes}
    for r in range(repeats):
        pool, te = train_test_split(idx, test_size=test_size, stratify=y, random_state=seed0 + r)
        rng = np.random.default_rng(seed0 + 1000 + r)
        for s in sizes:
            tr = rng.choice(pool, s, replace=False)
            if min(y[tr].sum(), (1 - y[tr]).sum()) < 4:
                continue
            res[s]["quantum_kernel"].append(tuned_krr(Kq_list, tr, te, y, r, target))
            res[s]["classical_rbf_kernel"].append(tuned_krr(Kc_list, tr, te, y, r, target))
            for m, v in classical_models(X, tr, te, y, r, target, continuous).items():
                res[s][m].append(v)
        print(f"  {name}: repeat {r + 1}/{repeats}", flush=True)
    curve = []
    for s in sizes:
        row = {"size": s}
        for m in models:
            v = res[s][m]
            row[m] = {"mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0, "n": len(v)}
        curve.append(row)
    return curve


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "metabric_cohort.json"))
    ap.add_argument("--pool", type=int, default=800, help="patients used (random subset for large cohorts)")
    ap.add_argument("--repeats", type=int, default=10)
    ap.add_argument("--lam", type=float, default=0.01)
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    cfg = load_config()
    coh = load_cohort(a.cohort)
    P = coh["patients"]
    rng = np.random.default_rng(42)
    if len(P) > a.pool:
        P = [P[i] for i in sorted(rng.choice(len(P), a.pool, replace=False))]
    n = len(P)
    Z = np.array([p["pathways"] for p in P], float)
    t = np.array([p["time"] for p in P], float); e = np.array([p["event"] for p in P], int)
    H = coh.get("horizon", 36)
    print(f"{coh['name']}: {n} patients")

    # kernels
    A = angle_of(Z); D = sq_dists(A); med = np.median(D[np.triu_indices(n, 1)])
    Kc_list = [(f"rbf×{m}", np.exp(-m * D / med)) for m in RBF_MULTS]
    Kq_by_scale = {}
    for scale in cfg["scale_grid"]:
        _, B = states_and_bloch(Z, coh["edges"], cfg["reps"], cfg["beta"], scale)
        DB = sq_dists(B); mb = np.median(DB[np.triu_indices(n, 1)])
        Kq_by_scale[scale] = np.exp(-DB / mb)

    # construction: the quantum kernel and the strongest classical RBF kernel (smallest g) for each scale
    table = []
    for scale, Kq in Kq_by_scale.items():
        gs = [geometric_difference(Kc, Kq, a.lam)[0] for _, Kc in Kc_list]
        table.append({"scale": scale, "g_vs_each_rbf": gs, "g_min": float(min(gs))})
        print(f"  scale {scale}: g against the closest classical kernel = {min(gs):.2f}")
    best = max(table, key=lambda r: r["g_min"])
    scale = best["scale"]; Kq = Kq_by_scale[scale]
    kc_idx = int(np.argmin(best["g_vs_each_rbf"])); Kc = Kc_list[kc_idx][1]
    g, sq, v = geometric_difference(Kc, Kq, a.lam)
    y_cont = sq @ v
    y_eng = (y_cont > np.median(y_cont)).astype(int)
    print(f"Engineered labels: quantum scale {scale}, against {Kc_list[kc_idx][0]}, g = {g:.2f}")

    # real outcome as a binary task: event before the horizon vs event-free beyond it (censored-before-horizon excluded)
    known = (e == 1) & (t <= H) | (t > H)
    y_real_all = ((e == 1) & (t <= H)).astype(int)

    sizes = [s for s in ([25, 50, 100, 200, 400] if not a.quick else [25, 50, 100]) if s <= int(0.75 * n)]
    reps = 3 if a.quick else a.repeats
    test = max(40, min(200, n // 4))
    Kq_list = [(f"quantum scale {scale}", Kq)]
    print("Task 1: engineered quantum-structured labels")
    y_std = (y_cont - y_cont.mean()) / y_cont.std()
    eng = run_task("engineered", y_eng, Kq_list, Kc_list, Z, sizes, reps, test, target=y_std)
    print("Task 2: real outcome")
    ki = np.where(known)[0]
    sub = lambda Ks: [(nm, K[np.ix_(ki, ki)]) for nm, K in Ks]
    real_sizes = [s for s in sizes if s <= int(0.75 * len(ki))]
    # real outcome: equal tuning budget, so the quantum kernel gets its full bandwidth grid (like the classical kernel)
    Kq_all = [(f"quantum scale {sc}", K) for sc, K in Kq_by_scale.items()]
    real = run_task("real", y_real_all[ki], sub(Kq_all), sub(Kc_list), Z[ki], real_sizes, reps, max(30, min(200, len(ki) // 4)), seed0=500)

    out = {"cohort": coh["name"], "patients": n, "construction": {"method": "Huang et al. 2021 engineered labels", "quantum_scale": scale,
           "classical_kernel": Kc_list[kc_idx][0], "lambda": a.lam, "g": g, "scan": table},
           "horizon": H, "engineered": eng, "real": real, "real_label": f"event within {H} months (n={len(ki)})",
           "note": "Engineered labels are synthetic by construction; they show the platform detects quantum structure. Real-outcome results are the clinically meaningful ones."}
    save_json(out, OUT / ("results_advantage_quick.json" if a.quick else "results_advantage.json"))
    plot(out)
    for task in ("engineered", "real"):
        print(f"\n{task}: AUC by training size")
        for row in out[task]:
            print(f"  n={row['size']:4d}  " + "  ".join(f"{m.split('_')[0]} {row[m]['mean']:.3f}" for m in row if m != "size"))


def plot(out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    d = OUT / "figures"; d.mkdir(parents=True, exist_ok=True)
    fig, axs = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
    for ax, task, title in ((axs[0], "engineered", "Engineered quantum-structured labels"), (axs[1], "real", "Real outcome")):
        for m in ("quantum_kernel", "classical_rbf_kernel", "logistic", "random_forest", "gradient_boosting"):
            xs = [r["size"] for r in out[task]]; mu = np.array([r[m]["mean"] for r in out[task]]); sd = np.array([r[m]["sd"] for r in out[task]])
            ax.plot(xs, mu, marker="o", lw=2.5 if m == "quantum_kernel" else 1.4, label=m.replace("_", " "))
            if m in ("quantum_kernel", "classical_rbf_kernel"): ax.fill_between(xs, mu - sd, mu + sd, alpha=0.12)
        ax.set_xscale("log"); ax.set_title(title); ax.set_xlabel("Training patients"); ax.axhline(0.5, ls="--", c="grey")
    axs[0].set_ylabel("Test AUC"); axs[1].legend(fontsize=8)
    fig.tight_layout(); fig.savefig(d / "advantage_curve.png", dpi=200)
    print(f"wrote {d / 'advantage_curve.png'}")


if __name__ == "__main__":
    main()