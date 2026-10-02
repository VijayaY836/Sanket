"""Bundle the oral diagnosis cohort and its registered results for the app's Detect page.

Reads out/oral_dx_cohort.json, out/oral_dx_external_cohort.json and out/results_classify_oral_*.json (built by
engine.oral_diagnosis and engine.classify) and writes a compact web/src/data/oral_detect.json.

Also writes web/src/data/hallmark12.json: the member genes of the 12 Hallmark pathways in config.yaml, which the app
uses to score uploaded gene-activity files in the browser exactly as engine.pathways does.

    python -m engine.export_detect              # both files
    python -m engine.export_detect --sets-only  # just the gene sets
"""
from __future__ import annotations
import argparse
import json
from .common import OUT, ROOT, load_config
from .pathways import hallmark_sets

TASKS = {"oral_cancer_normal": "cancer vs normal", "oral_dysplasia_normal": "dysplasia vs normal",
         "oral_cancer_dysplasia": "cancer vs dysplasia"}
SHORT = {"normal": "n", "dysplasia": "d", "cancer": "c"}


def load(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def export_sets():
    cfg = load_config()
    keys = [p[0] for p in cfg["pathways"]]
    sets = hallmark_sets(cfg)
    missing = [k for k in keys if k not in sets]
    if missing:
        raise SystemExit(f"Pathways not in {cfg['hallmark_gmt']}: {missing}")
    out = {"source": f"MSigDB Hallmark gene sets v{cfg.get('msigdb_version', '2023.1.Hs')} (Liberzon et al., Cell Systems 2015), "
                     "Broad Institute, CC BY 4.0",
           "keys": keys, "sets": {k: sets[k] for k in keys}}
    path = ROOT / "web/src/data/hallmark12.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path} ({sum(len(v) for v in out['sets'].values())} genes in {len(keys)} pathways)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets-only", action="store_true")
    a = ap.parse_args()
    export_sets()
    if a.sets_only:
        return
    coh = load("oral_dx_cohort.json")
    keep = ("auc", "auc_sd", "sensitivity", "specificity", "accuracy")
    tasks = {}
    for key, label in TASKS.items():
        r = load(f"results_classify_{key}.json")
        prim = next(t for t in r["tests_vs_projected"] if t["primary"])
        tasks[key] = {"label": label, "n": r["n"], "positives": r["positives"], "repeats": r["cv"]["repeats"],
                      "models": {m: {k: round(v[k], 4) for k in keep if k in v} for m, v in r["summary"].items()},
                      "primaryP": round(prim["p"], 4)}
    ext = load("results_classify_oral_cancer_normal_external.json")
    geo = ext.get("geo") or {}
    out = {
        "source": {"accession": coh["geo"]["accession"], "institute": coh["geo"]["contact_institute"],
                   "country": coh["geo"]["contact_country"], "platform": coh["geo"]["platform"], "pubmed": coh["geo"]["pubmed_id"]},
        "pathways": coh["pathways"], "edges": coh["edges"],
        "samples": [{"id": p["id"], "d": SHORT[p["diagnosis"]], "z": [round(v, 3) for v in p["pathways"]]} for p in coh["patients"]],
        "tasks": tasks,
        "external": {"accession": geo.get("accession"), "institute": geo.get("contact_institute"), "city": geo.get("contact_city"),
                     "country": geo.get("contact_country"), "platform": geo.get("platform"), "n": ext["n"], "positives": ext["positives"],
                     "models": {m: {k: (round(v[k], 4) if isinstance(v[k], float) else v[k]) for k in ("auc", "sensitivity", "specificity", "auc_ci") if k in v}
                                for m, v in ext["summary"].items()}},
    }
    path = ROOT / "web/src/data/oral_detect.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size // 1024} KB, {len(out['samples'])} samples)")


if __name__ == "__main__":
    main()
