"""Diagnosis tasks: quantum kernels vs classical models on the same 12 pathway scores.

Tasks
  golub            AML vs ALL leukaemia (out/golub_cohort.json, built by engine.golub)
  metabric_basal   basal-like vs all other PAM50/claudin subtypes (out/metabric_cohort.json + data/brca_metabric clinical file)
  oral_cancer_normal, oral_dysplasia_normal, oral_cancer_dysplasia
                   oral tissue diagnosis on GSE30784 (out/oral_dx_cohort.json, built by engine.oral_diagnosis);
                   registered in docs/osf_oral_diagnosis.md. --external applies the cancer-vs-normal models once to
                   GSE23558 (out/oral_dx_external_cohort.json).

Models: projected quantum kernel SVM, fidelity quantum kernel SVM, classical RBF kernel SVM (bandwidth and C tuned by
inner 3-fold CV, same budget), L2 logistic regression, random forest, gradient boosting.
Repeated stratified 5-fold CV; AUC and accuracy; corrected repeated-CV t-test, projected vs RBF primary, others Holm.

    python -m engine.classify --task golub
    python -m engine.classify --task metabric_basal
    python -m engine.classify --task golub --upgrades      # exploratory quantum-kernel upgrades (declare on OSF first)

Upgrades (exploratory): wider bandwidth grid incl. gentle rotations, 1 or 2 Trotter steps, mixing angle beta;
entanglement ablation; per-qubit scales trained by kernel-target alignment on training folds; hybrid quantum + linear
kernel. Classical side gets the matching extra freedom: wider RBF grid and a linear-kernel SVM.
"""
from __future__ import annotations
import argparse
import time
import warnings
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import roc_auc_score, accuracy_score
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold, StratifiedGroupKFold
from .common import ROOT, OUT, load_config, load_cohort, save_json
from .model import kernel_candidates, sq_dists
from .featuremap import angle_of, states_and_bloch

warnings.filterwarnings("ignore")
C_GRID = [0.1, 1, 10, 100]


def load_task(task, max_n):
    if task == "golub":
        coh = load_cohort(OUT / "golub_cohort.json")
        P = coh["patients"]
        return coh, np.array([p["pathways"] for p in P]), np.array([p["label"] for p in P]), "AML vs ALL"
    if task == "metabric_basal":
        coh = load_cohort(OUT / "metabric_cohort.json")
        pat = pd.read_csv(ROOT / "data/brca_metabric/data_clinical_patient.txt", sep="\t", comment="#", low_memory=False).set_index("PATIENT_ID")
        col = next(c for c in ("CLAUDIN_SUBTYPE", "PAM50_SUBTYPE", "SUBTYPE") if c in pat.columns)
        sub = pat[col].astype(str).str.strip()
        P = [p for p in coh["patients"] if p["id"] in sub.index and sub[p["id"]] not in ("NC", "nan", "")]
        if max_n and len(P) > max_n:
            rng = np.random.default_rng(3); P = [P[i] for i in sorted(rng.choice(len(P), max_n, replace=False))]
        y = np.array([int(sub[p["id"]].lower() == "basal") for p in P])
        return coh, np.array([p["pathways"] for p in P]), y, f"basal-like vs other subtypes ({col})"
    if task in ORAL_TASKS:
        coh = load_cohort(OUT / "oral_dx_cohort.json")
        pos, neg = ORAL_TASKS[task]
        P = [p for p in coh["patients"] if p["diagnosis"] in (pos, neg)]
        return coh, np.array([p["pathways"] for p in P]), np.array([int(p["diagnosis"] == pos) for p in P]), f"{pos} vs {neg}"
    raise SystemExit(f"unknown task {task}")


ORAL_TASKS = {"oral_cancer_normal": ("cancer", "normal"), "oral_dysplasia_normal": ("dysplasia", "normal"),
              "oral_cancer_dysplasia": ("cancer", "dysplasia")}


