# OSF registration text: SANKET METABRIC module

Register this BEFORE running `python -m engine.scale` (building the cohort with `engine.metabric` is fine, it analyses no outcomes).
Upload `engine/config_metabric.yaml` (and optionally `engine/scale.py`) to the OSF project's Files FIRST, so the registration archives them.

---

**Summary box (paste first):**

This is a preregistration. It is the second registration for this project. The first (1 October 2026) covered the oral premalignant lesion cohort GSE26549. This registration covers a new, independent cohort, METABRIC primary breast cancer (cBioPortal study brca_metabric), whose outcomes have not been analysed by the team at the time of registration. It specifies the dataset, endpoint, features, quantum circuit, models, tuning procedure, validation protocol, primary and secondary hypotheses, statistical tests and interpretation rules. The exact configuration file used by the analysis code is archived with this registration. All results will be reported regardless of direction.

**Title:** SANKET: hybrid quantum kernel survival analysis of breast cancer relapse (METABRIC)

**Team:** Yukthi6G, BVRIT Hyderabad College of Engineering for Women (Smart India Hackathon 2026, PS SIH26139)

**Question:** In a large cohort (about 1,900 patients), does a projected quantum kernel built from biologically wired pathway qubits predict relapse-free survival better than, equal to, or worse than a classical kernel and standard survival models, and does any difference depend on training-set size?

**Data:** METABRIC (Curtis et al., Nature 2012; Pereira et al., Nat Commun 2016) from cBioPortal: Illumina microarray expression (data_mrna_illumina_microarray.txt) and clinical files. Inclusion: all patients with expression data and non-missing relapse-free survival (RFS_MONTHS > 0, RFS_STATUS). No other exclusions. Endpoint: relapse-free survival; headline risk horizon 60 months.

**Features:** ssGSEA (rank normalisation) scores for the same 12 MSigDB Hallmark pathways as the first registration (v2023.1.Hs), z-scored across the cohort. No outcome-based feature selection. Clinical variables, used only in clinical baselines: NPI, age at diagnosis, tumour size, grade, ER status, HER2 status (medians imputed within training folds).

**Quantum encoding:** identical to the first registration. 12 qubits, angles x = scale × (π/2) × tanh(z/2); H on all qubits, then 2 Trotter steps of RZ(2x), RZZ(2xᵢxⱼ) on the pathway crosstalk graph (Jaccard gene overlap, max degree 3, max 14 edges; the same 14 edges as the first study, since the graph depends only on the gene sets), RX(1.0). Kernels computed by exact statevector simulation.

**Models:** (1) projected quantum kernel; (2) fidelity quantum kernel; (3) classical RBF kernel on the same angles; each with a Beran survival estimator over the 15 most similar training patients, bandwidth chosen by inner 3-fold CV (quantum scale grid {0.25, 0.4, 0.55, 0.7, 1.0}; RBF multiplier grid {0.25, 0.5, 1, 2, 4}). (4) Elastic-net Cox on the 12 pathway scores (l1 ratio 0.5, penalty grid {0.003, 0.01, 0.03, 0.1, 0.3} by inner 3-fold CV). (5) Random survival forest (200 trees, min leaf 15, sqrt features). (6) Hybrid: elastic-net Cox on the 12 pathway scores plus the 36 quantum Bloch-vector features, bandwidth and penalty chosen by inner CV. (7) Clinical Cox model on NPI. (8) Elastic-net Cox on clinical variables plus pathway scores.

**Validation:** 5 × repeated stratified 5-fold cross-validation (random seed 7); all tuning inside training folds; Harrell's C-index on each test fold.

**Primary hypothesis and test:** H1: the projected quantum kernel's C-index differs from the classical RBF kernel's. Test: corrected repeated k-fold CV t-test (Bouckaert & Frank 2004), two-sided, α = 0.05. Interpretation: p < 0.05 means a real difference in the observed direction; otherwise, if the mean difference is under 0.02 in absolute value, parity; otherwise inconclusive.

**Secondary hypotheses:** H2: projected quantum kernel vs each of the other models (corrected t-test, Holm correction across these comparisons). H3 (data size): with training sizes {50, 100, 200, 400, 800, 1600}, 20 repeats each, and a stratified held-out test set of 300 patients per repeat, the difference between projected quantum and classical RBF kernels is larger at small training sizes (50 and 100) than at 1,600. Reported as mean ± SD per size with paired comparisons at 50 and 100 (Holm-corrected).

**Also reported:** bandwidth chosen in each fold; IBM quantum hardware run of the projected-kernel circuits on a random subset of patients, comparing measured with simulated Bloch vectors.

**Known limitations, stated in advance:** METABRIC patients received varied treatments, which affect relapse; results describe prognosis under historical treatment, not untreated progression. Repeated-CV folds share patients; the corrected t-test accounts for this approximately.

**Code:** SANKET engine (engine/metabric.py, engine/scale.py) with engine/config_metabric.yaml as archived here.