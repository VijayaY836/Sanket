"""Kernels and kernel survival model. Mirrors web/src/lib/analysis.ts so the app and the paper agree."""
from __future__ import annotations
import numpy as np
from .featuremap import angle_of, states_and_bloch


def sq_dists(X: np.ndarray) -> np.ndarray:
    """All pairwise squared Euclidean distances. Exact broadcasting for small n, Gram trick for large n."""
    X = X.reshape(len(X), -1).astype(float)
    if len(X) <= 500:
        return ((X[:, None, :] - X[None, :, :]) ** 2).sum(-1)
    sq = (X ** 2).sum(1)
    return np.clip(sq[:, None] + sq[None, :] - 2 * X @ X.T, 0, None)


def median_sq(X: np.ndarray):
    D = sq_dists(X)
    iu = np.triu_indices(len(D), 1)
    d = np.sort(D[iu])
    return float(d[len(d) // 2]) or 1.0, D


def kernel_candidates(Z: np.ndarray, edges, cfg):
    """All candidate kernels: projected and fidelity quantum kernels per bandwidth, RBF per multiplier."""
    cands = {"proj": [], "fid": [], "rbf": []}
    extras = {}
    for scale in cfg["scale_grid"]:
        states, B = states_and_bloch(Z, edges, cfg["reps"], cfg["beta"], scale)
        med, D = median_sq(B)
        cands["proj"].append((scale, np.exp(-D / med)))
        S = np.stack([np.asarray(s.data) for s in states])
        cands["fid"].append((scale, np.abs(S.conj() @ S.T) ** 2))
        extras[scale] = {"bloch": B, "gamma": 1 / med}
    A = angle_of(Z)
    med, D = median_sq(A)
    for mult in cfg["rbf_grid"]:
        cands["rbf"].append((mult, np.exp(-mult * D / med)))
    return cands, extras


def beran(w, t, e):
    idx = np.where(w > 0)[0]
    idx = idx[np.argsort(t[idx], kind="stable")]
    at_risk = w[idx].sum()
    T, S, s, k = [0.0], [1.0], 1.0, 0
    while k < len(idx):
        tt = t[idx[k]]; dW = 0.0; leave = 0.0
        while k < len(idx) and t[idx[k]] == tt:
            i = idx[k]
            if e[i]:
                dW += w[i]
            leave += w[i]; k += 1
        if dW > 0 and at_risk > 0:
            s *= 1 - dW / at_risk; T.append(tt); S.append(s)
        at_risk -= leave
    return np.array(T), np.array(S)


def survival_at(T, S, time):
    v = 1.0
    for tt, ss in zip(T, S):
        if tt <= time:
            v = ss
        else:
            break
    return v


def top_k(row, k):
    out = np.zeros_like(row)
    order = np.argsort(-row, kind="stable")[:k]
    out[order] = row[order]
    return out


def risk_from_row(row, t, e, horizon, exclude, k=15, allowed=None):
    w = row.astype(float).copy()
    if allowed is not None:
        mask = np.zeros(len(w), bool); mask[allowed] = True; w[~mask] = 0
    w[list(exclude)] = 0
    T, S = beran(top_k(w, k), t, e)
    return 1 - survival_at(T, S, horizon)


def c_index(risk, t, e):
    num = den = 0.0
    for i in range(len(risk)):
        if not e[i]:
            continue
        later = t > t[i]
        den += later.sum()
        num += (risk[i] > risk[later]).sum() + 0.5 * (risk[i] == risk[later]).sum()
    return num / den if den else 0.5


def bootstrap_ci(risk, t, e, B=1000, seed=13):
    rng = np.random.default_rng(seed)
    n = len(risk)
    vals = [c_index(risk[ix], t[ix], e[ix]) for ix in (rng.integers(0, n, n) for _ in range(B))]
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def loo_risks(K, t, e, horizon, k=15):
    return np.array([risk_from_row(K[i], t, e, horizon, [i], k) for i in range(len(t))])


def nested_loo(cands, t, e, horizon, k=15):
    """For each held-out patient choose the bandwidth on the remaining patients only."""
    n = len(t)
    out = {}
    for kind, lst in cands.items():
        risks, picks = np.zeros(n), []
        for i in range(n):
            best, best_c = 0, -1
            others = np.array([j for j in range(n) if j != i])
            for ci, (_, K) in enumerate(lst):
                r = np.array([risk_from_row(K[j], t, e, horizon, [i, j], k) for j in others])
                c = c_index(r, t[others], e[others])
                if c > best_c:
                    best_c, best = c, ci
            picks.append(lst[best][0])
            risks[i] = risk_from_row(lst[best][1][i], t, e, horizon, [i], k)
        out[kind] = {"c": float(c_index(risks, t, e)), "ci": bootstrap_ci(risks, t, e), "picks": picks, "risks": risks.tolist()}
    return out


def geometric_difference(Kc, Kq, lam=0.01):
    """Huang et al. (2021): g = sqrt(|| sqrt(Kq) (Kc + lam I)^-1 sqrt(Kq) ||_inf), kernels trace-normalised to N."""
    n = len(Kc)
    Kc = Kc * n / np.trace(Kc); Kq = Kq * n / np.trace(Kq)
    w, V = np.linalg.eigh(Kq)
    sq = (V * np.sqrt(np.clip(w, 0, None))) @ V.T
    M = sq @ np.linalg.inv(Kc + lam * np.eye(n)) @ sq
    return float(np.sqrt(max(np.linalg.eigvalsh(M).max(), 0)))