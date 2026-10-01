"""Quantum Readiness Check for any CSV file: should anyone spend quantum compute on this dataset?

Line-for-line port of web/src/lib/readiness.ts (same seeded random numbers, same splits, same decisions), so the
browser and the engine give the same answer. The browser analyses at most 150 rows; this runs on every row.
Four questions, with the same inputs and tuning budget for quantum and classical models:

  1. headroom   geometric difference g between the quantum kernel and the closest of five RBF kernels
  2. capacity   learning curve on labels engineered to carry quantum structure (Huang et al. 2021)
  3. real test  4 x stratified 5-fold CV on the user's outcome: projected quantum kernel vs RBF vs linear, every
                model tuned by inner 3-fold CV; quantum minus best classical with a corrected resampled t interval
  4. cost       qubits, two-qubit gates and circuits on IBM hardware

    python -m engine.readiness data.csv                              # outcome and features detected automatically
    python -m engine.readiness data.csv --outcome diagnosis --positive AML
    python -m engine.readiness data.csv --time os_months --event status --event-level dead --horizon 60
    python -m engine.readiness data.csv --max-rows 150               # exactly what the browser computes
Writes out/results_readiness_<file>.json (load it on the app's Readiness check page) and out/readiness_<file>.md
"""
from __future__ import annotations
import argparse
import math
import re
import time
from pathlib import Path
import numpy as np
from scipy.linalg import cho_factor, cho_solve
from .common import OUT, save_json
from .fastsim import bloch_batch

MAX_QUBITS = 12
MIN_VARIANCE = 0.7
MIN_ROWS, MIN_CLASS = 30, 8
SCALE_GRID = [0.25, 0.4, 0.55, 0.7, 1.0]
ADV_SCALE = 1.0
RBF_MULTS = [0.25, 0.5, 1, 2, 4]
ALPHAS = [1e-3, 1e-2, 1e-1, 1]
REPS, BETA = 2, 0.5
MISSING = {"", "na", "n/a", "nan", "null", "none", "?", "-", "."}
T975 = [12.71, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
        2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042]
M32 = 0xFFFFFFFF


