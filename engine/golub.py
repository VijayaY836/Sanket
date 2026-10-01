"""Golub et al. (Science 1999) leukaemia data, AML vs ALL, 72 patients -> out/golub_cohort.json

Downloads the three CSV files (the widely used copy of the original Broad Institute data) and the Affymetrix Hu6800
platform annotation (GEO GPL80) for probe -> gene symbol mapping, then scores the same 12 Hallmark pathways.

    python -m engine.golub
"""
from __future__ import annotations
import argparse
import gzip
import urllib.request
import numpy as np
import pandas as pd
from .common import DATA, OUT, load_config, save_json
from .pathways import hallmark_sets, ssgsea_scores
from .crosstalk import crosstalk_edges

MIRROR = "https://raw.githubusercontent.com/alonsojg/Visualizing_Gene_Expression/master/data/"
FILES = ["data_set_ALL_AML_train.csv", "data_set_ALL_AML_independent.csv", "actual.csv"]
GPL80 = "https://ftp.ncbi.nlm.nih.gov/geo/platforms/GPLnnn/GPL80/soft/GPL80_family.soft.gz"


def fetch(url, path):
    if path.exists() and path.stat().st_size > 0:
        return path
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, path)
    return path


def read_golub(folder):
    frames = []
    for f in FILES[:2]:
        df = pd.read_csv(folder / f)
        keep = [c for c in df.columns if not str(c).startswith("call")]
        df = df[keep].set_index("Gene Accession Number").drop(columns=["Gene Description"])
        frames.append(df)
    expr = pd.concat(frames, axis=1)
    expr.columns = [int(c) for c in expr.columns]
    lab = pd.read_csv(folder / FILES[2]).set_index("patient")["cancer"]
    expr = expr[sorted(expr.columns)]
    return expr.astype(float), lab.loc[expr.columns]


def probe_symbols(folder):
    """Hu6800 probe ID -> gene symbol from the GEO GPL80 annotation."""
    path = fetch(GPL80, folder / "GPL80_family.soft.gz")
    rows, in_table, header = [], False, None
    with gzip.open(path, "rt", encoding="latin-1") as f:
        for line in f:
            if line.startswith("!platform_table_begin"):
                in_table = True; continue
            if line.startswith("!platform_table_end"):
                break
            if in_table:
                parts = line.rstrip("\n").split("\t")
                if header is None:
                    header = [h.strip().lower() for h in parts]; continue
                rows.append(parts)
    table = pd.DataFrame(rows, columns=header[: len(rows[0])] if rows else header)
    col = next((c for c in ("gene symbol", "gene_symbol", "symbol") if c in table.columns), None)
    if col is None:
        raise RuntimeError(f"No gene symbol column in GPL80. Columns: {list(table.columns)}")
    m = table.set_index("id")[col].astype(str).str.split("///").str[0].str.strip()
    return m[(m != "") & (m != "nan") & (m != "---")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config")
    ap.add_argument("--mapping", help="optional CSV with columns probe,symbol (skips the GPL80 download)")
    a = ap.parse_args()
    cfg = load_config(a.config)
    folder = DATA / "golub"; folder.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        fetch(MIRROR + f, folder / f)
    expr, lab = read_golub(folder)
    print(f"{expr.shape[1]} patients ({(lab == 'ALL').sum()} ALL, {(lab == 'AML').sum()} AML), {expr.shape[0]} probes")
    # standard preprocessing for this dataset (Dudoit et al. 2002): floor 100, ceiling 16,000, log2
    expr = np.log2(expr.clip(lower=100, upper=16000))
    sym = pd.read_csv(a.mapping).set_index("probe")["symbol"] if a.mapping else probe_symbols(folder)
    expr = expr.loc[expr.index.intersection(sym.index)]
    expr.index = sym.loc[expr.index].values
    expr = expr.groupby(level=0).mean()
    expr = expr.loc[expr.std(axis=1) > 0]
    expr.columns = [f"G{c:02d}" for c in expr.columns]
    print(f"{expr.shape[0]} genes after mapping to symbols")

    keys = [p[0] for p in cfg["pathways"]]
    sets = hallmark_sets(cfg)
    scores = ssgsea_scores(expr, sets, keys)
    edges = crosstalk_edges(sets, keys, cfg["crosstalk_max_degree"], cfg["crosstalk_max_edges"])
    labels = {f"G{c:02d}": v for c, v in lab.items()}
    cohort = {
        "name": "Golub leukaemia (AML vs ALL)", "disease": "Acute leukaemia", "source": "real", "task": "classification",
        "labelName": "AML (1) vs ALL (0)", "description": "Golub et al., Science 1999; 72 bone marrow/blood samples; ssGSEA Hallmark scores.",
        "pathways": [{"key": k, "label": l, "short": s, "group": g} for k, l, s, g in cfg["pathways"]], "edges": edges,
        "patients": [{"id": pid, "pathways": [round(float(v), 4) for v in scores.loc[pid, keys]], "label": int(labels[pid] == "AML"),
                      "meta": {"histology": labels[pid]}} for pid in scores.index],
    }
    save_json(cohort, OUT / "golub_cohort.json")


if __name__ == "__main__":
    main()