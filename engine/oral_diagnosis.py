"""Oral tissue diagnosis cohorts (normal, dysplasia, cancer) -> out/oral_dx_*.json

Registered in docs/osf_oral_diagnosis.md. Each dataset is downloaded, mapped from probes to genes and scored on the
same 12 Hallmark pathways on its own; expression values are never pooled across datasets.

    python -m engine.oral_diagnosis --inspect                    # pre-registration checks: labels, counts, platform,
    python -m engine.oral_diagnosis --dataset gse23558 --inspect #   repeated individuals, submitter (no model output)
    python -m engine.oral_diagnosis                              # GSE30784 -> out/oral_dx_cohort.json
    python -m engine.oral_diagnosis --dataset gse23558           # GSE23558 -> out/oral_dx_external_cohort.json
    python -m engine.oral_diagnosis --accession GSE12345         # any GEO tissue dataset -> out/dx_GSE12345.json,
                                                                 #   loadable on the app's Detect page

Then the benchmark (engine.classify):
    python -m engine.classify --task oral_cancer_normal
    python -m engine.classify --task oral_dysplasia_normal
    python -m engine.classify --task oral_cancer_dysplasia
    python -m engine.classify --task oral_cancer_normal --external   # GSE30784 -> GSE23558, run once
"""
from __future__ import annotations
import argparse
import re
from collections import Counter
import pandas as pd
from .common import OUT, load_config, save_json
from .data import load_gse, expression_by_gene
from .pathways import hallmark_sets, ssgsea_scores
from .crosstalk import crosstalk_edges

DATASETS = {
    "gse30784": {"accession": "GSE30784", "out": "oral_dx_cohort.json", "expected": {"cancer": 167, "dysplasia": 17, "normal": 45},
                 "name": "GSE30784 oral tissue diagnosis", "role": "main"},
    "gse23558": {"accession": "GSE23558", "out": "oral_dx_external_cohort.json", "expected": None,
                 "name": "GSE23558 oral cancer (external check)", "role": "external"},
}
CLASS_PATTERNS = {
    "dysplasia": re.compile(r"dysplas", re.I),
    "cancer": re.compile(r"carcinoma|cancer|\boscc\b|\bscc\b|tumou?r|malignan", re.I),
    "normal": re.compile(r"\bnormal\b|\bcontrol\b|healthy", re.I),
}
LABEL_KEYS = ("disease", "diagnosis", "histolog", "tissue", "status", "sample type", "type", "group", "class")
GROUP_KEYS = ("patient", "individual", "subject", "donor", "case")


def sample_table(gse) -> pd.DataFrame:
    rows = {}
    for gsm_name, gsm in gse.gsms.items():
        md = gsm.metadata
        row = {"title": md.get("title", [""])[0], "source": md.get("source_name_ch1", [""])[0],
               "description": " ".join(md.get("description", []))}
        for entry in md.get("characteristics_ch1", []):
            if ":" in entry:
                k, v = entry.split(":", 1)
                row[k.strip().lower()] = v.strip()
        rows[gsm_name] = row
    return pd.DataFrame.from_dict(rows, orient="index")


def classes_in(text: str) -> set[str]:
    return {c for c, rx in CLASS_PATTERNS.items() if rx.search(text or "")}


