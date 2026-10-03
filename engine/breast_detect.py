"""Breast tissue detection (cancer vs normal), registered in docs/osf_breast_diagnosis.md.

Run in this order:
    python -m engine.oral_diagnosis --dataset gse42568 --inspect   # check labels and counts first (no model output)
    python -m engine.oral_diagnosis --dataset gse10810 --inspect
    python -m engine.oral_diagnosis --dataset gse42568             # -> out/breast_dx_cohort.json
    python -m engine.oral_diagnosis --dataset gse10810             # -> out/breast_dx_external_cohort.json
    python -m engine.classify --task breast_cancer_normal          # registered benchmark (H1)
    python -m engine.breast_detect --screening                     # screening cut-off (H2)
    python -m engine.breast_detect --external                      # independent check on GSE10810, run once (H3)

Outputs: out/results_classify_breast_cancer_normal.json, out/results_breast_screening.json, out/results_breast_external.json
"""
from __future__ import annotations
import argparse
import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.svm import SVC
from .common import OUT, load_config, load_cohort
from .classify import transfer_kernels
from .oral_amendments import run_cv, print_table, select_svm_w, classical_models, metrics, save_json, TARGET_SENS


def external(cfg):
    """Train on all GSE42568 samples, apply once to GSE10810. Each dataset standardised on its own (label-free)."""
    train = load_cohort(OUT / "breast_dx_cohort.json"); ext = load_cohort(OUT / "breast_dx_external_cohort.json")
    T = [p for p in train["patients"] if p["diagnosis"] in ("cancer", "normal")]
    E = [p for p in ext["patients"] if p["diagnosis"] in ("cancer", "normal")]

    def z(P):
        R = np.array([p["pathwaysRaw"] for p in P]); return (R - R.mean(0)) / R.std(0, ddof=1)
    Ztr, Zex = z(T), z(E)
    ytr = np.array([int(p["diagnosis"] == "cancer") for p in T]); yex = np.array([int(p["diagnosis"] == "cancer") for p in E])

    keys = [p["short"] for p in train["pathways"]]
    def direction(P):
        R = np.array([p["pathwaysRaw"] for p in P]); c = np.array([p["diagnosis"] == "cancer" for p in P])
        return R[c].mean(0) - R[~c].mean(0)
    biology = [{"pathway": k, "diff_train": float(a), "diff_external": float(b), "same_direction": bool(np.sign(a) == np.sign(b))}
               for k, a, b in zip(keys, direction(T), direction(E))]
    agree = sum(b["same_direction"] for b in biology)
    print(f"Biology check: cancer minus normal goes the same way in both datasets for {agree}/12 pathways")
    for b in biology:
        print(f"  {b['pathway']:14s} GSE42568 {b['diff_train']:+.3f}   GSE10810 {b['diff_external']:+.3f}   {'same' if b['same_direction'] else 'OPPOSITE'}")

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
    print(f"\nExternal check: train {n_tr} GSE42568, apply once to {len(E)} GSE10810 ({yex.sum()} cancer, {len(neg)} normal)")
    for k, d in scores.items():
        boots = [roc_auc_score(yex[idx], d[idx]) for idx in
                 (np.concatenate([rng.choice(pos, len(pos)), rng.choice(neg, len(neg))]) for _ in range(2000))]
        mt = metrics(yex, d)
        summ[k] = {"auc": float(roc_auc_score(yex, d)), "auc_ci": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))], **mt}
        print(f"  {k:18s} AUC {summ[k]['auc']:.3f} (95% CI {summ[k]['auc_ci'][0]:.2f}-{summ[k]['auc_ci'][1]:.2f})  "
              f"sensitivity {mt['sensitivity']:.3f}  specificity {mt['specificity']:.3f}")
    save_json({"task": "breast_cancer_normal_external", "registered": "docs/osf_breast_diagnosis.md H3",
               "label": "breast cancer vs normal, trained on GSE42568, applied once to GSE10810, each dataset standardised on its own",
               "cohort": ext["name"], "n": int(len(yex)), "positives": int(yex.sum()), "train_n": n_tr, "external": True,
               "geo": ext.get("geo"), "summary": summ, "biology": biology, "biology_agree": agree},
              OUT / "results_breast_external.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screening", action="store_true"); ap.add_argument("--external", action="store_true")
    a = ap.parse_args()
    cfg = load_config()
    if a.screening:
        res = run_cv("breast_cancer_normal", cfg, screening=True)
        print_table(res, f"Screening cut-off (>= {TARGET_SENS:.0%} sensitivity on training folds)")
        save_json({"registered": "docs/osf_breast_diagnosis.md H2", "target_sensitivity": TARGET_SENS, **res}, OUT / "results_breast_screening.json")
    if a.external:
        external(cfg)
    if not (a.screening or a.external):
        ap.print_help()


if __name__ == "__main__":
    main()