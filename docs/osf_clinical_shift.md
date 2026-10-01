# OSF note: clinical-usefulness, multimodal and cohort-shift analyses (post BEFORE running)

Upload `engine/clinical.py` and `engine/shift.py` to the OSF project Files first, then register (Open-Ended template).

---

**Summary box:**

This registration declares, before running them, three further analyses of the SANKET models on GSE26549 (oral precancer) and METABRIC (breast cancer). Earlier registered results are not replaced. All results will be reported regardless of direction.

**1. Clinical usefulness (both cohorts).** Out-of-fold predictions (5-fold stratified CV, 5 repeats for GSE26549 and 1 for METABRIC; bandwidths and penalties chosen inside training folds) of risk at the registered horizon (36 months oral, 60 months breast) for the projected quantum kernel, classical RBF kernel and elastic-net Cox. Reported: calibration by risk quintile (observed = Kaplan–Meier), IPCW Brier score and skill against the no-information model, decision-curve net benefit for referral thresholds 2–60%, and a screening-first operating point (highest threshold catching ≥ 90% of progressions by the horizon) with referral rate, specificity, PPV and NPV.

**2. Multimodal models (exploratory, both cohorts).** Quantum kernel multiplied by an RBF kernel on clinical variables; classical RBF kernel on pathways plus clinical variables; elastic-net Cox on pathways plus clinical variables. Clinical variables: age, sex and histology grade (oral); NPI, age, tumour size, grade, ER and HER2 status (breast). Same out-of-fold protocol; reported alongside, labelled exploratory.

**3. Cohort shift (METABRIC).** Leave-one-recruitment-cohort-out (COHORT column; held-out cohorts with fewer than 100 patients or 10 events skipped). Models trained on the remaining cohorts (bandwidth by inner 3-fold CV on training cohorts only): projected quantum kernel, classical RBF kernel, elastic-net Cox, Cox on NPI. Reported: C-index per held-out cohort, mean and worst cohort, and the quantum-minus-classical difference per cohort.

**Expectation stated in advance:** calibration and net benefit similar for quantum and classical kernels; clinical variables improve all models; no consistent quantum advantage under cohort shift.