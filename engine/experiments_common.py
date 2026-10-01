"""Shared helpers for the qubit-count and noise experiments."""
from __future__ import annotations
import numpy as np
from .common import OUT, load_cohort
from .fastsim import bloch_batch
from .featuremap import angle_of
from .model import sq_dists

SCALES = [0.25, 0.4, 0.55, 0.7, 1.0]
MULTS = [0.25, 0.5, 1, 2, 4]


def priority_order(pathways):
    """Label-free qubit order: one pathway per biological theme at a time (round-robin over groups, config order)."""
    groups = []
    for i, p in enumerate(pathways):
        g = p.get("group", "other")
        if g not in [x[0] for x in groups]:
            groups.append((g, []))
        next(x for x in groups if x[0] == g)[1].append(i)
    order, depth = [], 0
    while len(order) < len(pathways):
        for _, idx in groups:
            if depth < len(idx):
                order.append(idx[depth])
        depth += 1
    return order


def sub_edges(edges, keep):
    pos = {k: i for i, k in enumerate(keep)}
    return [[pos[a], pos[b]] for a, b in edges if a in pos and b in pos]


def gaussian_from_features(F, gamma=None):
    D = sq_dists(F)
    if gamma is None:
        iu = np.triu_indices(len(D), 1); gamma = 1 / (np.median(D[iu]) or 1.0)
    return np.exp(-gamma * D).astype(np.float32)


def proj_candidates(Z, edges, scales=SCALES, reps=2, beta=0.5):
    return [(s, gaussian_from_features(bloch_batch(Z, edges, reps, beta, s).reshape(len(Z), -1))) for s in scales]


def rbf_candidates(Z, mults=MULTS):
    A = angle_of(Z); D = sq_dists(A); med = np.median(D[np.triu_indices(len(D), 1)]) or 1.0
    return [(m, np.exp(-m * D / med).astype(np.float32)) for m in mults]


def load_task(task, cohort_path, max_n):
    """Returns (cohort, Z, kind, target) where kind is 'survival' (target=(t,e,H)) or 'diagnosis' (target=y)."""
    if task == "survival":
        coh = load_cohort(cohort_path); P = coh["patients"]
        if max_n and len(P) > max_n:
            rng = np.random.default_rng(5); P = [P[i] for i in sorted(rng.choice(len(P), max_n, replace=False))]
        Z = np.array([p["pathways"] for p in P], float)
        t = np.array([p["time"] for p in P], float); e = np.array([p["event"] for p in P], int)
        return coh, Z, "survival", (t, e, coh.get("horizon", 36))
    from .classify import load_task as lt
    coh, Z, y, _ = lt(task, max_n)
    return coh, Z, "diagnosis", y