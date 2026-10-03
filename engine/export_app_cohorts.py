"""Bundle the two prognosis cohorts the web app switches between: Oral cancer and Breast cancer.

    python -m engine.export_app_cohorts

Oral cancer:  out/cohort.json (GSE26549, all 86 patients, with the IBM hardware run) -> web/src/data/cohort_oral.json
Breast cancer: out/metabric_cohort.json (METABRIC, 1,975 patients) -> web/src/data/cohort_breast.json, a random sample of
               300 patients stratified by relapse, always including the patients run on IBM hardware. Building quantum
               kernels for all 1,975 patients takes over a minute in a browser; the full-cohort results come from the
               engine (engine.scale).
"""
from __future__ import annotations
import json
import numpy as np
from .common import OUT, ROOT

BREAST_N = 300
SEED = 2026


def main():
    data = ROOT / "web/src/data"
    oral = json.loads((OUT / "cohort.json").read_text(encoding="utf-8"))
    (data / "cohort_oral.json").write_text(json.dumps(oral, separators=(",", ":")), encoding="utf-8")
    print(f"wrote cohort_oral.json ({len(oral['patients'])} patients)")

    mb = json.loads((OUT / "metabric_cohort.json").read_text(encoding="utf-8"))
    P = mb["patients"]
    hw = set((mb.get("measuredBloch") or {}).keys())
    keep = [i for i, p in enumerate(P) if p["id"] in hw]
    rest = [i for i in range(len(P)) if P[i]["id"] not in hw]
    rng = np.random.default_rng(SEED)
    ev = np.array([P[i]["event"] for i in rest])
    need = BREAST_N - len(keep)
    n_ev = int(round(need * ev.mean()))
    pick = list(rng.choice([r for r, e in zip(rest, ev) if e], n_ev, replace=False)) + \
           list(rng.choice([r for r, e in zip(rest, ev) if not e], need - n_ev, replace=False))
    idx = sorted(keep + [int(i) for i in pick])
    sub = dict(mb)
    sub["patients"] = [P[i] for i in idx]
    sub["description"] = (f"A random {BREAST_N} of METABRIC's {len(P):,} patients (stratified by relapse, seed {SEED}), "
                          f"including the {len(keep)} run on IBM hardware, so the browser stays fast. "
                          "On all patients the engine finds a tie: quantum C-index 0.582, classical 0.582 (p = 0.98).")
    sub["sampleOf"] = len(P)
    (data / "cohort_breast.json").write_text(json.dumps(sub, separators=(",", ":")), encoding="utf-8")
    print(f"wrote cohort_breast.json ({len(idx)} of {len(P)} patients, {sum(P[i]['event'] for i in idx)} relapses, "
          f"{len(keep)} hardware patients)")


if __name__ == "__main__":
    main()