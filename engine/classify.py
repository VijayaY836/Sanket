"""Diagnosis tasks: quantum kernels vs classical models on the same 12 pathway scores.

Tasks
  golub            AML vs ALL leukaemia (out/golub_cohort.json, built by engine.golub)
  metabric_basal   basal-like vs all other PAM50/claudin subtypes (out/metabric_cohort.json + data/brca_metabric clinical file)

Models: projected quantum kernel SVM, fidelity quantum kernel SVM, classical RBF kernel SVM (bandwidth and C tuned by
inner 3-fold CV, same budget), L2 logistic regression, random forest, gradient boosting.
Repeated stratified 5-fold CV; AUC and accuracy; corrected repeated-CV t-test, projected vs RBF primary, others Holm.

    python -m engine.classify --task golub
    python -m engine.classify --task metabric_basal
"""
from __future__ import annotations
import argparse
import time
import warnings
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import roc_auc_score, accuracy_score
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold
from .common import ROOT, OUT, load_config, load_cohort, save_json
from .model import kernel_candidates

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
    raise SystemExit(f"unknown task {task}")


def svm_auc(cands, tr, te, y, seed):
    from sklearn.svm import SVC
    skf = StratifiedKFold(3, shuffle=True, random_state=seed)
    best, best_s = None, -1
    for _, K in cands:
        for C in C_GRID:
            s = []
            for itr, ite in skf.split(tr, y[tr]):
                m = SVC(kernel="precomputed", C=C).fit(K[np.ix_(tr[itr], tr[itr])], y[tr[itr]])
                s.append(roc_auc_score(y[tr[ite]], m.decision_function(K[np.ix_(tr[ite], tr[itr])])))
            if np.mean(s) > best_s:
                best_s, best = float(np.mean(s)), (K, C)
    K, C = best
    m = SVC(kernel="precomputed", C=C).fit(K[np.ix_(tr, tr)], y[tr])
    d = m.decision_function(K[np.ix_(te, tr)])
    return roc_auc_score(y[te], d), accuracy_score(y[te], (d > 0).astype(int))


def classical(X, tr, te, y, seed):
    from sklearn.linear_model import LogisticRegressionCV
    from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
    from sklearn.model_selection import GridSearchCV
    out = {}
    mods = {
        "logistic": LogisticRegressionCV(Cs=10, cv=3, max_iter=5000),
        "random_forest": GridSearchCV(RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1),
                                      {"min_samples_leaf": [1, 5], "max_features": ["sqrt", 0.5]}, cv=3, scoring="roc_auc"),
        "gradient_boosting": GridSearchCV(HistGradientBoostingClassifier(random_state=seed),
                                          {"learning_rate": [0.03, 0.1], "max_depth": [2, None]}, cv=3, scoring="roc_auc"),
    }
    for k, m in mods.items():
        m.fit(X[tr], y[tr])
        p = m.predict_proba(X[te])[:, 1]
        out[k] = (roc_auc_score(y[te], p), accuracy_score(y[te], (p > 0.5).astype(int)))
    return out


def corrected_ttest(d, n_train, n_test, k, r):
    d = np.asarray(d); n = k * r; var = d.var(ddof=1)
    if var == 0: return 0.0, 1.0
    t = d.mean() / np.sqrt((1 / n + n_test / n_train) * var)
    return float(t), float(2 * stats.t.sf(abs(t), n - 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", required=True, choices=["golub", "metabric_basal"])
    ap.add_argument("--repeats", type=int, default=None)
    ap.add_argument("--max-n", type=int, default=1200, help="patient cap for large cohorts (random subset)")
    a = ap.parse_args()
    cfg = load_config()
    coh, Z, y, label = load_task(a.task, a.max_n)
    reps = a.repeats or (10 if len(y) < 200 else 3)
    print(f"{coh['name']}: {len(y)} patients, task {label}, positives {y.sum()}")
    t0 = time.time()
    cands, _ = kernel_candidates(Z, coh["edges"], cfg)
    print(f"kernels built in {time.time() - t0:.0f}s")
    models = ["proj", "fid", "rbf", "logistic", "random_forest", "gradient_boosting"]
    auc = {m: [] for m in models}; acc = {m: [] for m in models}
    rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=reps, random_state=11)
    n_tr = n_te = 0
    for i, (tr, te) in enumerate(rskf.split(Z, y)):
        n_tr, n_te = len(tr), len(te)
        for k in ("proj", "fid", "rbf"):
            u, c = svm_auc(cands[k], tr, te, y, i); auc[k].append(u); acc[k].append(c)
        for k, (u, c) in classical(Z, tr, te, y, i).items():
            auc[k].append(u); acc[k].append(c)
        if (i + 1) % 5 == 0:
            print(f"  repeat {(i + 1) // 5}/{reps}: " + ", ".join(f"{m} {np.mean(auc[m][-5:]):.3f}" for m in models), flush=True)
    summ = {m: {"auc": float(np.mean(auc[m])), "auc_sd": float(np.std(auc[m], ddof=1)), "accuracy": float(np.mean(acc[m]))} for m in models}
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
    save_json({"task": a.task, "label": label, "cohort": coh["name"], "n": int(len(y)), "positives": int(y.sum()),
               "cv": {"folds": 5, "repeats": reps}, "summary": summ, "tests_vs_projected": tests,
               "per_fold_auc": auc}, OUT / f"results_classify_{a.task}.json")


if __name__ == "__main__":
    main()