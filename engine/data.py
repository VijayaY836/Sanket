"""Download a GEO series and turn it into (gene x sample expression, per-sample outcomes)."""
from __future__ import annotations
import re
import numpy as np
import pandas as pd
from .common import DATA


def load_gse(accession: str):
    """Load a GEO series from data/, downloading over HTTPS if needed (NCBI's FTP often truncates files)."""
    import gzip
    import urllib.request
    import GEOparse
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / f"{accession}_family.soft.gz"

    def intact(p):
        try:
            with gzip.open(p) as f:
                while f.read(1 << 20):
                    pass
            return True
        except Exception:
            return False

    if not path.exists() or not intact(path):
        stub = accession[:-3] + "nnn"
        url = f"https://ftp.ncbi.nlm.nih.gov/geo/series/{stub}/{accession}/soft/{accession}_family.soft.gz"
        print(f"Downloading {url}")
        urllib.request.urlretrieve(url, path)
        if not intact(path):
            path.unlink(missing_ok=True)
            raise RuntimeError("Download was incomplete. Try again, or fetch it with curl (see README).")
    return GEOparse.get_GEO(filepath=str(path), silent=True)


def characteristics(gse) -> pd.DataFrame:
    """One row per sample, one column per 'field: value' characteristic."""
    rows = {}
    for gsm_name, gsm in gse.gsms.items():
        row = {"title": gsm.metadata.get("title", [""])[0]}
        for entry in gsm.metadata.get("characteristics_ch1", []):
            if ":" in entry:
                k, v = entry.split(":", 1)
                row[k.strip().lower()] = v.strip()
        rows[gsm_name] = row
    return pd.DataFrame.from_dict(rows, orient="index")


_SYMBOL_COLS = ["gene symbol", "gene_symbol", "symbol", "gene_assignment", "genesymbol"]


def _symbol(value: str) -> str | None:
    if not isinstance(value, str) or not value or value == "---":
        return None
    if "//" in value:  # Affymetrix gene_assignment: "NM_001 // SYMBOL // description // ..."
        parts = [p.strip() for p in value.split("//")]
        return parts[1] if len(parts) > 1 and parts[1] else None
    return re.split(r"[ /;,]+", value.strip())[0] or None


def expression_by_gene(gse) -> pd.DataFrame:
    """Gene symbol x sample matrix (log2 scale as deposited; duplicated symbols averaged)."""
    expr = gse.pivot_samples("VALUE")
    gpl = list(gse.gpls.values())[0]
    table = gpl.table.copy()
    table.columns = [c.lower() for c in table.columns]
    col = next((c for c in _SYMBOL_COLS if c in table.columns), None)
    if col is None:
        raise RuntimeError(f"No gene-symbol column in platform table. Columns: {list(table.columns)[:15]}")
    mapping = table.set_index("id")[col].map(_symbol).dropna()
    expr = expr.loc[expr.index.intersection(mapping.index)]
    expr.index = mapping.loc[expr.index].values
    expr = expr.groupby(level=0).mean()
    if expr.max().max() > 50:  # looks un-logged
        expr = np.log2(expr.clip(lower=1))
    return expr.dropna(how="any")


def outcomes(chars: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    tf, ef = cfg["time_field"].lower(), cfg["event_field"].lower()
    missing = [f for f in (tf, ef) if f not in chars.columns]
    if missing:
        raise RuntimeError(f"Fields {missing} not found. Available: {list(chars.columns)}. Run `python -m engine.inspect_geo` and edit engine/config.yaml.")
    factor = {"months": 1.0, "years": 12.0, "days": 12 / 365.25}[cfg.get("time_unit", "months")]
    pos = {str(v).lower() for v in cfg["event_positive_values"]}
    df = pd.DataFrame({
        "time": pd.to_numeric(chars[tf], errors="coerce") * factor,
        "event": chars[ef].astype(str).str.lower().str.strip().isin(pos).astype(int),
    })
    hf = str(cfg.get("histology_field", "")).lower()
    if hf in chars.columns:
        df["histology"] = chars[hf]
    if "age" in chars.columns:
        df["age"] = pd.to_numeric(chars["age"], errors="coerce")
    if "sex" in chars.columns:
        df["sex"] = chars["sex"].astype(str).str[0].str.upper()
    return df.dropna(subset=["time"])