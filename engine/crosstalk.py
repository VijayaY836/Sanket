"""Pathway crosstalk graph from shared genes (Jaccard overlap). Edges become RZZ couplings."""
from __future__ import annotations
import itertools


def crosstalk_edges(sets: dict[str, list[str]], keys: list[str], max_degree=3, max_edges=14):
    gs = [set(sets[k]) for k in keys]
    pairs = []
    for i, j in itertools.combinations(range(len(keys)), 2):
        inter = len(gs[i] & gs[j])
        if inter:
            pairs.append((inter / len(gs[i] | gs[j]), i, j))
    pairs.sort(reverse=True)
    deg = [0] * len(keys)
    edges = []
    for jac, i, j in pairs:
        if len(edges) >= max_edges:
            break
        if deg[i] < max_degree and deg[j] < max_degree:
            edges.append([i, j]); deg[i] += 1; deg[j] += 1
    return edges