def task_groups(task):
    """Individual identifiers if any individual contributed more than one sample (else None: ordinary stratified CV)."""
    if task not in ORAL_TASKS:
        return None
    coh = load_cohort(OUT / "oral_dx_cohort.json")
    pos, neg = ORAL_TASKS[task]
    g = [p["meta"].get("individual") for p in coh["patients"] if p["diagnosis"] in (pos, neg)]
    return np.array(g) if all(g) and len(set(g)) < len(g) else None


def outer_splits(Z, y, groups, reps):
    if groups is None:
        yield from RepeatedStratifiedKFold(n_splits=5, n_repeats=reps, random_state=11).split(Z, y)
        return
    for r in range(reps):
        yield from StratifiedGroupKFold(5, shuffle=True, random_state=11 + r).split(Z, y, groups)


def inner_splits(tr, y, seed, groups=None):
    if groups is None:
        return list(StratifiedKFold(3, shuffle=True, random_state=seed).split(tr, y[tr]))
    return list(StratifiedGroupKFold(3, shuffle=True, random_state=seed).split(tr, y[tr], groups[tr]))


def sens_spec(y, d):
    yhat = (d > 0).astype(int)
    pos, neg = y == 1, y == 0
    return (float((yhat[pos] == 1).mean()) if pos.any() else float("nan"), float((yhat[neg] == 0).mean()) if neg.any() else float("nan"))


def select_svm(cands, tr, y, seed, groups=None):
    """Kernel and C with the best inner-CV AUC on the training indices (same budget for every kernel family)."""
    from sklearn.svm import SVC
    best, best_s, best_i = None, -1, 0
    splits = inner_splits(tr, y, seed, groups)
    for ci, (_, K) in enumerate(cands):
        for C in C_GRID:
            s = []
            for itr, ite in splits:
                m = SVC(kernel="precomputed", C=C).fit(K[np.ix_(tr[itr], tr[itr])], y[tr[itr]])
                s.append(roc_auc_score(y[tr[ite]], m.decision_function(K[np.ix_(tr[ite], tr[itr])])))
            if np.mean(s) > best_s:
                best_s, best, best_i = float(np.mean(s)), (K, C), ci
    return best, best_i


def svm_auc(cands, tr, te, y, seed, return_index=False, groups=None, extra=None):
    from sklearn.svm import SVC
    splits = inner_splits(tr, y, seed, groups)
    best, best_s, best_i = None, -1, 0
    for ci, (_, K) in enumerate(cands):
        for C in C_GRID:
            s = []
            for itr, ite in splits:
                m = SVC(kernel="precomputed", C=C).fit(K[np.ix_(tr[itr], tr[itr])], y[tr[itr]])
                s.append(roc_auc_score(y[tr[ite]], m.decision_function(K[np.ix_(tr[ite], tr[itr])])))
            if np.mean(s) > best_s:
                best_s, best, best_i = float(np.mean(s)), (K, C), ci
    K, C = best
    m = SVC(kernel="precomputed", C=C).fit(K[np.ix_(tr, tr)], y[tr])
    d = m.decision_function(K[np.ix_(te, tr)])
    res = (roc_auc_score(y[te], d), accuracy_score(y[te], (d > 0).astype(int)))
    if extra is not None:
        extra.append(sens_spec(y[te], d))
    return (*res, best_i) if return_index else res


# ---------- exploratory upgrades ----------
UP_SCALES = [0.05, 0.1, 0.15, 0.25, 0.4, 0.55, 0.7, 1.0]
UP_CIRCUITS = [(1, 0.5), (2, 0.25), (2, 0.5), (2, 1.0)]
UP_RBF = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8]


