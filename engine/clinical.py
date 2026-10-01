"""Clinical usefulness of SANKET's predictions (out-of-fold, so every patient is scored as if new).

  * calibration: predicted vs observed risk at the horizon, by risk quintile; IPCW Brier score and Brier skill
  * decision-curve analysis: net benefit of referring by predicted risk vs "refer everyone" / "refer no one"
  * screening-first operating point: the threshold that catches >= 90% of patients who progress by the horizon,
    with specificity, referral rate and NPV
  * exploratory multimodal models: quantum kernel x clinical kernel, classical RBF on pathways + clinical,
    elastic-net Cox on pathways + clinical

    python -m engine.clinical --cohort out/cohort.json                       # oral (GSE26549)
    python -m engine.clinical --cohort out/metabric_cohort.json --repeats 1  # breast (METABRIC)
Writes out/results_clinical_<cohort>.json and out/figures/clinical_<cohort>.png
"""
from __future__ import annotations
import argparse
import warnings
from pathlib import Path
import numpy as np
from sklearn.model_selection import StratifiedKFold
from .common import OUT, load_config, load_cohort, save_json
from .model import kernel_candidates, beran, survival_at, c_index, sq_dists
from .featuremap import angle_of
from .scale import risks, pick_bandwidth

warnings.filterwarnings("ignore")
HIST = {"hyperplasia": 0, "mild": 1, "moderate": 2, "severe": 3}


# ---------- survival helpers ----------
def km(t, e):
    w = np.ones(len(t))
    return beran(w, t, e)


def surv_at(t, e, H):
    if len(t) == 0:
        return np.nan
    T, S = km(t, e)
    return survival_at(T, S, H)


def ipcw_brier(pred_surv, t, e, H):
    """Brier score at H with inverse-probability-of-censoring weights (Graf et al. 1999)."""
    Tg, Sg = km(t, 1 - e)  # censoring distribution
    G = lambda x: max(survival_at(Tg, Sg, x - 1e-9), 1e-6)
    s = 0.0
    for p, ti, ei in zip(pred_surv, t, e):
        if ti <= H and ei:
            s += (0 - p) ** 2 / G(ti)
        elif ti > H:
            s += (1 - p) ** 2 / G(H)
    return s / len(t)


def calibration(risk, t, e, H, groups=5):
    q = np.quantile(risk, np.linspace(0, 1, groups + 1))
    rows = []
    for g in range(groups):
        m = (risk >= q[g]) & ((risk <= q[g + 1]) if g == groups - 1 else (risk < q[g + 1]))
        if m.sum() < 3:
            continue
        rows.append({"predicted": float(risk[m].mean()), "observed": float(1 - surv_at(t[m], e[m], H)), "n": int(m.sum())})
    return rows


def decision_curve(risk, t, e, H, thresholds):
    """Survival decision-curve analysis (Vickers et al. 2008): net benefit of referring patients with risk >= pt."""
    n = len(t); p_all = 1 - surv_at(t, e, H)
    out = []
    for pt in thresholds:
        hi = risk >= pt
        if hi.sum() == 0:
            nb = 0.0
        else:
            ev = 1 - surv_at(t[hi], e[hi], H)
            tp, fp = ev * hi.sum() / n, (1 - ev) * hi.sum() / n
            nb = tp - fp * pt / (1 - pt)
        out.append({"threshold": float(pt), "model": float(nb), "refer_all": float(p_all - (1 - p_all) * pt / (1 - pt)), "refer_none": 0.0})
    return out


def screening_point(risk, t, e, H, target=0.9):
    """Highest threshold whose sensitivity for progression by H is >= target."""
    n = len(t); S_all = surv_at(t, e, H); ev_all = (1 - S_all) * n
    best = None
    for pt in np.unique(np.round(risk, 4))[::-1]:
        hi, lo = risk >= pt, risk < pt
        ev_hi = (1 - surv_at(t[hi], e[hi], H)) * hi.sum() if hi.any() else 0.0
        sens = ev_hi / ev_all if ev_all > 0 else np.nan
        if sens >= target:
            spec = (surv_at(t[lo], e[lo], H) * lo.sum()) / (S_all * n) if lo.any() else 0.0
            best = {"threshold": float(pt), "sensitivity": float(sens), "specificity": float(spec), "referral_rate": float(hi.mean()),
                    "npv": float(surv_at(t[lo], e[lo], H)) if lo.any() else float("nan"), "ppv": float(1 - surv_at(t[hi], e[hi], H))}
            break
    return best


