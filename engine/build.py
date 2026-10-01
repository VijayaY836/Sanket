"""GEO series -> out/cohort.json for the SANKET app.

    python -m engine.build                 # real data (needs outcome fields set in config.yaml)
    python -m engine.build --demo-expr     # end-to-end test on random expression, no download
"""
from __future__ import annotations
import argparse
import numpy as np
import pandas as pd
from .common import load_config, save_json, OUT
from .pathways import hallmark_sets, ssgsea_scores
from .crosstalk import crosstalk_edges


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config")
    ap.add_argument("--out", default=str(OUT / "cohort.json"))
    ap.add_argument("--demo-expr", action="store_true", help="random expression matrix to test the pipeline offline")
    a = ap.parse_args()
    cfg = load_config(a.config)
    keys = [p[0] for p in cfg["pathways"]]
    sets = hallmark_sets(cfg)

    if a.demo_expr:
        rng = np.random.default_rng(0)
        genes = sorted({g for k in keys for g in sets[k]} | {f"G{i}" for i in range(3000)})
        samples = [f"S{i:03d}" for i in range(86)]
        expr = pd.DataFrame(rng.normal(8, 1, (len(genes), len(samples))), index=genes, columns=samples)
        out = pd.DataFrame({"time": rng.integers(6, 120, 86).astype(float), "event": rng.integers(0, 2, 86)}, index=samples)
        name, source = "Pipeline test (random expression)", "synthetic"
    else:
        from .data import load_gse, characteristics, expression_by_gene, outcomes
        gse = load_gse(cfg["geo_accession"])
        expr = expression_by_gene(gse)
        out = outcomes(characteristics(gse), cfg)
        common = [s for s in expr.columns if s in out.index]
        expr, out = expr[common], out.loc[common]
        name, source = cfg["cohort_name"], "real"
        print(f"{len(common)} samples with outcomes, {out['event'].sum()} events, {expr.shape[0]} genes")
        if len(common) != 86 or out["event"].sum() != 35:
            print("WARNING: expected 86 samples and 35 events for GSE26549. Check the outcome fields in config.yaml.")

    scores = ssgsea_scores(expr, sets, keys)
    edges = crosstalk_edges(sets, keys, cfg["crosstalk_max_degree"], cfg["crosstalk_max_edges"])
    patients = []
    for sid in scores.index:
        meta = {}
        for col in ("histology", "sex"):
            if col in out.columns and pd.notna(out.loc[sid, col]) and str(out.loc[sid, col]).upper() != "NA":
                meta[col] = str(out.loc[sid, col]).capitalize()
        if "age" in out.columns and pd.notna(out.loc[sid, "age"]):
            meta["age"] = int(out.loc[sid, "age"])
        patients.append({"id": sid, "pathways": [round(float(v), 4) for v in scores.loc[sid, keys]],
                         "time": round(float(out.loc[sid, "time"]), 2), "event": int(out.loc[sid, "event"]), "meta": meta})
    cohort = {
        "name": name, "disease": cfg["disease"], "source": source,
        "description": f"ssGSEA Hallmark scores from {cfg['geo_accession']}, z-scored across the cohort." if source == "real" else "Random expression, for pipeline testing only.",
        "timeUnit": "months", "horizon": cfg["horizon_months"],
        "pathways": [{"key": k, "label": l, "short": s, "group": g} for k, l, s, g in cfg["pathways"]],
        "edges": edges, "patients": patients,
    }
    save_json(cohort, a.out)
    print(f"{len(patients)} patients, {len(edges)} crosstalk edges: {edges}")


if __name__ == "__main__":
    main()