def upgrade_kernels(Z, edges):
    from .fastsim import bloch_batch, projected_kernel
    from .featuremap import angle_of
    from .model import sq_dists
    up, noent = [], []
    for sc in UP_SCALES:
        for reps, beta in UP_CIRCUITS:
            up.append((f"scale {sc}, {reps} step(s), beta {beta}", projected_kernel(bloch_batch(Z, edges, reps, beta, sc)).astype(np.float32)))
        for reps in (1, 2):
            noent.append((f"no entanglement, scale {sc}, {reps} step(s)", projected_kernel(bloch_batch(Z, [], reps, 0.5, sc)).astype(np.float32)))
    A = angle_of(Z); D = sq_dists(A); med = np.median(D[np.triu_indices(len(D), 1)])
    rbf = [(f"rbf x{m}", np.exp(-m * D / med).astype(np.float32)) for m in UP_RBF]
    L = Z @ Z.T; L = (L / np.mean(np.diag(L))).astype(np.float32)
    return up, noent, rbf, L


def kta_kernel(Z, edges, tr, y, seed, n_cand=40, sub=300):
    """Per-qubit scales chosen by centred kernel-target alignment on training patients only (random search)."""
    from .fastsim import bloch_batch, projected_kernel
    rng = np.random.default_rng(seed)
    idx = tr if len(tr) <= sub else rng.choice(tr, sub, replace=False)
    yy = np.outer(2 * y[idx] - 1, 2 * y[idx] - 1).astype(float)
    H = np.eye(len(idx)) - 1 / len(idx)
    def align(w):
        K = H @ projected_kernel(bloch_batch(Z[idx], edges, 2, 0.5, w)) @ H
        return float((K * yy).sum() / (np.linalg.norm(K) * np.linalg.norm(yy) + 1e-12))
    cands = [np.full(Z.shape[1], s) for s in (0.1, 0.25, 0.4)] + [np.exp(rng.uniform(np.log(0.05), np.log(1.2), Z.shape[1])) for _ in range(n_cand)]
    best = max(cands, key=align)
    return projected_kernel(bloch_batch(Z, edges, 2, 0.5, best)).astype(np.float32), best


def classical(X, tr, te, y, seed, groups=None, extra=None):
    from sklearn.linear_model import LogisticRegressionCV
    from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
    from sklearn.model_selection import GridSearchCV
    out = {}
    cv = 3 if groups is None else inner_splits(np.arange(len(tr)), y[tr], seed, groups[tr])
    mods = {
        "logistic": LogisticRegressionCV(Cs=10, cv=cv, max_iter=5000),
        "random_forest": GridSearchCV(RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1),
                                      {"min_samples_leaf": [1, 5], "max_features": ["sqrt", 0.5]}, cv=cv, scoring="roc_auc"),
        "gradient_boosting": GridSearchCV(HistGradientBoostingClassifier(random_state=seed),
                                          {"learning_rate": [0.03, 0.1], "max_depth": [2, None]}, cv=cv, scoring="roc_auc"),
    }
    for k, m in mods.items():
        m.fit(X[tr], y[tr])
        p = m.predict_proba(X[te])[:, 1]
        out[k] = (roc_auc_score(y[te], p), accuracy_score(y[te], (p > 0.5).astype(int)))
        if extra is not None:
            extra[k].append(sens_spec(y[te], p - 0.5))
    return out


