from __future__ import annotations
import json
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "out"


def load_config(path: str | None = None) -> dict:
    p = Path(path) if path else ROOT / "engine" / "config.yaml"
    with open(p, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_cohort(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(obj, path: str | Path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    print(f"wrote {path}")
