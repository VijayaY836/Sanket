"""Cohort-shift test: train on some METABRIC hospital cohorts, test on a cohort the models never saw.

METABRIC patients were recruited in several cohorts (column COHORT in the cBioPortal clinical file). Leaving one
cohort out at a time mimics deploying SANKET at a new hospital. Models: projected quantum kernel, classical RBF
kernel (bandwidth chosen by inner CV on the training cohorts only), elastic-net Cox on pathways, Cox on NPI.
Declare this analysis on OSF before running it (docs/osf_clinical_shift.md).

    python -m engine.shift
Writes out/results_shift_metabric.json
"""
from __future__ import annotations
import argparse
import warnings
import numpy as np
import pandas as pd
from .common import ROOT, OUT, load_config, load_cohort, save_json
from .model import kernel_candidates, c_index
from .scale import risks, pick_bandwidth, coxnet_score, cox_score

warnings.filterwarnings("ignore")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "metabric_cohort.json"))
    ap.add_argument("--min-size", type=int, default=100, help="skip held-out cohorts smaller than this")
    a = ap.parse_args()
    cfg = load_config()
    coh = load_cohort(a.cohort)
    pat = pd.read_csv(ROOT / "data/brca_metabric/data_clinical_patient.txt", sep="\t", comment="#", low_memory=False).set_index("PATIENT_ID")
    if "COHORT" not in pat.columns:
        raise SystemExit(f"No COHORT column in the clinical file. Columns: {list(pat.columns)}")
    P = [p for p in coh["patients"] if p["id"] in pat.index and pd.notna(pat.loc[p["id"], "COHORT"])]
    site = np.array([str(int(float(pat.loc[p["id"], "COHORT"]))) for p in P])
    Z = np.array([p["pathways"] for p in P], float)
    t = np.array([p["time"] for p in P], float); e = np.array([p["event"] for p in P], int)
    H, k = coh.get("horizon", 60), cfg["neighbours"]
    npi = np.array([[np.nan if p.get("clinical", {}).get("NPI") is None else p["clinical"]["NPI"]] for p in P], float)
    has_npi = np.isfinite(npi).mean() > 0.5
    from sksurv.util import Surv
    y = Surv.from_arrays(event=e.astype(bool), time=t)
    print(f"{len(t)} patients in cohorts {dict(zip(*np.unique(site, return_counts=True)))}")
    cands, _ = kernel_candidates(Z, coh["edges"], cfg)
    cands = {kk: [(p, K.astype(np.float32)) for p, K in v] for kk, v in cands.items()}
    rows = []
    for s in sorted(set(site)):
        te = np.where(site == s)[0]; tr = np.where(site != s)[0]
        if len(te) < a.min_size or e[te].sum() < 10:
            print(f"  cohort {s}: skipped ({len(te)} patients, {e[te].sum()} events)"); continue
        r = {"held_out_cohort": s, "n_test": int(len(te)), "events_test": int(e[te].sum())}
        for m in ("proj", "rbf"):
            b = pick_bandwidth(cands[m], tr, t, e, H, k, 3, int(s))
            r[m] = float(c_index(risks(cands[m][b][1], te, tr, t, e, H, k), t[te], e[te]))
        r["coxnet"] = float(coxnet_score(Z, tr, te, y, t, e, int(s))[0])
        if has_npi:
            r["clinical_npi"] = float(cox_score(npi, tr, te, y, t, e))
        rows.append(r)
        print(f"  held-out cohort {s} ({len(te)} patients): " + ", ".join(f"{m} {r[m]:.3f}" for m in ("proj", "rbf", "coxnet", "clinical_npi") if m in r), flush=True)
    models = [m for m in ("proj", "rbf", "coxnet", "clinical_npi") if rows and m in rows[0]]
    summary = {m: {"mean": float(np.mean([r[m] for r in rows])), "min": float(np.min([r[m] for r in rows]))} for m in models}
    d = np.array([r["proj"] - r["rbf"] for r in rows])
    print("\nMean C-index on unseen cohorts:")
    for m in models:
        print(f"  {m:14s} {summary[m]['mean']:.3f}  (worst cohort {summary[m]['min']:.3f})")
    print(f"  quantum minus classical kernel: mean {d.mean():+.3f}, range {d.min():+.3f} to {d.max():+.3f}, quantum ahead in {(d > 0).sum()} of {len(d)} cohorts")
    save_json({"cohort": coh["name"], "per_cohort": rows, "summary": summary,
               "proj_minus_rbf": {"mean": float(d.mean()), "min": float(d.min()), "max": float(d.max()), "quantum_ahead": int((d > 0).sum()), "cohorts": int(len(d))}},
              OUT / "results_shift_metabric.json")


if __name__ == "__main__":
    main()