"""Declared amendments to the oral diagnosis analysis (docs/osf_oral_diagnosis.md, Amendments A1-A3).

The registered code in engine/classify.py is left unchanged; these analyses reuse its helpers.

    python -m engine.oral_amendments --a1                  # corrected external check (within-dataset standardisation)
    python -m engine.oral_amendments --a2                  # screening threshold (>= 90% sensitivity), T1-T3
    python -m engine.oral_amendments --a3                  # class weighting for T3 (cancer vs dysplasia)
    python -m engine.oral_amendments --a1 --a2 --a3        # all three

Outputs: out/results_amend_a1_external.json, out/results_amend_a2_screening.json, out/results_amend_a3_balanced.json
"""
from __future__ import annotations
import argparse
import time
import warnings
import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.svm import SVC
from .common import OUT, load_config, load_cohort, save_json as _save_json
from .model import kernel_candidates
from .classify import ORAL_TASKS, C_GRID, load_task, task_groups, outer_splits, inner_splits, transfer_kernels

warnings.filterwarnings("ignore")


def _clean(o):
    """NaN is not valid JSON (e.g. NPV when a model predicts no negatives); write null instead."""
    if isinstance(o, float) and o != o:
        return None
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_clean(v) for v in o]
    return o


def save_json(obj, path):
    _save_json(_clean(obj), path)


TARGET_SENS = 0.90
MODELS = ["proj", "fid", "rbf", "logistic", "random_forest", "gradient_boosting"]


# ---------------------------------------------------------------- shared helpers

def metrics(y, d, t=0.0):
    yhat = (d >= t).astype(int) if t != 0.0 else (d > 0).astype(int)
    pos, neg = y == 1, y == 0
    tp, fn = int((yhat[pos] == 1).sum()), int((yhat[pos] == 0).sum())
    tn, fp = int((yhat[neg] == 0).sum()), int((yhat[neg] == 1).sum())
    f = lambda a, b: a / (a + b) if (a + b) else float("nan")
    return {"sensitivity": f(tp, fn), "specificity": f(tn, fp), "ppv": f(tp, fp), "npv": f(tn, fn)}


def screening_threshold(scores, y, target=TARGET_SENS):
    """Highest threshold that still flags at least `target` of the positives in `scores`."""
    p = np.sort(scores[y == 1])
    k = int(np.floor((1 - target) * len(p)))
    return float(p[min(k, len(p) - 1)])


def select_svm_w(cands, tr, y, seed, groups=None, cw=None):
    """Kernel and C by inner-CV AUC on training indices (as classify.select_svm, with optional class weights)."""
    best, best_s = None, -1
    splits = inner_splits(tr, y, seed, groups)
    for _, K in cands:
        for C in C_GRID:
            s = []
            for itr, ite in splits:
                m = SVC(kernel="precomputed", C=C, class_weight=cw).fit(K[np.ix_(tr[itr], tr[itr])], y[tr[itr]])
                s.append(roc_auc_score(y[tr[ite]], m.decision_function(K[np.ix_(tr[ite], tr[itr])])))
            if np.mean(s) > best_s:
                best_s, best = float(np.mean(s)), (K, C)
    return best


def svm_oof(K, C, tr, y, seed, cw=None):
    """Out-of-fold decision values on the training indices (inner 3-fold), for choosing a threshold."""
    oof = np.zeros(len(tr))
    for itr, ite in StratifiedKFold(3, shuffle=True, random_state=seed).split(tr, y[tr]):
        m = SVC(kernel="precomputed", C=C, class_weight=cw).fit(K[np.ix_(tr[itr], tr[itr])], y[tr[itr]])
        oof[ite] = m.decision_function(K[np.ix_(tr[ite], tr[itr])])
    return oof


def classical_models(seed, cw=None):
    from sklearn.linear_model import LogisticRegressionCV
    from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
    from sklearn.model_selection import GridSearchCV
    return {
        "logistic": LogisticRegressionCV(Cs=10, cv=3, max_iter=5000, class_weight=cw),
        "random_forest": GridSearchCV(RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=4, class_weight=cw),
                                      {"min_samples_leaf": [1, 5], "max_features": ["sqrt", 0.5]}, cv=3, scoring="roc_auc"),
        "gradient_boosting": GridSearchCV(HistGradientBoostingClassifier(random_state=seed, class_weight=cw),
                                          {"learning_rate": [0.03, 0.1], "max_depth": [2, None]}, cv=3, scoring="roc_auc"),
    }


