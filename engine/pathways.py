"""ssGSEA pathway scoring with the MSigDB Hallmark collection."""
from __future__ import annotations
from pathlib import Path
import pandas as pd
from .common import ROOT


def hallmark_sets(cfg: dict) -> dict[str, list[str]]:
    gmt = ROOT / cfg["hallmark_gmt"]
    if gmt.exists():
        sets = {}
        for line in gmt.read_text(encoding="utf-8").splitlines():
            parts = line.strip().split("\t")
            if len(parts) > 2:
                sets[parts[0]] = parts[2:]
        return sets
    from gseapy import Msigdb
    print("Downloading Hallmark gene sets via gseapy...")
    sets = Msigdb().get_gmt(category="h.all", dbver=cfg.get("msigdb_version", "2023.1.Hs"))
    gmt.parent.mkdir(parents=True, exist_ok=True)
    gmt.write_text("\n".join(f"{k}\tNA\t" + "\t".join(v) for k, v in sets.items()), encoding="utf-8")
    return sets


def ssgsea_scores(expr: pd.DataFrame, sets: dict[str, list[str]], keys: list[str]) -> pd.DataFrame:
    """Sample x pathway matrix of ssGSEA normalised enrichment scores, z-scored across the cohort."""
    import gseapy
    missing = [k for k in keys if k not in sets]
    if missing:
        raise RuntimeError(f"Pathways not in the GMT: {missing}")
    res = gseapy.ssgsea(data=expr, gene_sets={k: sets[k] for k in keys}, sample_norm_method="rank",
                        outdir=None, min_size=10, max_size=1000, no_plot=True, threads=4, seed=123)
    wide = res.res2d.pivot(index="Name", columns="Term", values="NES").astype(float)[keys]
    return (wide - wide.mean()) / wide.std(ddof=1)