def corrected_ttest(d, n_train, n_test, k, r):
    d = np.asarray(d); n = k * r; var = d.var(ddof=1)
    if var == 0: return 0.0, 1.0
    t = d.mean() / np.sqrt((1 / n + n_test / n_train) * var)
    return float(t), float(2 * stats.t.sf(abs(t), n - 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", required=True, choices=["golub", "metabric_basal", *ORAL_TASKS])
    ap.add_argument("--external", action="store_true", help="oral_cancer_normal only: train on GSE30784, apply once to GSE23558")
    ap.add_argument("--repeats", type=int, default=None)
    ap.add_argument("--max-n", type=int, default=1200, help="patient cap for large cohorts (random subset)")
    ap.add_argument("--upgrades", action="store_true", help="add the exploratory quantum-kernel upgrades")
    a = ap.parse_args()
    cfg = load_config()
    if a.external:
        if a.task != "oral_cancer_normal":
            raise SystemExit("--external is registered for oral_cancer_normal only")
        return external_check(cfg)
    coh, Z, y, label = load_task(a.task, a.max_n)
    groups = task_groups(a.task)
    reps = a.repeats or (10 if len(y) < 200 or a.task in ORAL_TASKS else 3)
    if groups is not None:
        print(f"Grouped CV: {len(set(groups))} individuals for {len(y)} samples")
    print(f"{coh['name']}: {len(y)} patients, task {label}, positives {y.sum()}")
    t0 = time.time()
    cands, _ = kernel_candidates(Z, coh["edges"], cfg)
    print(f"kernels built in {time.time() - t0:.0f}s")
    models = ["proj", "fid", "rbf", "logistic", "random_forest", "gradient_boosting"]
    picks = {}
    if a.upgrades:
        t1 = time.time()
        UPK, NOENT, RBFUP, LIN = upgrade_kernels(Z, coh["edges"])
        print(f"upgrade kernels built in {time.time() - t1:.0f}s")
        models += ["proj_up", "proj_noent", "proj_kta", "hybrid", "rbf_up", "linear_svm"]
        picks = {"proj_up": [], "proj_noent": [], "hybrid_weight": [], "kta_scales": []}
    auc = {m: [] for m in models}; acc = {m: [] for m in models}; ss = {m: [] for m in models}
    n_tr = n_te = 0
    for i, (tr, te) in enumerate(outer_splits(Z, y, groups, reps)):
        n_tr, n_te = len(tr), len(te)
        for k in ("proj", "fid", "rbf"):
            u, c = svm_auc(cands[k], tr, te, y, i, groups=groups, extra=ss[k]); auc[k].append(u); acc[k].append(c)
        for k, (u, c) in classical(Z, tr, te, y, i, groups=groups, extra=ss).items():
            auc[k].append(u); acc[k].append(c)
        if a.upgrades:
            u, c, bi = svm_auc(UPK, tr, te, y, i, return_index=True); auc["proj_up"].append(u); acc["proj_up"].append(c); picks["proj_up"].append(UPK[bi][0])
            u, c, bj = svm_auc(NOENT, tr, te, y, i, return_index=True); auc["proj_noent"].append(u); acc["proj_noent"].append(c); picks["proj_noent"].append(NOENT[bj][0])
            Kk, w = kta_kernel(Z, coh["edges"], tr, y, i)
            u, c = svm_auc([("kta", Kk)], tr, te, y, i); auc["proj_kta"].append(u); acc["proj_kta"].append(c); picks["kta_scales"].append([round(float(x), 3) for x in w])
            Kq = UPK[bi][1]
            mixes = [(f"w={wt}", (wt * Kq + (1 - wt) * LIN).astype(np.float32)) for wt in (0.0, 0.25, 0.5, 0.75, 1.0)]
            u, c, bm = svm_auc(mixes, tr, te, y, i, return_index=True); auc["hybrid"].append(u); acc["hybrid"].append(c); picks["hybrid_weight"].append(mixes[bm][0])
            u, c = svm_auc(RBFUP, tr, te, y, i); auc["rbf_up"].append(u); acc["rbf_up"].append(c)
            u, c = svm_auc([("linear", LIN)], tr, te, y, i); auc["linear_svm"].append(u); acc["linear_svm"].append(c)
        if (i + 1) % 5 == 0:
            print(f"  repeat {(i + 1) // 5}/{reps}: " + ", ".join(f"{m} {np.mean(auc[m][-5:]):.3f}" for m in models), flush=True)
    summ = {m: {"auc": float(np.mean(auc[m])), "auc_sd": float(np.std(auc[m], ddof=1)), "accuracy": float(np.mean(acc[m])),
                **({"sensitivity": float(np.nanmean([x[0] for x in ss[m]])), "specificity": float(np.nanmean([x[1] for x in ss[m]]))} if ss[m] else {})}
            for m in models}
    tests = []
    for m in models:
        if m == "proj": continue
        t, p = corrected_ttest(np.array(auc["proj"]) - np.array(auc[m]), n_tr, n_te, 5, reps)
        tests.append({"vs": m, "auc_diff": float(np.mean(auc["proj"]) - np.mean(auc[m])), "p": p, "primary": m == "rbf"})
    sec = sorted([x for x in tests if not x["primary"]], key=lambda x: x["p"]); run = 0.0
    for r, x in enumerate(sec):
        run = max(run, min(1.0, x["p"] * (len(sec) - r))); x["p_holm"] = run
    for x in tests:
        if x["primary"]: x["p_holm"] = x["p"]
    print(f"\n{label}: mean AUC (accuracy)")
    for m in sorted(models, key=lambda m: -summ[m]["auc"]):
        print(f"  {m:18s} {summ[m]['auc']:.3f} ± {summ[m]['auc_sd']:.3f}   ({summ[m]['accuracy']:.3f})")
    for x in tests:
        print(f"  proj vs {x['vs']:18s} diff {x['auc_diff']:+.3f}  p {x['p']:.4f}  {'PRIMARY' if x['primary'] else 'Holm ' + format(x['p_holm'], '.4f')}")
    exploratory = []
    if a.upgrades:
        for q, c in (("proj_up", "rbf_up"), ("proj_up", "proj"), ("proj_kta", "rbf_up"), ("hybrid", "logistic"), ("proj_up", "proj_noent")):
            t, p = corrected_ttest(np.array(auc[q]) - np.array(auc[c]), n_tr, n_te, 5, reps)
            exploratory.append({"model": q, "vs": c, "auc_diff": float(np.mean(auc[q]) - np.mean(auc[c])), "p": p})
            print(f"  [exploratory] {q:11s} vs {c:11s} diff {np.mean(auc[q]) - np.mean(auc[c]):+.3f}  p {p:.4f} (uncorrected)")
        from collections import Counter
        for k in ("proj_up", "proj_noent", "hybrid_weight"):
            print(f"  most chosen {k}: {Counter(picks[k]).most_common(2)}")
    save_json({"task": a.task, "label": label, "cohort": coh["name"], "n": int(len(y)), "positives": int(y.sum()),
               "cv": {"folds": 5, "repeats": reps, "grouped": groups is not None}, "summary": summ, "tests_vs_projected": tests,
               "per_fold_auc": auc, "exploratory": exploratory, "upgrade_picks": picks, "upgrades": a.upgrades},
              OUT / f"results_classify_{a.task}{'_upgrades' if a.upgrades else ''}.json")


def transfer_kernels(Zall, n_tr, edges, cfg):
    """Kernel candidates over training + external samples; every bandwidth is set from training samples only."""
    def med(D):
        d = D[:n_tr, :n_tr][np.triu_indices(n_tr, 1)]
        return float(np.median(d)) or 1.0
    cands = {"proj": [], "fid": [], "rbf": []}
    for scale in cfg["scale_grid"]:
        states, B = states_and_bloch(Zall, edges, cfg["reps"], cfg["beta"], scale)
        D = sq_dists(B.reshape(len(B), -1))
        cands["proj"].append((scale, np.exp(-D / med(D))))
        S = np.stack([np.asarray(s.data) for s in states])
        cands["fid"].append((scale, np.abs(S.conj() @ S.T) ** 2))
    D = sq_dists(angle_of(Zall))
    for mult in cfg["rbf_grid"]:
        cands["rbf"].append((mult, np.exp(-mult * D / med(D))))
    return cands


def external_check(cfg):
    """Registered external check (docs/osf_oral_diagnosis.md, section 7): run once, no tuning on external data."""
    from sklearn.svm import SVC
    train = load_cohort(OUT / "oral_dx_cohort.json"); ext = load_cohort(OUT / "oral_dx_external_cohort.json")
    T = [p for p in train["patients"] if p["diagnosis"] in ("cancer", "normal")]
    E = [p for p in ext["patients"] if p["diagnosis"] in ("cancer", "normal")]
    Rtr = np.array([p["pathwaysRaw"] for p in T]); Rex = np.array([p["pathwaysRaw"] for p in E])
    mu, sd = Rtr.mean(0), Rtr.std(0, ddof=1)
    Ztr, Zex = (Rtr - mu) / sd, (Rex - mu) / sd          # external mapped with training statistics only
    ytr = np.array([int(p["diagnosis"] == "cancer") for p in T]); yex = np.array([int(p["diagnosis"] == "cancer") for p in E])
    n_tr = len(T); Zall = np.vstack([Ztr, Zex]); yall = np.concatenate([ytr, yex])
    tr, te = np.arange(n_tr), np.arange(n_tr, len(Zall))
    print(f"External check: train {n_tr} GSE30784 samples ({ytr.sum()} cancer), apply to {len(E)} GSE23558 samples ({yex.sum()} cancer, {len(E) - yex.sum()} normal)")
    cands = transfer_kernels(Zall, n_tr, train["edges"], cfg)
    scores = {}
    for k in ("proj", "fid", "rbf"):
        (K, C), _ = select_svm(cands[k], tr, yall, 0)
        m = SVC(kernel="precomputed", C=C).fit(K[np.ix_(tr, tr)], ytr)
        scores[k] = m.decision_function(K[np.ix_(te, tr)])
    from sklearn.linear_model import LogisticRegressionCV
    from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
    from sklearn.model_selection import GridSearchCV
    mods = {"logistic": LogisticRegressionCV(Cs=10, cv=3, max_iter=5000),
            "random_forest": GridSearchCV(RandomForestClassifier(n_estimators=300, random_state=0, n_jobs=-1), {"min_samples_leaf": [1, 5], "max_features": ["sqrt", 0.5]}, cv=3, scoring="roc_auc"),
            "gradient_boosting": GridSearchCV(HistGradientBoostingClassifier(random_state=0), {"learning_rate": [0.03, 0.1], "max_depth": [2, None]}, cv=3, scoring="roc_auc")}
    for k, m in mods.items():
        scores[k] = m.fit(Ztr, ytr).predict_proba(Zex)[:, 1] - 0.5
    rng = np.random.default_rng(13); summ = {}
    for k, d in scores.items():
        sens, spec = sens_spec(yex, d)
        both = 0 < yex.sum() < len(yex)
        auc = float(roc_auc_score(yex, d)) if both else float("nan")
        boots = []
        if both:
            pos, neg = np.where(yex == 1)[0], np.where(yex == 0)[0]
            for _ in range(2000):
                idx = np.concatenate([rng.choice(pos, len(pos)), rng.choice(neg, len(neg))])
                boots.append(roc_auc_score(yex[idx], d[idx]))
        summ[k] = {"auc": auc, "auc_sd": float(np.std(boots, ddof=1)) if boots else float("nan"),
                   "auc_ci": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))] if boots else None,
                   "accuracy": float(((d > 0).astype(int) == yex).mean()), "sensitivity": sens, "specificity": spec}
        print(f"  {k:18s} sensitivity {sens:.3f}  specificity {spec:.3f}  AUC {auc:.3f}" + (f" (95% CI {summ[k]['auc_ci'][0]:.2f}-{summ[k]['auc_ci'][1]:.2f}, descriptive)" if boots else ""))
    save_json({"task": "oral_cancer_normal_external", "label": "cancer vs normal, trained on GSE30784, applied once to GSE23558",
               "cohort": ext["name"], "n": int(len(yex)), "positives": int(yex.sum()), "train_n": int(n_tr), "external": True,
               "geo": ext.get("geo"), "summary": summ,
               "note": "Descriptive: very few external normals. Mapped with GSE30784 statistics; bandwidths from training samples only."},
              OUT / "results_classify_oral_cancer_normal_external.json")


if __name__ == "__main__":
    main()