def tuned_copy(model, cw=None):
    """Unfitted copy of the tuned model (hyperparameters as chosen on the training fold), for out-of-fold scores."""
    from sklearn.base import clone
    from sklearn.linear_model import LogisticRegression
    if hasattr(model, "best_estimator_"):
        return clone(model.best_estimator_)
    return LogisticRegression(C=float(model.C_[0]), max_iter=5000, class_weight=cw)


def classical_oof(model, X, tr, y, seed, cw=None):
    oof = np.zeros(len(tr))
    for itr, ite in StratifiedKFold(3, shuffle=True, random_state=seed).split(tr, y[tr]):
        oof[ite] = tuned_copy(model, cw).fit(X[tr[itr]], y[tr[itr]]).predict_proba(X[tr[ite]])[:, 1] - 0.5
    return oof


def summarise(per_fold):
    out = {}
    for m, rows in per_fold.items():
        keys = rows[0].keys()
        out[m] = {k: float(np.nanmean([r[k] for r in rows])) for k in keys}
        out[m].update({k + "_sd": float(np.nanstd([r[k] for r in rows], ddof=1)) for k in keys})
    return out


# ---------------------------------------------------------------- A2 and A3: cross-validated, registered folds

def run_cv(task, cfg, screening=False, cw=None):
    coh, Z, y, label = load_task(task, None)
    groups = task_groups(task)
    cands, _ = kernel_candidates(Z, coh["edges"], cfg)
    rows = {m: [] for m in MODELS}
    for i, (tr, te) in enumerate(outer_splits(Z, y, groups, 10)):
        for k in ("proj", "fid", "rbf"):
            K, C = select_svm_w(cands[k], tr, y, i, groups, cw)
            d = SVC(kernel="precomputed", C=C, class_weight=cw).fit(K[np.ix_(tr, tr)], y[tr]).decision_function(K[np.ix_(te, tr)])
            t = screening_threshold(svm_oof(K, C, tr, y, i, cw), y[tr]) if screening else 0.0
            rows[k].append({"auc": float(roc_auc_score(y[te], d)), **metrics(y[te], d, t)})
        for k, model in classical_models(i, cw).items():
            d = model.fit(Z[tr], y[tr]).predict_proba(Z[te])[:, 1] - 0.5
            t = screening_threshold(classical_oof(model, Z, tr, y, i, cw), y[tr]) if screening else 0.0
            rows[k].append({"auc": float(roc_auc_score(y[te], d)), **metrics(y[te], d, t)})
        if (i + 1) % 10 == 0:
            print(f"    {task}: fold {i + 1}/50", flush=True)
    return {"task": task, "label": label, "n": int(len(y)), "positives": int(y.sum()), "summary": summarise(rows)}


def print_table(res, title):
    print(f"\n{title}: {res['label']} ({res['positives']} vs {res['n'] - res['positives']})")
    print(f"  {'model':18s} {'AUC':>6s} {'sens':>6s} {'spec':>6s} {'PPV':>6s} {'NPV':>6s}")
    for m in MODELS:
        s = res["summary"][m]
        print(f"  {m:18s} {s['auc']:6.3f} {s['sensitivity']:6.3f} {s['specificity']:6.3f} {s['ppv']:6.3f} {s['npv']:6.3f}")


# ---------------------------------------------------------------- A1: corrected external check