# ---------- clinical covariates ----------
def clinical_matrix(P):
    rows, names = [], None
    for p in P:
        if "clinical" in p and p["clinical"]:
            d = {k: (np.nan if v is None else float(v)) for k, v in p["clinical"].items()}
        else:
            m = p.get("meta", {}); h = str(m.get("histology", "")).lower()
            d = {"age": float(m["age"]) if "age" in m else np.nan,
                 "sex_male": (1.0 if str(m.get("sex", "")).upper().startswith("M") else 0.0) if "sex" in m else np.nan,
                 "histology_grade": next((v for k, v in HIST.items() if k in h), np.nan)}
        names = names or list(d.keys()); rows.append([d.get(k, np.nan) for k in names])
    C = np.array(rows, float)
    keep = [j for j in range(C.shape[1]) if np.isfinite(C[:, j]).mean() > 0.5 and np.nanstd(C[:, j]) > 0]
    C = C[:, keep]; names = [names[j] for j in keep]
    if C.shape[1] == 0:
        return None, []
    med = np.nanmedian(C, axis=0); idx = np.where(~np.isfinite(C)); C[idx] = np.take(med, idx[1])
    return (C - C.mean(0)) / (C.std(0) + 1e-9), names


def rbf_list(X, mults):
    D = sq_dists(X); med = np.median(D[np.triu_indices(len(D), 1)]) or 1.0
    return [(m, np.exp(-m * D / med).astype(np.float32)) for m in mults]


