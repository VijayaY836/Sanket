# OSF note: qubit-count and expressivity-versus-noise analyses (post BEFORE running)

Upload `engine/qubits.py`, `engine/noise.py` and `engine/experiments_common.py` to Files first, then register (Open-Ended template).

---

**Summary box:**

This registration declares two exploratory analyses of the SANKET quantum kernel, run before results are seen, on METABRIC relapse (random subset of 1,000 patients for the qubit analysis, 800 for the noise analysis, seed 5), the METABRIC basal-like subtype task, the Golub leukaemia task and GSE26549. Earlier results are not replaced; all results will be reported.

**1. Qubit count.** Pathways are added in a fixed, outcome-free order (one biological theme at a time, round-robin over the configured groups): 2, 4, 6, 8, 10 and 12 qubits, with the crosstalk couplings among the included pathways. At each size the projected quantum kernel and the classical RBF kernel use identical pathways; bandwidths chosen by inner 3-fold CV. Repeated stratified 5-fold CV (3 repeats, seed 21). Metric: C-index (survival) or AUC (diagnosis). Reported: performance and quantum-minus-classical difference per size.

**2. Expressivity versus noise.** Five fixed encodings, from gentle to expressive: bandwidth 0.1 with 1 Trotter step; 0.25 with 1; 0.25 with 2; 0.55 with 2; 1.0 with 2. Noise: per-qubit global-depolarising Bloch-vector shrink with two-qubit error p2 ∈ {0, 0.5, 1, 2, 3}% (single-qubit error p2/10), plus binomial shot noise at 1,024 shots per basis; exact simulation as reference. Repeated stratified 5-fold CV (3 repeats, seed 31), noise redrawn per repeat. Reported: performance per encoding and noise level, and the drop from exact to 3% error. The encoding that is most robust while remaining accurate will be used for the IBM hardware run.