def a1_external(cfg):
    train = load_cohort(OUT / "oral_dx_cohort.json"); ext = load_cohort(OUT / "oral_dx_external_cohort.json")
    T = [p for p in train["patients"] if p["diagnosis"] in ("cancer", "normal")]
    E = [p for p in ext["patients"] if p["diagnosis"] in ("cancer", "normal")]
    # within-dataset standardisation, label-free: z-score each pathway over the samples of that dataset used here
    def z(P):
        R = np.array([p["pathwaysRaw"] for p in P]); return (R - R.mean(0)) / R.std(0, ddof=1)
    Ztr, Zex = z(T), z(E)
    ytr = np.array([int(p["diagnosis"] == "cancer") for p in T]); yex = np.array([int(p["diagnosis"] == "cancer") for p in E])

    keys = [p["short"] for p in train["pathways"]]
    def direction(P):
        R = np.array([p["pathwaysRaw"] for p in P]); c = np.array([p["diagnosis"] == "cancer" for p in P])
        return R[c].mean(0) - R[~c].mean(0)
    dtr, dex = direction(T), direction(E)
    biology = [{"pathway": k, "diff_train": float(a), "diff_external": float(b), "same_direction": bool(np.sign(a) == np.sign(b))}
               for k, a, b in zip(keys, dtr, dex)]
    agree = sum(b["same_direction"] for b in biology)
    print(f"Biology check: cancer minus normal goes the same way in both datasets for {agree}/12 pathways")
    for b in biology:
        print(f"  {b['pathway']:14s} GSE30784 {b['diff_train']:+.3f}   GSE23558 {b['diff_external']:+.3f}   {'same' if b['same_direction'] else 'OPPOSITE'}")

    n_tr = len(T); Zall = np.vstack([Ztr, Zex]); yall = np.concatenate([ytr, yex])
    tr, te = np.arange(n_tr), np.arange(n_tr, len(Zall))
    cands = transfer_kernels(Zall, n_tr, train["edges"], cfg)
    scores = {}
    for k in ("proj", "fid", "rbf"):
        K, C = select_svm_w(cands[k], tr, yall, 0)
        scores[k] = SVC(kernel="precomputed", C=C).fit(K[np.ix_(tr, tr)], ytr).decision_function(K[np.ix_(te, tr)])
    for k, m in classical_models(0).items():
        scores[k] = m.fit(Ztr, ytr).predict_proba(Zex)[:, 1] - 0.5
    rng = np.random.default_rng(13); summ = {}
    pos, neg = np.where(yex == 1)[0], np.where(yex == 0)[0]
    print(f"\nA1 external check (corrected): train {n_tr} GSE30784, apply once to {len(E)} GSE23558 ({yex.sum()} cancer, {len(neg)} normal)")
    for k, d in scores.items():
        boots = [roc_auc_score(yex[idx], d[idx]) for idx in
                 (np.concatenate([rng.choice(pos, len(pos)), rng.choice(neg, len(neg))]) for _ in range(2000))]
        mt = metrics(yex, d)
        summ[k] = {"auc": float(roc_auc_score(yex, d)), "auc_ci": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))], **mt}
        print(f"  {k:18s} AUC {summ[k]['auc']:.3f} (95% CI {summ[k]['auc_ci'][0]:.2f}-{summ[k]['auc_ci'][1]:.2f})  sensitivity {mt['sensitivity']:.3f}  specificity {mt['specificity']:.3f}")
    save_json({"amendment": "A1", "task": "oral_cancer_normal_external_corrected",
               "label": "cancer vs normal, trained on GSE30784, applied once to GSE23558, each dataset standardised on its own",
               "cohort": ext["name"], "n": int(len(yex)), "positives": int(yex.sum()), "train_n": n_tr, "external": True,
               "geo": ext.get("geo"), "summary": summ, "biology": biology, "biology_agree": agree,
               "note": "Post-hoc correction (Amendment A1): the registered check compared dataset-relative NES across datasets. Descriptive: 5 external normals."},
              OUT / "results_amend_a1_external.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a1", action="store_true"); ap.add_argument("--a2", action="store_true"); ap.add_argument("--a3", action="store_true")
    ap.add_argument("--tasks", nargs="*", default=list(ORAL_TASKS), help="A2 only: subset of tasks")
    a = ap.parse_args()
    cfg = load_config()
    if a.a1:
        a1_external(cfg)
    if a.a2:
        path = OUT / "results_amend_a2_screening.json"
        out = load_cohort(path)["tasks"] if path.exists() else {}
        for task in a.tasks:
            t0 = time.time(); out[task] = run_cv(task, cfg, screening=True)
            print_table(out[task], f"A2 screening threshold (>= {TARGET_SENS:.0%} sensitivity on training folds)"); print(f"  ({time.time() - t0:.0f}s)")
            save_json({"amendment": "A2", "target_sensitivity": TARGET_SENS, "tasks": out}, path)
    if a.a3:
        res = run_cv("oral_cancer_dysplasia", cfg, cw="balanced")
        print_table(res, "A3 balanced class weights, default threshold")
        save_json({"amendment": "A3", **res}, OUT / "results_amend_a3_balanced.json")


if __name__ == "__main__":
    main()