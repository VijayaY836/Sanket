"""List every sample characteristic in a GEO series so you can set the outcome fields in config.yaml.

    python -m engine.inspect_geo            # uses geo_accession from config.yaml
    python -m engine.inspect_geo GSE26549
"""
import sys
from .common import load_config
from .data import load_gse, characteristics

if __name__ == "__main__":
    acc = sys.argv[1] if len(sys.argv) > 1 else load_config()["geo_accession"]
    gse = load_gse(acc)
    ch = characteristics(gse)
    print(f"{acc}: {len(ch)} samples, platform {list(gse.gpls)}\n")
    for col in ch.columns:
        vals = ch[col].dropna().astype(str)
        uniq = vals.unique()
        preview = ", ".join(uniq[:6]) + (" ..." if len(uniq) > 6 else "")
        print(f"- {col!r}: {len(uniq)} distinct values, e.g. {preview}")
    print("\nCopy the survival-time and event field names into engine/config.yaml (time_field, event_field, event_positive_values).")