def assign_labels(tab: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Class per sample. A dedicated label field wins; otherwise all text. Ambiguous or unmatched samples are dropped."""
    label_cols = [c for c in tab.columns if any(k in c for k in LABEL_KEYS)]
    labels, raw = {}, {}
    for sid, row in tab.iterrows():
        found, source_text = set(), ""
        for c in label_cols:
            hit = classes_in(str(row[c]))
            if len(hit) == 1:
                found, source_text = hit, f"{c}: {row[c]}"
                break
        if not found:
            text = " | ".join(str(v) for v in row.values if isinstance(v, str))
            found, source_text = classes_in(text), text[:120]
            if "dysplasia" in found and "cancer" in found and not re.search(r"carcinoma|oscc|\bscc\b|tumou?r", text, re.I):
                found = {"dysplasia"}  # e.g. "oral dysplasia, cancer-free follow-up"
        labels[sid] = next(iter(found)) if len(found) == 1 else None
        raw[sid] = source_text
    return pd.Series(labels), pd.Series(raw)


def group_ids(tab: pd.DataFrame) -> pd.Series | None:
    cols = [c for c in tab.columns if any(k in c for k in GROUP_KEYS)]
    for c in cols:
        g = tab[c].astype(str).str.strip()
        if g.nunique() < len(g) and g.nunique() > 1:
            return g
    return None


def geo_origin(gse) -> dict:
    md = gse.metadata
    first = lambda k: (md.get(k) or [""])[0]
    return {"accession": first("geo_accession"), "title": first("title"), "contact_institute": first("contact_institute"),
            "contact_city": first("contact_city"), "contact_country": first("contact_country"),
            "pubmed_id": first("pubmed_id"), "platform": list(gse.gpls.keys())}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", choices=list(DATASETS), default="gse30784")
    ap.add_argument("--accession", help="any other GEO series with normal / dysplasia / cancer samples (overrides --dataset)")
    ap.add_argument("--inspect", action="store_true", help="print labels, counts, platform and submitter, then stop")
    ap.add_argument("--allow-mismatch", action="store_true", help="continue if class counts differ from the registered ones")
    a = ap.parse_args()
    spec = DATASETS[a.dataset] if not a.accession else {
        "accession": a.accession.upper(), "out": f"dx_{a.accession.upper()}.json", "expected": None,
        "name": f"{a.accession.upper()} tissue diagnosis", "role": "user"}
    cfg = load_config()
    gse = load_gse(spec["accession"])
    origin = geo_origin(gse)
    tab = sample_table(gse)
    lab, raw = assign_labels(tab)
    groups = group_ids(tab)
    counts = Counter(v for v in lab.values if v)

    print(f"{spec['accession']}: {len(tab)} samples on {', '.join(origin['platform'])}")
    print(f"Submitter: {origin['contact_institute']}, {origin['contact_city']}, {origin['contact_country']}  (PubMed {origin['pubmed_id'] or 'n/a'})")
    print("Class counts:", dict(counts), "| unlabelled:", int(lab.isna().sum()))
    print("Label sources (one example per distinct text):")
    for txt, cls in sorted({(raw[s], lab[s]) for s in tab.index}, key=lambda x: str(x[1]))[:25]:
        print(f"  {str(cls):10s} <- {txt}")
    if lab.isna().any():
        print("Excluded (no single class):", ", ".join(lab.index[lab.isna()]))
    print("Repeated individuals:", f"yes, field with {groups.nunique()} individuals" if groups is not None else "none found")
    if a.inspect:
        return
    exp = spec["expected"]
    if exp and dict(counts) != exp and not a.allow_mismatch:
        raise SystemExit(f"Class counts {dict(counts)} differ from the registered {exp}. Record this in docs/osf_oral_diagnosis.md, then re-run with --allow-mismatch.")

    keep = lab.dropna().index
    expr = expression_by_gene(gse)
    expr = expr[[s for s in keep if s in expr.columns]]
    print(f"{expr.shape[1]} samples, {expr.shape[0]} genes after mapping")
    keys = [p[0] for p in cfg["pathways"]]
    sets = hallmark_sets(cfg)
    rawscores = ssgsea_scores(expr, sets, keys, standardize=False)
    z = (rawscores - rawscores.mean()) / rawscores.std(ddof=1)
    edges = crosstalk_edges(sets, keys, cfg["crosstalk_max_degree"], cfg["crosstalk_max_edges"])
    patients = []
    for sid in z.index:
        meta = {"histology": lab[sid].capitalize()}
        if groups is not None:
            meta["individual"] = groups[sid]
        patients.append({"id": sid, "pathways": [round(float(v), 4) for v in z.loc[sid, keys]],
                         "pathwaysRaw": [round(float(v), 5) for v in rawscores.loc[sid, keys]],
                         "diagnosis": lab[sid], "meta": meta})
    cohort = {
        "name": spec["name"], "disease": "Oral cavity: normal mucosa, dysplasia, squamous cell carcinoma", "source": "real",
        "task": "classification", "role": spec["role"], "classes": dict(counts), "geo": origin,
        "description": f"ssGSEA Hallmark scores from {spec['accession']}, z-scored within this dataset; raw scores kept for external transfer.",
        "pathways": [{"key": k, "label": l, "short": s, "group": g} for k, l, s, g in cfg["pathways"]], "edges": edges,
        "patients": patients,
    }
    save_json(cohort, OUT / spec["out"])


if __name__ == "__main__":
    main()
