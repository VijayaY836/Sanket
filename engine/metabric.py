"""METABRIC (cBioPortal brca_metabric) -> out/metabric_cohort.json (full) and out/metabric_app.json (display sample).

Download the study from cBioPortal (Datasets page, "Breast Cancer (METABRIC, Nature 2012 & Nat Commun 2016)"),
unpack it to data/brca_metabric/, then:

    python -m engine.metabric                 # build
    python -m engine.metabric --inspect       # list clinical columns only
"""
from __future__ import annotations
import argparse
import numpy as np
import pandas as pd
from .common import ROOT, OUT, load_config, save_json
from .pathways import hallmark_sets, ssgsea_scores
from .crosstalk import crosstalk_edges

CFG = ROOT / "engine" / "config_metabric.yaml"


def read_clinical(folder):
    pat = pd.read_csv(folder / "data_clinical_patient.txt", sep="\t", comment="#", low_memory=False).set_index("PATIENT_ID")
    smp = pd.read_csv(folder / "data_clinical_sample.txt", sep="\t", comment="#", low_memory=False)
    smp = smp.drop_duplicates("PATIENT_ID").set_index("PATIENT_ID")
    extra = [c for c in smp.columns if c not in pat.columns and c != "SAMPLE_ID"]
    return pat.join(smp[extra + ["SAMPLE_ID"]], how="left")


def read_expression(folder, fname):
    path = folder / fname
    if not path.exists():
        cands = [p for p in folder.glob("data_mrna*microarray*.txt") if "zscores" not in p.name] + list(folder.glob("data_expression*.txt"))
        if not cands:
            raise FileNotFoundError(f"No expression file in {folder}. Expected {fname}.")
        path = cands[0]
    print(f"Reading {path.name} (large file, about a minute)...")
    df = pd.read_csv(path, sep="\t", low_memory=False)
    df = df.drop(columns=[c for c in ("Entrez_Gene_Id",) if c in df.columns])
    df = df.dropna(subset=["Hugo_Symbol"]).set_index("Hugo_Symbol")
    df = df.apply(pd.to_numeric, errors="coerce").astype("float32")
    df = df.groupby(level=0).mean()
    df = df.loc[:, df.notna().mean() > 0.9]       # drop samples with mostly missing values
    df = df.loc[df.notna().all(axis=1)]           # genes measured in every remaining sample
    return df


def outcomes(clin, endpoint="RFS"):
    tcol, scol = f"{endpoint}_MONTHS", f"{endpoint}_STATUS"
    if tcol not in clin.columns or scol not in clin.columns:
        raise RuntimeError(f"{tcol}/{scol} not in clinical file. Columns: {list(clin.columns)}")
    out = pd.DataFrame({"time": pd.to_numeric(clin[tcol], errors="coerce"),
                        "event": clin[scol].astype(str).str.strip().str.startswith("1").astype(int)}, index=clin.index)
    out = out[clin[scol].notna()].dropna()
    return out[out["time"] > 0]


def clinical_features(clin, cfg):
    feats = {}
    for c in cfg["clinical_numeric"]:
        if c in clin.columns:
            feats[c] = pd.to_numeric(clin[c], errors="coerce")
    for c, pos in cfg["clinical_binary"].items():
        if c in clin.columns:
            feats[c] = (clin[c].astype(str).str.strip() == pos).astype(float).where(clin[c].notna())
    return pd.DataFrame(feats, index=clin.index)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--config", default=str(CFG))
    a = ap.parse_args()
    cfg = load_config(a.config)
    folder = ROOT / cfg["data_dir"]
    clin = read_clinical(folder)
    if a.inspect:
        for c in clin.columns:
            v = clin[c].dropna().astype(str)
            print(f"- {c}: {v.nunique()} values, e.g. {', '.join(v.unique()[:5])}")
        return
    out = outcomes(clin, cfg["endpoint"])
    clinf = clinical_features(clin, cfg)
    expr = read_expression(folder, cfg["expression_file"])
    # expression columns are sample IDs; METABRIC sample and patient IDs coincide, map defensively
    s2p = {s: p for p, s in clin["SAMPLE_ID"].dropna().items()} if "SAMPLE_ID" in clin.columns else {}
    expr.columns = [s2p.get(c, c) for c in expr.columns]
    common = [p for p in expr.columns if p in out.index]
    expr, out, clinf = expr[common], out.loc[common], clinf.reindex(common)
    print(f"{len(common)} patients with expression and {cfg['endpoint']}, {int(out['event'].sum())} relapses, {expr.shape[0]} genes")

    keys = [p[0] for p in cfg["pathways"]]
    sets = hallmark_sets(cfg)
    print("Scoring pathways with ssGSEA (several minutes for ~2,000 patients)...")
    scores = ssgsea_scores(expr, sets, keys)
    edges = crosstalk_edges(sets, keys, cfg["crosstalk_max_degree"], cfg["crosstalk_max_edges"])

    def patient(pid):
        meta = {}
        if "AGE_AT_DIAGNOSIS" in clin.columns and pd.notna(clin.loc[pid, "AGE_AT_DIAGNOSIS"]):
            meta["age"] = int(float(clin.loc[pid, "AGE_AT_DIAGNOSIS"]))
        desc = []
        if "GRADE" in clin.columns and pd.notna(clin.loc[pid, "GRADE"]):
            desc.append(f"Grade {int(float(clin.loc[pid, 'GRADE']))}")
        if "ER_STATUS" in clin.columns and pd.notna(clin.loc[pid, "ER_STATUS"]):
            desc.append("ER+" if str(clin.loc[pid, "ER_STATUS"]).strip() == "Positive" else "ER−")
        if desc:
            meta["histology"] = ", ".join(desc)
        return {"id": pid, "pathways": [round(float(v), 4) for v in scores.loc[pid, keys]],
                "time": round(float(out.loc[pid, "time"]), 2), "event": int(out.loc[pid, "event"]), "meta": meta,
                "clinical": {k: (None if pd.isna(v) else round(float(v), 4)) for k, v in clinf.loc[pid].items()}}

    base = {"name": cfg["cohort_name"], "disease": cfg["disease"], "source": "real", "timeUnit": "months",
            "horizon": cfg["horizon_months"], "pathways": [{"key": k, "label": l, "short": s, "group": g} for k, l, s, g in cfg["pathways"]],
            "edges": edges}
    full = dict(base, description=f"ssGSEA Hallmark scores, {cfg['endpoint']} outcome, all {len(common)} patients.",
                patients=[patient(p) for p in scores.index])
    save_json(full, OUT / "metabric_cohort.json")
    rng = np.random.default_rng(cfg["sample_seed"])
    pick = sorted(rng.choice(len(full["patients"]), size=min(cfg["app_sample"], len(full["patients"])), replace=False))
    app = dict(base, name=cfg["cohort_name"] + f" (random display sample of {len(pick)})",
               description=f"Random sample of {len(pick)} of {len(common)} patients for the web app. Full-cohort results come from engine.scale.",
               patients=[full["patients"][i] for i in pick])
    save_json(app, OUT / "metabric_app.json")
    print(f"Crosstalk edges: {edges}")


if __name__ == "__main__":
    main()