# ---------- out-of-fold predictions ----------
def oof_predictions(Z, C, t, e, edges, H, cfg, repeats, seed=0):
    n = len(t); k = cfg["neighbours"]
    from sksurv.util import Surv
    from sksurv.linear_model import CoxnetSurvivalAnalysis
    from sklearn.model_selection import GridSearchCV, KFold
    y = Surv.from_arrays(event=e.astype(bool), time=t)
    cands, _ = kernel_candidates(Z, edges, cfg)
    cands = {kk: [(p, K.astype(np.float32)) for p, K in v] for kk, v in cands.items()}
    models = {"proj": cands["proj"], "rbf": cands["rbf"]}
    if C is not None:
        Kclin = rbf_list(C, [0.5, 1, 2])
        models["proj_clin"] = [((p, m), (Kp * Kc).astype(np.float32)) for p, Kp in cands["proj"][:3] for m, Kc in Kclin]
        models["rbf_clin"] = rbf_list(np.hstack([angle_of(Z), C]), [0.25, 0.5, 1, 2, 4])
    pred = {m: np.zeros((repeats, n)) for m in list(models) + ["coxnet"] + (["coxnet_clin"] if C is not None else [])}
    for r in range(repeats):
        skf = StratifiedKFold(5, shuffle=True, random_state=seed + r)
        for f, (tr, te) in enumerate(skf.split(Z, e)):
            for m, lst in models.items():
                b = pick_bandwidth(lst, tr, t, e, H, k, 3, r * 10 + f)
                pred[m][r, te] = risks(lst[b][1], te, tr, t, e, H, k)
            for m, X in (("coxnet", Z),) + ((("coxnet_clin", np.hstack([Z, C])),) if C is not None else ()):
                mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-9
                gs = GridSearchCV(CoxnetSurvivalAnalysis(l1_ratio=0.5, fit_baseline_model=True),
                                  {"alphas": [[a] for a in (0.003, 0.01, 0.03, 0.1, 0.3)]}, cv=KFold(3, shuffle=True, random_state=f), error_score=0.5)
                gs.fit((X[tr] - mu) / sd, y[tr])
                fns = gs.best_estimator_.predict_survival_function((X[te] - mu) / sd)
                pred[m][r, te] = [1 - (fn(min(H, fn.x[-1])) if H >= fn.x[0] else 1.0) for fn in fns]
        print(f"  repeat {r + 1}/{repeats} done", flush=True)
    return {m: v.mean(0) for m, v in pred.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=str(OUT / "cohort.json"))
    ap.add_argument("--repeats", type=int, default=5)
    ap.add_argument("--max-n", type=int, default=0, help="optional random subset for a quick run")
    a = ap.parse_args()
    cfg = load_config()
    coh = load_cohort(a.cohort); P = coh["patients"]
    if a.max_n and len(P) > a.max_n:
        rng = np.random.default_rng(1); P = [P[i] for i in sorted(rng.choice(len(P), a.max_n, replace=False))]
    Z = np.array([p["pathways"] for p in P], float)
    t = np.array([p["time"] for p in P], float); e = np.array([p["event"] for p in P], int)
    H = coh.get("horizon", 36)
    C, cnames = clinical_matrix(P)
    print(f"{coh['name']}: {len(t)} patients, {e.sum()} events, horizon {H} months, clinical: {cnames or 'none'}")
    pred = oof_predictions(Z, C, t, e, coh["edges"], H, cfg, a.repeats)

    thresholds = np.round(np.arange(0.02, 0.62, 0.02), 2)
    S_null = surv_at(t, e, H)
    brier_null = ipcw_brier(np.full(len(t), S_null), t, e, H)
    res = {}
    for m, risk in pred.items():
        b = ipcw_brier(1 - risk, t, e, H)
        res[m] = {"c_index": float(c_index(risk, t, e)), "brier": float(b), "brier_skill": float(1 - b / brier_null),
                  "calibration": calibration(risk, t, e, H), "decision_curve": decision_curve(risk, t, e, H, thresholds),
                  "screening_90": screening_point(risk, t, e, H, 0.9), "exploratory": m.endswith("_clin")}
    print(f"\nOut-of-fold results at {H} months (Brier of the no-information model {brier_null:.3f}):")
    print(f"  {'model':12s} {'C-index':>8s} {'Brier':>7s} {'skill':>7s}   screening point (>=90% sensitivity)")
    for m, r in res.items():
        s = r["screening_90"]
        sp = f"refer {s['referral_rate']:.0%}, specificity {s['specificity']:.0%}, NPV {s['npv']:.0%} (risk >= {s['threshold']:.2f})" if s else "n/a"
        print(f"  {m:12s} {r['c_index']:8.3f} {r['brier']:7.3f} {r['brier_skill']:+7.3f}   {sp}{'   [exploratory]' if r['exploratory'] else ''}")
    tag = Path(a.cohort).stem
    save_json({"cohort": coh["name"], "n": int(len(t)), "events": int(e.sum()), "horizon": H, "clinical_variables": cnames,
               "brier_null": float(brier_null), "repeats": a.repeats, "models": res}, OUT / f"results_clinical_{tag}.json")
    plot(res, H, tag)


def plot(res, H, tag):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    d = OUT / "figures"; d.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
    for m in ("proj", "rbf", "coxnet"):
        c = res[m]["calibration"]
        ax[0].plot([x["predicted"] for x in c], [x["observed"] for x in c], marker="o", label=m)
    lim = max(0.05, max(x["observed"] for m in ("proj", "rbf", "coxnet") for x in res[m]["calibration"]) * 1.1)
    ax[0].plot([0, lim], [0, lim], ls="--", c="grey"); ax[0].set_xlabel(f"Predicted {H}-month risk"); ax[0].set_ylabel("Observed (Kaplan–Meier)"); ax[0].set_title("Calibration"); ax[0].legend()
    dc = res["proj"]["decision_curve"]; th = [x["threshold"] for x in dc]
    for m in ("proj", "rbf", "coxnet"):
        ax[1].plot(th, [x["model"] for x in res[m]["decision_curve"]], label=m)
    ax[1].plot(th, [x["refer_all"] for x in dc], ls="--", c="grey", label="refer all"); ax[1].axhline(0, c="k", lw=0.8, label="refer none")
    ax[1].set_ylim(-0.05, max(0.05, max(x["refer_all"] for x in dc) * 1.3)); ax[1].set_xlabel("Risk threshold for referral"); ax[1].set_ylabel("Net benefit"); ax[1].set_title("Decision curve"); ax[1].legend(fontsize=8)
    fig.tight_layout(); fig.savefig(d / f"clinical_{tag}.png", dpi=200)
    print(f"wrote {d / f'clinical_{tag}.png'}")


if __name__ == "__main__":
    main()