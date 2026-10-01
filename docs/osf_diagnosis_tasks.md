# OSF note: diagnosis tasks (post before running engine.classify)

Add this as a new registration (Open-Ended template) or, at minimum, as a dated file in the project. Upload `engine/classify.py` to Files first.

---

**Summary box:**

This registration declares, before running them, two additional diagnosis (classification) analyses using the SANKET pipeline. They are separate from the two registered survival analyses (GSE26549 and METABRIC). The METABRIC subtype labels and the Golub leukaemia labels have not been analysed with these models at the time of registration. All results will be reported regardless of direction.

**Tasks:** (1) Golub et al. (Science 1999) leukaemia data, 72 patients: acute myeloid (AML, 25) vs acute lymphoblastic (ALL, 47) leukaemia. Expression floored at 100, capped at 16,000, log2; Affymetrix Hu6800 probes mapped to gene symbols with GEO GPL80. (2) METABRIC: basal-like vs all other PAM50/claudin subtypes (patients labelled "NC" excluded; random subset of up to 1,200 patients, seed 3).

**Features and encoding:** the same 12 Hallmark pathways (ssGSEA, z-scored), the same 12-qubit circuit and crosstalk graph as the earlier registrations.

**Models:** support vector machines with the projected quantum kernel, the fidelity quantum kernel and the classical RBF kernel (bandwidth grids as before; C in {0.1, 1, 10, 100}; chosen by inner 3-fold CV), L2 logistic regression (inner CV), random forest and gradient boosting (small grids by inner CV).

**Validation:** repeated stratified 5-fold CV (10 repeats for Golub, 3 for METABRIC; seed 11). Metrics: AUC (primary) and accuracy.

**Hypotheses and tests:** primary: projected quantum kernel vs classical RBF kernel AUC, corrected repeated-CV t-test, two-sided, α = 0.05; parity if p ≥ 0.05 and |difference| < 0.02. Secondary: projected kernel vs each other model, Holm-corrected. Expectation stated in advance: all models will score high (AUC above 0.9 likely for Golub) because these are strong-signal diagnostic tasks; the aim is to show the quantum predictor reaches state-of-the-art accuracy, not to claim it beats classical models.