# ---------------- seeded randomness identical to web/src/lib/rng.ts ----------------
def mulberry32(seed: int):
    a = seed & M32

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (a | 1)) & M32
        t = (t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return rand


def shuffle(a, rand):
    b = list(a)
    for i in range(len(b) - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        b[i], b[j] = b[j], b[i]
    return b


def js_round(x: float) -> int:
    return math.floor(x + 0.5)


# ---------------- CSV ----------------
def parse_csv(text: str):
    text = text.lstrip("﻿")
    m = re.search(r"\r?\n", text)
    first = text if m is None else text[:m.start()]
    delim = ","
    for d in [",", ";", "\t", "|"]:
        if len(first.split(d)) > len(first.split(delim)):
            delim = d
    out, row, field, q, i = [], [], "", False, 0
    while i < len(text):
        ch = text[i]
        if q:
            if ch == '"':
                if i + 1 < len(text) and text[i + 1] == '"':
                    field += '"'; i += 1
                else:
                    q = False
            else:
                field += ch
        elif ch == '"':
            q = True
        elif ch == delim:
            row.append(field); field = ""
        elif ch in "\r\n":
            if ch == "\r" and i + 1 < len(text) and text[i + 1] == "\n":
                i += 1
            row.append(field); field = ""
            if any(c.strip() for c in row):
                out.append(row)
            row = []
        else:
            field += ch
        i += 1
    row.append(field)
    if any(c.strip() for c in row):
        out.append(row)
    if len(out) < 2:
        raise ValueError("The file needs a header row and at least one data row.")
    headers = [h.strip() or f"column_{k + 1}" for k, h in enumerate(out[0])]
    rows = [[(r[k] if k < len(r) else "").strip() for k in range(len(headers))] for r in out[1:]]
    return headers, rows


def is_missing(s: str) -> bool:
    return s.strip().lower() in MISSING


def js_number(s: str) -> float:
    if is_missing(s) or "_" in s:
        return math.nan
    try:
        v = float(re.sub(r",(?=\d{3}\b)", "", s).strip())
    except ValueError:
        return math.nan
    return v if math.isfinite(v) else math.nan


def profile(headers, rows):
    n, cols = len(rows), []
    for index, name in enumerate(headers):
        raw = [r[index] for r in rows]
        present = [s for s in raw if not is_missing(s)]
        values = np.array([js_number(s) for s in raw], float)
        n_num = int(np.isfinite(values).sum())
        distinct = list(dict.fromkeys(present))
        numeric = len(present) > 0 and n_num >= 0.9 * len(present)
        lname = name.lower()
        role = "feature" if numeric else "text"
        if len(distinct) == 2:
            role = "label"
        if not numeric and len(distinct) == len(present) and n > 5:
            role = "id"
        if re.search(r"(^|_|\b)(id|sample|patient|subject|gsm|name)(_|\b|$)", lname) and len(distinct) > 0.9 * len(present):
            role = "id"
        if numeric and re.search(r"(time|month|day|year|follow|surv|duration|os_|dfs|rfs)", lname) and len(distinct) > 2:
            role = "time"
        if len(distinct) == 2 and re.search(r"(event|status|dead|death|relapse|progress|censor|recur)", lname):
            role = "event"
        cols.append({"index": index, "name": name, "numeric": numeric, "values": values, "missing": n - len(present),
                     "levels": distinct[:20], "distinct": len(distinct), "role": role})
    return cols


POSITIVE_HINTS = re.compile(r"^(1|yes|y|true|t|pos|positive|case|disease|tumou?r|cancer|malignant|m|aml|dead|deceased|event|relapse|progressed|high)$", re.I)


def positive_level(levels):
    hit = next((l for l in levels if POSITIVE_HINTS.match(l.strip())), None)
    if hit is not None:
        return hit
    srt = sorted(levels)
    return srt[1] if len(srt) > 1 else (levels[0] if levels else "")


def nice_round(v):
    return (js_round(v / 6) * 6 or js_round(v)) if v >= 20 else js_round(v * 10) / 10


def guess_setup(cols):
    time_c = next((c for c in cols if c["role"] == "time"), None)
    event = next((c for c in cols if c["role"] == "event"), None) or next((c for c in cols if c["role"] == "label"), None)
    label = next((c for c in reversed(cols) if c["role"] in ("label", "event")), None)
    kind = "survival" if time_c and event else "binary"
    used = {time_c["index"], event["index"]} if kind == "survival" else ({label["index"]} if label else set())
    features = [c["index"] for c in cols if c["numeric"] and c["role"] not in ("id", "time") and c["index"] not in used and c["distinct"] > 1]
    times = np.sort(time_c["values"][np.isfinite(time_c["values"])]) if time_c else np.array([])
    return {"kind": kind, "label": label["index"] if label else -1, "positive": positive_level(label["levels"]) if label else "",
            "time": time_c["index"] if time_c else -1, "event": event["index"] if event else -1,
            "eventLevel": positive_level(event["levels"]) if event else "",
            "horizon": nice_round(float(times[len(times) // 2])) if len(times) else 0, "features": features, "qubits": 0}


# ---------------- preparation ----------------
def _short(s):
    return s[:9] + "…" if len(s) > 10 else s


def correlation_edges(X):
    n, d = X.shape
    pairs = []
    for a in range(d):
        for b in range(a + 1, d):
            pairs.append((abs(float(X[:, a] @ X[:, b]) / max(1, n - 1)), a, b))
    pairs.sort(key=lambda p: -p[0])
    deg, out = [0] * d, []
    for r, a, b in pairs:
        if r < 0.2 or len(out) >= d:
            break
        if deg[a] < 3 and deg[b] < 3:
            out.append([a, b]); deg[a] += 1; deg[b] += 1
    return out


def prepare(rows, cols, s, max_rows=None):
    if len(s["features"]) < 2:
        raise ValueError("Pick at least two numeric feature columns.")
    y = []
    if s["kind"] == "binary":
        if s["label"] < 0:
            raise ValueError("Pick an outcome column." if any(c["distinct"] == 2 for c in cols) else
                             "No column has exactly two values, so there is no yes/no outcome to predict. If your outcome is a time to an event, use --time and --event.")
        c = cols[s["label"]]
        if c["distinct"] != 2:
            raise ValueError(f'"{c["name"]}" has {c["distinct"]} distinct values; a yes/no outcome needs exactly two.')
        for r in rows:
            v = r[s["label"]]
            y.append(math.nan if is_missing(v) else (1.0 if v.strip() == s["positive"].strip() else 0.0))
        outcome = f'{c["name"]} = {s["positive"]}'
    else:
        if s["time"] < 0 or s["event"] < 0:
            raise ValueError("Pick a time column and an event column (--time and --event).")
        tc, ec = cols[s["time"]], cols[s["event"]]
        if not s["horizon"] > 0:
            raise ValueError("Set a time horizon above zero.")
        for i, r in enumerate(rows):
            t, ev = tc["values"][i], r[s["event"]]
            if not math.isfinite(t) or is_missing(ev):
                y.append(math.nan); continue
            happened = ev.strip() == s["eventLevel"].strip()
            y.append(1.0 if happened and t <= s["horizon"] else (0.0 if t > s["horizon"] else math.nan))
        outcome = f'{ec["name"]} by {tc["name"]} ≤ {s["horizon"]}'
    keep = [i for i, v in enumerate(y) if math.isfinite(v)]
    rows_labelled = len(keep)
    if max_rows and len(keep) > max_rows:
        rand = mulberry32(2026)
        pos = shuffle([i for i in keep if y[i] == 1], rand)
        neg = shuffle([i for i in keep if y[i] == 0], rand)
        n_pos = max(1, js_round(max_rows * len(pos) / len(keep)))
        keep = sorted(pos[:n_pos] + neg[:max_rows - n_pos])
    X = np.array([[cols[f]["values"][i] for f in s["features"]] for i in keep], float)
    names = [cols[f]["name"] for f in s["features"]]
    stats = []
    for j in range(X.shape[1]):
        v = np.sort(X[np.isfinite(X[:, j]), j])
        med = float(v[len(v) // 2]) if len(v) else 0.0
        filled = np.where(np.isfinite(X[:, j]), X[:, j], med)
        mu = float(filled.mean()); sd = float(np.sqrt(((filled - mu) ** 2).sum() / max(1, len(filled) - 1)))
        stats.append((med, mu, sd, len(v) >= 0.5 * len(X) and sd > 1e-12))
    ok = [j for j, st in enumerate(stats) if st[3]]
    if len(ok) < 2:
        raise ValueError("Fewer than two feature columns vary across rows (or most of their values are missing).")
    X = np.column_stack([(np.where(np.isfinite(X[:, j]), X[:, j], stats[j][0]) - stats[j][1]) / stats[j][2] for j in ok])
    names = [names[j] for j in ok]
    q = min(s["qubits"] or MAX_QUBITS, MAX_QUBITS, len(X) - 1)
    explained = 1.0
    if len(names) <= q:
        method, Z, qubit_names, qubit_detail = "direct", X, [_short(n_) for n_ in names], list(names)
        edges = correlation_edges(X)
    else:
        method = "pca"
        n = len(X)
        w, V = np.linalg.eigh(X @ X.T)
        order = sorted(range(n), key=lambda k: -w[k])[:q]
        total = float(np.clip(w, 0, None).sum()) or 1.0
        explained = float(sum(max(w[k], 0) for k in order) / total)
        Z = V[:, order].copy()
        loads = (X.T @ Z).T  # (q, d)
        for c in range(q):
            big = int(np.argmax(np.abs(loads[c])))
            sign = -1.0 if loads[c][big] < 0 else 1.0
            col = Z[:, c] * sign; mu = col.mean()
            sd = float(np.sqrt(((col - mu) ** 2).sum() / max(1, n - 1))) or 1.0
            Z[:, c] = (col - mu) / sd
            loads[c] = loads[c] * sign
        qubit_names = [f"PC{c + 1}" for c in range(q)]
        qubit_detail = []
        for l in loads:
            top = sorted(range(len(l)), key=lambda f: -abs(l[f]))[:3]
            qubit_detail.append(", ".join(("+" if l[f] >= 0 else "−") + names[f] for f in top))
        edges = [[k, k + 1] for k in range(q - 1)]
    yy = np.array([y[i] for i in keep])
    return {"rowsTotal": len(rows), "rowsLabelled": rows_labelled, "rowsUsed": len(keep), "y": yy, "positives": int((yy == 1).sum()),
            "qubitNames": qubit_names, "qubitDetail": qubit_detail, "Z": Z, "Xall": X, "edges": edges, "method": method,
            "explained": explained, "features": names, "outcome": outcome}


# ---------------- kernels and learners (identical to web/src/lib/advantage.ts) ----------------
def med_off(D):
    v = np.sort(D[np.triu_indices(len(D), 1)])
    return float(v[len(v) // 2]) if len(v) and v[len(v) // 2] else 1.0


def sqdist(F):
    sq = (F ** 2).sum(1)
    return np.clip(sq[:, None] + sq[None, :] - 2 * F @ F.T, 0, None)


def kernels(p, scales):
    Z, n = p["Z"], len(p["Z"])
    Kq = []
    for sc in scales:
        B = bloch_batch(Z, p["edges"], REPS, BETA, sc).reshape(n, -1)
        D = sqdist(B); Kq.append(np.exp(-D / med_off(D)))
    A = (np.pi / 2) * np.tanh(Z / 2)
    DA = sqdist(A); ma = med_off(DA)
    return Kq, [np.exp(-m * DA / ma) for m in RBF_MULTS]


def auc(score, y):
    score, y = np.asarray(score, float), np.asarray(y)
    idx = np.argsort(score, kind="stable")
    s_sorted = score[idx]
    sum_pos, n_pos, k, n = 0.0, 0, 0, len(score)
    while k < n:
        j = k
        while j < n and s_sorted[j] == s_sorted[k]:
            j += 1
        avg = (k + j + 1) / 2
        for m in range(k, j):
            if y[idx[m]]:
                sum_pos += avg; n_pos += 1
        k = j
    n_neg = n - n_pos
    return (sum_pos - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg) if n_pos and n_neg else 0.5


def krr(K, tr, te, target, alpha):
    t = target[tr]; mu = t.mean()
    A = K[np.ix_(tr, tr)] + alpha * np.eye(len(tr))
    coef = cho_solve(cho_factor(A), t - mu)
    return K[np.ix_(te, tr)] @ coef


def tuned_fit(Ks, tr, te, y, target, rand):
    folds, order = 3, shuffle(tr, rand)
    best, best_a = (0, ALPHAS[0]), -1.0
    for k, K in enumerate(Ks):
        for a in ALPHAS:
            s = c = 0
            for f in range(folds):
                ite = [order[j] for j in range(len(order)) if j % folds == f]
                itr = [order[j] for j in range(len(order)) if j % folds != f]
                if len(set(y[ite])) < 2:
                    continue
                s += auc(krr(K, itr, ite, target, a), y[ite]); c += 1
            if c and s / c > best_a:
                best_a, best = s / c, (k, a)
    return auc(krr(Ks[best[0]], tr, te, target, best[1]), y[te]), best[0]


def normalise(K):
    return K * len(K) / np.trace(K)


def spectral(K, f):
    w, V = np.linalg.eigh(K)
    return (V * f(w)) @ V.T


def engineer_labels(Kq, Kcs, lam=0.01):
    n = len(Kq)
    sqQ = spectral(normalise(Kq), lambda w: np.sqrt(np.clip(w, 0, None)))
    scan = []
    for c, Kc in enumerate(Kcs):
        inv = spectral(normalise(Kc) + lam * np.eye(n), lambda w: 1 / w)
        M = sqQ @ inv @ sqQ; M = (M + M.T) / 2
        w, V = np.linalg.eigh(M)
        top = int(np.argmax(w)); v = V[:, top]
        v = -v if v.sum() < 0 else v  # eigenvectors have arbitrary sign: same convention as the browser
        scan.append({"mult": RBF_MULTS[c], "g": float(np.sqrt(max(w[top], 0))), "v": v})
    worst = min(scan, key=lambda s_: s_["g"])
    yc = sqQ @ worst["v"]
    sd = float(np.sqrt(((yc - yc.mean()) ** 2).sum() / n)) or 1.0
    target = (yc - yc.mean()) / sd
    med = np.sort(target)[n // 2]
    return worst["g"], target, (target > med).astype(int)


def learning_curve(pool, y, tgt, qK, cK):
    sizes = [s for s in (10, 20, 40, 80, 160, 320, 640) if s <= math.floor(len(pool) * 0.7)]
    res = {s: {"q": [], "c": []} for s in sizes}
    for r in range(12):
        rand = mulberry32(1000 + r)
        order = shuffle(pool, rand); n_test = max(15, math.floor(len(pool) * 0.3))
        te, rest = order[:n_test], order[n_test:]
        for s in sizes:
            tr = rest[:s]; pos = int(sum(y[i] for i in tr))
            if pos < 3 or s - pos < 3 or len(set(y[te])) < 2:
                continue
            res[s]["q"].append(tuned_fit(qK, tr, te, y, tgt, rand)[0])
            res[s]["c"].append(tuned_fit(cK, tr, te, y, tgt, rand)[0])
    st = lambda v: {"mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0}
    return [{"size": s, "quantum": st(res[s]["q"]), "classical": st(res[s]["c"])} for s in sizes if res[s]["q"]]


# ---------------- the check ----------------
def choose_encoding(rows, cols, s, max_rows=None, log=print):
    if len(s["features"]) < 2:
        raise ValueError("Pick at least two numeric feature columns.")
    if s["qubits"]:
        return prepare(rows, cols, s, max_rows), []
    top = min(len(s["features"]), MAX_QUBITS)
    qs = sorted({q for q in (4, 6, 8, top) if 2 <= q <= top})
    preps, options = [], []
    for q in qs:
        p = prepare(rows, cols, {**s, "qubits": q}, max_rows)
        Kq, Kc = kernels(p, [ADV_SCALE])
        g = engineer_labels(Kq[0], Kc)[0]
        preps.append(p)
        options.append({"qubits": p["Z"].shape[1], "method": p["method"], "explained": p["explained"], "couplings": len(p["edges"]), "g": g, "chosen": False})
        log(f"  encoding search: {q:2d} qubits ({p['method']}, {p['explained']:.0%} variance)  g = {g:.2f}")
    eligible = [i for i, o in enumerate(options) if o["explained"] >= MIN_VARIANCE]
    pick = len(options) - 1
    if eligible:
        g_best = max(options[i]["g"] for i in eligible)
        pick = next(i for i in eligible if options[i]["g"] >= 0.95 * g_best)
    options[pick]["chosen"] = True
    return preps[pick], options


def run(p, log=print):
    t0 = time.time()
    n, q = p["Z"].shape
    y = p["y"].astype(int)
    log(f"  simulating {n} rows on {q} qubits at {len(SCALE_GRID)} bandwidths")
    Kq, Kc = kernels(p, SCALE_GRID)
    Klin = [p["Z"] @ p["Z"].T / q]
    d_all, compressed = p["Xall"].shape[1], p["method"] == "pca"
    Klin_all = [p["Xall"] @ p["Xall"].T / d_all] if compressed else []
    Kwide = Kq[SCALE_GRID.index(ADV_SCALE)]
    g, target, y_eng = engineer_labels(Kwide, Kc)
    log(f"  headroom g = {g:.2f}; learning engineered labels")
    engineered = learning_curve(list(range(n)), y_eng, target.astype(float), [Kwide], Kc)
    scores = {"quantum": [], "rbf": [], "linear": [], "linearAll": []}
    picks, n_te, n_tr = [], 0, 0
    for r in range(4):
        rand = mulberry32(500 + r)
        pos = shuffle([i for i in range(n) if y[i]], rand)
        neg = shuffle([i for i in range(n) if not y[i]], rand)
        fold_of = [0] * n
        for k, i in enumerate(pos):
            fold_of[i] = k % 5
        for k, i in enumerate(neg):
            fold_of[i] = k % 5
        for f in range(5):
            te = [i for i in range(n) if fold_of[i] == f]; tr = [i for i in range(n) if fold_of[i] != f]
            if len(set(y[te])) < 2:
                continue
            yf = y.astype(float)
            a_, k_ = tuned_fit(Kq, tr, te, y, yf, rand); scores["quantum"].append(a_); picks.append(k_)
            scores["rbf"].append(tuned_fit(Kc, tr, te, y, yf, rand)[0])
            scores["linear"].append(tuned_fit(Klin, tr, te, y, yf, rand)[0])
            if compressed:
                scores["linearAll"].append(tuned_fit(Klin_all, tr, te, y, yf, rand)[0])
            n_te += len(te); n_tr += len(tr)
        log(f"  real outcome: repeat {r + 1}/4")

    def mk(key, label):
        v = np.array(scores[key])
        return {"key": key, "label": label, "auc": float(v.mean()), "sd": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0, "folds": v.tolist()}
    real = [mk("quantum", "Projected quantum kernel"), mk("rbf", "Classical RBF kernel"), mk("linear", "Linear model")]
    best = real[1] if real[1]["auc"] >= real[2]["auc"] else real[2]
    dd = np.array(real[0]["folds"]) - np.array(best["folds"]); J = len(dd)
    dm, s2 = float(dd.mean()), float(((dd - dd.mean()) ** 2).sum() / max(1, J - 1))
    half = (T975[min(J - 1, len(T975)) - 1] if J > 1 else 1.96) * math.sqrt((1 / J + n_te / max(1, n_tr)) * s2)
    rzz = REPS * len(p["edges"])
    return {"n": n, "g": g, "gMax": math.sqrt(n), "engineered": engineered, "real": real, "bestClassical": best,
            "reference": mk("linearAll", f"Linear model, all {d_all} features") if compressed else None,
            "diff": {"mean": dm, "lo": dm - half, "hi": dm + half}, "quantumScale": [SCALE_GRID[i] for i in picks],
            "cost": {"qubits": q, "rzz": rzz, "twoQubit": 2 * rzz, "twoQubitFullZZ": REPS * q * (q - 1), "circuits": 3 * n,
                     "circuitsFidelity": n * (n - 1) // 2, "shots": 3 * n * 1024},
            "seconds": time.time() - t0}


# ---------------- verdict (same rules and wording as the browser) ----------------
def judge(p, r):
    f3 = lambda v: f"{v:.3f}"
    sgn = lambda v: ("+" if v >= 0 else "−") + f"{abs(v):.3f}"
    minority = min(p["positives"], p["rowsUsed"] - p["positives"])
    enough = p["rowsUsed"] >= MIN_ROWS and minority >= MIN_CLASS
    e0 = r["engineered"][0] if r["engineered"] else None
    e_last = r["engineered"][-1] if r["engineered"] else None
    eng_gain = e0["quantum"]["mean"] - e0["classical"]["mean"] if e0 else 0
    headroom = "pass" if r["g"] >= 3 else "mixed" if r["g"] >= 1.5 else "fail"
    capacity = "pass" if eng_gain >= 0.08 else "mixed" if eng_gain >= 0.03 else "fail"
    q, b, d = r["real"][0], r["bestClassical"], r["diff"]
    parity = d["lo"] <= 0 and d["hi"] >= 0 and d["mean"] >= -0.02
    real_s = "pass" if d["lo"] > 0 else "mixed" if parity else "fail"
    two_q = r["cost"]["twoQubit"]
    cost_s = "pass" if two_q <= 60 else "mixed" if two_q <= 200 else "fail"
    bl = b["label"].lower()
    big = p["rowsUsed"] >= 80 and minority >= 20
    checks = [
        {"key": "data", "title": "Enough data", "status": ("pass" if big else "mixed") if enough else "fail",
         "headline": f"{p['rowsUsed']} rows, {minority} in the smaller class",
         "detail": ("Enough to compare models with reasonable precision." if big else "Enough to run the test, but intervals will be wide.") if enough
         else f"Need at least {MIN_ROWS} rows and {MIN_CLASS} in each class for a meaningful comparison."},
        {"key": "headroom", "title": "Quantum headroom", "status": headroom,
         "headline": f"g = {r['g']:.2f} (maximum √N = {r['gMax']:.1f})",
         "detail": {"fail": "A classical kernel reproduces the quantum kernel almost exactly on these inputs, so no quantum advantage is possible here.",
                    "mixed": "Some room: the quantum kernel sees these rows a little differently from every classical kernel tried. Necessary, not sufficient.",
                    "pass": "Large room: the quantum kernel's geometry differs clearly from every classical kernel tried. Necessary, not sufficient."}[headroom]},
        {"key": "capacity", "title": "Circuit can learn quantum structure", "status": capacity,
         "headline": f"AUC {f3(e0['quantum']['mean'])} vs {f3(e0['classical']['mean'])} with {e0['size']} training rows" if e0 else "not enough rows",
         "detail": ("On labels engineered to have quantum structure (synthetic by construction), the circuit learns from far fewer rows"
                    + (f"; at {e_last['size']} rows it is {f3(e_last['quantum']['mean'])} vs {f3(e_last['classical']['mean'])}" if e_last and e_last is not e0 else "")
                    + ". If your outcome had that structure, this encoding could find it.") if capacity == "pass"
         else "Even on labels built to favour it, the circuit barely beats the classical kernel on these inputs. Try a different encoding or more qubits."},
        {"key": "real", "title": "Better on your real outcome", "status": real_s,
         "headline": f"{sgn(d['mean'])} AUC vs {bl} (95% interval {sgn(d['lo'])} to {sgn(d['hi'])})",
         "detail": f"The quantum kernel ({f3(q['auc'])}) beats the best classical model ({f3(b['auc'])}) on held-out rows, and the interval excludes zero." if real_s == "pass"
         else f"Quantum {f3(q['auc'])} vs {bl} {f3(b['auc'])}: level, and the interval includes zero." if real_s == "mixed"
         else f"The {bl} scores higher ({f3(b['auc'])} vs {f3(q['auc'])})" + (" and the interval excludes zero" if d["hi"] < 0 else "; the interval includes zero, but nothing points to quantum helping") + "."},
        {"key": "cost", "title": "Affordable on hardware", "status": cost_s,
         "headline": f"{r['cost']['qubits']} qubits, {two_q} two-qubit gates, {r['cost']['circuits']:,} circuits",
         "detail": {"pass": "Shallow enough for today's IBM Heron devices.", "mixed": "Runnable on Heron, but noise will start to bite; prefer fewer couplings.",
                    "fail": "Deep for current hardware; expect noise to dominate."}[cost_s]
         + f" A standard full ZZ feature map would need {r['cost']['twoQubitFullZZ']} two-qubit gates, and a fidelity kernel {r['cost']['circuitsFidelity']:,} circuits."},
    ]
    linear_best = b["key"] == "linear"
    ref = r["reference"]
    ref_wins = bool(ref) and ref["auc"] - q["auc"] >= 0.05 and real_s != "pass"
    lost = (f" Note: compressing {len(p['features'])} features onto {r['cost']['qubits']} qubits loses signal; a linear model on all features scores {f3(ref['auc'])}."
            if ref and ref["auc"] - max(q["auc"], b["auc"]) >= 0.05 else "")
    if not enough:
        return {"kind": "data", "title": "Not enough data to decide", "checks": checks,
                "summary": f"With {p['rowsUsed']} usable rows and only {minority} in the smaller class, any difference between quantum and classical models would be noise.",
                "next": ["Collect more labelled rows (aim for 80+ with 20+ in each class).", "Re-run this check; the analysis is deterministic, so changes reflect the data, not luck."]}
    if real_s == "pass":
        return {"kind": "go", "title": "Quantum is worth pursuing", "checks": checks,
                "summary": f"The quantum kernel beats the best classical model on your real outcome in held-out data, by {sgn(d['mean'])} AUC, with an interval that excludes zero.",
                "next": ["Confirm on every row with the Python engine: python -m engine.readiness <your file>.", "Pre-register the confirmatory analysis on OSF before looking at new data.",
                         f"Run the {r['cost']['circuits']:,} projected-kernel circuits on IBM hardware and compare with simulation."]}
    if ref_wins:
        return {"kind": "classical", "title": "Classical is enough", "checks": checks,
                "summary": f"A linear model on all {len(p['features'])} features ({f3(ref['auc'])} AUC) beats the quantum kernel ({f3(q['auc'])}), which sees only a {r['cost']['qubits']}-qubit compression of them. Squeezing this data onto today's qubit counts throws away more signal than any quantum effect could add back.",
                "next": ["Use the linear model on all features: better accuracy, no quantum hardware.", "Revisit when larger, less noisy devices allow encoding more of the features."]}
    if real_s == "mixed" and headroom != "fail" and capacity != "fail":
        return {"kind": "promising", "title": "Promising, but unproven", "checks": checks,
                "summary": f"Quantum is level with the best classical model on your outcome ({f3(q['auc'])} vs {f3(b['auc'])}), and there is room for it to differ, but this data cannot show it is better."
                + (" The best classical model is linear, which suggests the signal is mostly linear." if linear_best else "") + lost,
                "next": ["More rows would narrow the interval; quantum kernels matter most when data is scarce, so check the learning curve.",
                         "Try a different qubit count or encoding before spending hardware time.", "If you proceed, report it as parity, not advantage."]}
    summary = (f"The {bl} scores higher than the quantum kernel on your outcome ({f3(b['auc'])} vs {f3(q['auc'])} AUC). Quantum compute would add cost without benefit."
               + (" The signal looks mostly linear." if linear_best else "") + lost) if real_s == "fail" else (
               f"Quantum performs at parity ({f3(q['auc'])} vs {f3(b['auc'])}), and "
               + ("a classical kernel can reproduce the quantum one on these inputs" if headroom == "fail" else "the circuit does not learn quantum structure better than classical models on these inputs")
               + ", so there is no route to an advantage here." + lost)
    return {"kind": "classical", "title": "Classical is enough", "checks": checks, "summary": summary,
            "next": [f"Use the {bl}: same accuracy, no quantum hardware.", "Revisit if you gain a data source with physical quantum structure (for example quantum-sensor measurements)."]}


def report_markdown(file, p, r, v):
    f3 = lambda x: f"{x:.3f}"
    icon = {"pass": "✅", "mixed": "🟡", "fail": "❌"}
    models = r["real"] + ([r["reference"]] if r["reference"] else [])
    enc = (f"{len(p['features'])} features reduced to {len(p['qubitNames'])} principal components ({p['explained'] * 100:.0f}% of variance), qubits coupled in a line."
           if p["method"] == "pca" else f"{len(p['qubitNames'])} features, one per qubit, coupled along their strongest correlations ({len(p['edges'])} couplings).")
    return "\n".join([
        f"# Quantum Readiness Check: {file}", "", f"**Verdict: {v['title']}.** {v['summary']}", "", "| Check | Result | |", "|---|---|---|",
        *[f"| {c['title']} | {c['headline']} | {icon[c['status']]} |" for c in v["checks"]], "",
        f"## Real outcome ({p['outcome']})",
        f"{p['rowsUsed']} rows used ({p['positives']} positive) of {p['rowsLabelled']} labelled rows ({p['rowsTotal']} in the file). 4 × stratified 5-fold cross-validation; every model tuned by inner 3-fold CV on the training folds only.",
        "", "| Model | AUC | SD |", "|---|---|---|",
        *[f"| {m['label']}{' (reference, not information-matched)' if m['key'] == 'linearAll' else ''} | {f3(m['auc'])} | {f3(m['sd'])} |" for m in models], "",
        f"Quantum minus best classical: {f3(r['diff']['mean'])} (95% interval {f3(r['diff']['lo'])} to {f3(r['diff']['hi'])}, corrected resampled t).", "",
        "## Encoding", enc, f"SANKET feature map, {REPS} Trotter steps; bandwidth chosen by inner CV from {', '.join(str(s) for s in SCALE_GRID)}.", "",
        "## Next steps", *[f"- {x}" for x in v["next"]], "",
        f"_Generated by SANKET's Quantum Readiness Check in {r['seconds']:.1f} s. Engineered-label results use synthetic labels by construction. Research prototype._", ""])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--outcome", help="yes/no outcome column")
    ap.add_argument("--positive", help="level of the outcome column that counts as positive")
    ap.add_argument("--time", help="time column (time-to-event outcome)")
    ap.add_argument("--event", help="event column (time-to-event outcome)")
    ap.add_argument("--event-level", help="level of the event column meaning the event happened")
    ap.add_argument("--horizon", type=float, help="outcome = event by this time")
    ap.add_argument("--features", help="comma-separated feature columns (default: every numeric column)")
    ap.add_argument("--qubits", type=int, default=0, help="0 = automatic encoding search (default)")
    ap.add_argument("--max-rows", type=int, default=0, help="stratified subsample, as the browser does at 150 (default: every row)")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    path = Path(a.csv)
    headers, rows = parse_csv(path.read_text(encoding="utf-8-sig"))
    cols = profile(headers, rows)
    s = guess_setup(cols)
    col = lambda name: next((c["index"] for c in cols if c["name"] == name), None) if name else None
    for flag, name in (("--outcome", a.outcome), ("--time", a.time), ("--event", a.event)):
        if name and col(name) is None:
            raise SystemExit(f"{flag}: no column named {name!r}. Columns: {headers}")
    if a.time or a.event:
        s.update(kind="survival", time=col(a.time) if a.time else s["time"], event=col(a.event) if a.event else s["event"])
        if a.event:
            s["eventLevel"] = positive_level(cols[s["event"]]["levels"])
    elif a.outcome:
        s.update(kind="binary", label=col(a.outcome), positive=positive_level(cols[col(a.outcome)]["levels"]))
    if a.positive:
        s["positive"] = a.positive
    if a.event_level:
        s["eventLevel"] = a.event_level
    if a.horizon:
        s["horizon"] = a.horizon
    out_cols = [s["label"]] if s["kind"] == "binary" else [s["time"], s["event"]]
    s["features"] = [col(f.strip()) for f in a.features.split(",")] if a.features else [f for f in s["features"] if f not in out_cols]
    if None in s["features"]:
        raise SystemExit(f"--features: unknown column. Columns: {headers}")
    s["qubits"] = a.qubits
    print(f"{path.name}: {len(rows)} rows, {len(headers)} columns; " + (
        f"outcome {cols[s['label']]['name']} = {s['positive']}" if s["kind"] == "binary" and s["label"] >= 0 else
        f"outcome {cols[s['event']]['name']} = {s['eventLevel']} by {cols[s['time']]['name']} <= {s['horizon']}" if s["kind"] == "survival" else "no outcome found")
          + f"; {len(s['features'])} features")
    try:
        p, options = choose_encoding(rows, cols, s, a.max_rows or None)
        r = run(p)
    except ValueError as e:
        raise SystemExit(str(e))
    v = judge(p, r)
    print(f"\nVERDICT: {v['title']}\n  {v['summary']}\n")
    for c in v["checks"]:
        print(f"  [{c['status']:5s}] {c['title']}: {c['headline']}")
    print("\n  " + "\n  ".join(f"{m['label']:34s} AUC {m['auc']:.3f} ± {m['sd']:.3f}" for m in r["real"] + ([r["reference"]] if r["reference"] else [])))
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", path.stem)
    prep_out = {k: v_ for k, v_ in p.items() if k not in ("Z", "Xall", "y")}
    save_json({"tool": "sanket-readiness", "version": 1, "file": path.name, "maxRows": a.max_rows or None, "prep": prep_out, "options": options,
               "res": r, "verdict": v}, Path(a.out) / f"results_readiness_{stem}.json")
    md = Path(a.out) / f"readiness_{stem}.md"
    md.write_text(report_markdown(path.name, p, r, v), encoding="utf-8")
    print(f"wrote {md}")


if __name__ == "__main__":
    main()
