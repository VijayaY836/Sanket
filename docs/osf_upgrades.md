# OSF note: exploratory quantum-kernel upgrades (post BEFORE running `--upgrades`)

Upload `engine/classify.py` and `engine/fastsim.py` to the OSF project Files first, then register (Open-Ended template).

---

**Summary box:**

This registration declares, before running them, exploratory upgrades to the quantum kernel used in the SANKET diagnosis tasks (Golub AML vs ALL; METABRIC basal-like vs other subtypes). The earlier results for these tasks are already reported and are not replaced. These analyses are exploratory and all variants will be reported, including those that do not help.

**Quantum variants:** (1) projected quantum kernel with a wider tuning grid: scales {0.05, 0.1, 0.15, 0.25, 0.4, 0.55, 0.7, 1.0} × circuits {1 Trotter step; 2 steps with mixing angle 0.25, 0.5 or 1.0}; (2) the same without entangling gates (entanglement ablation); (3) per-qubit scales chosen by centred kernel-target alignment on the training fold only (random search, 43 candidates, up to 300 training patients); (4) hybrid kernel: weight w ∈ {0, 0.25, 0.5, 0.75, 1} on the upgraded quantum kernel and (1 − w) on a normalised linear kernel. All choices by inner 3-fold CV inside each training fold; SVM C ∈ {0.1, 1, 10, 100}.

**Matching classical freedom:** RBF kernel with a wider grid (multipliers 1/16 to 8) and a linear-kernel SVM; the original classical models unchanged.

**Validation:** same repeated stratified 5-fold CV and seeds as the earlier diagnosis analyses. Comparisons reported with the corrected repeated-CV t-test, uncorrected and labelled exploratory: upgraded quantum vs wider-grid RBF; upgraded vs original quantum; trained quantum vs wider-grid RBF; hybrid vs logistic regression; with vs without entanglement. Chosen settings per fold are reported.

**Expectation stated in advance:** gentler rotations and training may narrow the gap to classical models; we do not expect the quantum kernel to beat the best classical model on these tasks.