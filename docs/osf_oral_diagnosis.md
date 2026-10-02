# OSF note: oral tissue diagnosis (normal, dysplasia, cancer) with quantum kernels

**Status:** written on 2 October 2026, before any model was run on GSE30784 or GSE23558. Upload to the OSF project (Open-Ended Registration template) together with `engine/oral_diagnosis.py` and `engine/classify.py` **before** running the analyses below. Any later change is recorded in the Amendments section with its date and reason.

---

**Summary box:**

SANKET adds a detection step to its existing progression model: given the gene activity of an oral tissue sample, estimate whether it is normal mucosa, dysplasia or cancer. The method is unchanged from the registered SANKET analyses: the same 12 MSigDB Hallmark pathways, the same pathway-crosstalk quantum circuit, and the same equal-budget comparison of quantum kernels against classical models. We register three tasks on GEO GSE30784 and one external check on GEO GSE23558. Results will be reported whichever way they go.

---

## 1 · Questions and expectations

| Task | Classes (positive = 1) | Expected counts | Role |
|---|---|---|---|
| **T1 · cancer vs normal** | cancer (1) vs normal (0) | 167 vs 45 | Headline detection task |
| **T2 · dysplasia vs normal** | dysplasia (1) vs normal (0) | 17 vs 45 | Earliest-change detection |
| **T3 · cancer vs dysplasia** | cancer (1) vs dysplasia (0) | 167 vs 17 | Clinically hard boundary |

**Expectations stated in advance.**
- T1: every model, quantum and classical, reaches a high AUC (we expect ≥ 0.95). This task checks that the pipeline works; it is **not** expected to show a quantum advantage.
- T2 and T3: lower and less certain. With only 17 dysplasia samples, confidence intervals will be wide; we will report them as such and draw no conclusion from point estimates alone.
- On all three tasks we expect the projected quantum kernel to be close to the classical RBF kernel, as in every earlier SANKET analysis. We do not expect it to beat the best classical model.

## 2 · Data

**Main dataset: GEO GSE30784** (Chen et al., Fred Hutchinson Cancer Research Center). Expected: 167 oral squamous cell carcinoma, 17 dysplasia and 45 normal oral tissue samples on the Affymetrix HG-U133 Plus 2.0 array (GPL570).

**Checks before freezing this plan** (they use sample annotations only, never model output):
1. Sample counts per class match the expected 167 / 17 / 45. If not, record the actual counts and the reason here before running models.
2. Platform as stated in the GEO record.
3. Whether any individual contributed more than one sample (a patient or individual identifier in the sample characteristics). If so, cross-validation is grouped by individual (section 5).

**Labels.** Taken from the GEO sample characteristics, title and source fields. A sample is *normal* if annotated as normal/control oral mucosa, *dysplasia* if annotated as dysplasia, and *cancer* if annotated as carcinoma/OSCC/tumour. Samples matching none or more than one class are excluded and listed. No sample is relabelled.

**External dataset: GEO GSE23558.** Expected: 27 oral cancers and 4–5 normal samples on a different (Agilent) platform. Its institution and patient origin will be stated **only as written in the GEO record and the linked publication**; nothing about patient nationality is claimed until checked there.

**No pooling.** Expression values are never pooled across datasets. Each dataset is preprocessed and scored on its own.

## 3 · Preprocessing and features

- Expression values as deposited; probes mapped to gene symbols with the platform annotation; duplicate symbols averaged; values log2-transformed only if deposited unlogged (`engine/data.py`, unchanged).
- ssGSEA (rank-normalised) on the **12 Hallmark pathways fixed in `engine/config.yaml`**: MYC targets, E2F targets, G2/M checkpoint, mTORC1, unfolded protein response, oxidative phosphorylation, p53, DNA repair, hypoxia, epithelial–mesenchymal transition, TNF-α via NF-κB, inflammatory response. These were fixed from prior cancer biology for the earlier analyses and are **not** re-selected for this task.
- Within GSE30784, pathway scores are z-scored across all samples (label-free, as in every earlier SANKET cohort). Raw ssGSEA scores are also stored for the external check (section 7).

## 4 · Models (identical to `engine/classify.py`)

- **Projected quantum kernel SVM** and **fidelity quantum kernel SVM**: Hamiltonian feature map, 12 qubits, coupling on the pathway-crosstalk graph, 2 Trotter steps, β = 0.5, bandwidth chosen from the configured grid.
- **Classical RBF kernel SVM**: bandwidth multiplier from the configured grid.
- All three SVMs: C ∈ {0.1, 1, 10, 100}; kernel parameter and C chosen together by inner 3-fold stratified CV on the training folds (same budget).
- **L2 logistic regression** (10 C values, inner 3-fold CV), **random forest** (300 trees, 4-point grid), **gradient boosting** (4-point grid).

## 5 · Validation

- Repeated stratified 5-fold cross-validation, **10 repeats**, fixed seed (`random_state = 11`), for all three tasks.
- If check 3 finds individuals with more than one sample, outer folds are grouped by individual (stratified group k-fold, re-seeded per repeat). Inner tuning folds are then also restricted to the training individuals.

## 6 · Outcomes and statistics

- **Primary metric:** ROC AUC on held-out folds. Secondary: accuracy, sensitivity and specificity at the model's default threshold (SVM decision 0; probability 0.5).
- **Primary comparison per task:** projected quantum kernel vs classical RBF kernel, Bouckaert–Frank corrected repeated-CV t-test, two-sided, α = 0.05. The three primary p-values (T1–T3) are also reported with Holm correction across tasks.
- **Secondary comparisons:** projected kernel vs each other model, Holm-corrected within task.
- **Wording rule fixed in advance:** we call a result a *tie* ("parity") when the primary comparison is not significant; we call it a *quantum win* only if the projected kernel is significantly better than the RBF kernel **and** at least as good as the best classical model.

## 7 · External check on GSE23558

- Train each model on **all** GSE30784 cancer and normal samples (task T1), with hyperparameters chosen by inner CV on GSE30784 only.
- Map GSE23558 raw ssGSEA scores into the training space with the **GSE30784 means and standard deviations** (no re-standardisation on the external data, whose class mix is mostly cancer). Kernel bandwidths are computed from training samples only.
- Apply once. No tuning, threshold change or re-run after seeing external results.
- **Report:** sensitivity on the external cancers at the default threshold, specificity on the external normals, and AUC with a bootstrap 95% interval, labelled descriptive because of the very small number of normals.
- Expected: high sensitivity; the platform change (Affymetrix → Agilent) may shift scores, which this check is designed to reveal rather than hide.

## 8 · Optional: IBM quantum hardware

If time allows, a stratified subset of T1 samples (target 24: 12 cancer, 12 normal) is run on IBM hardware with the circuit used for the earlier hardware run (1 Trotter step, bandwidth 0.25). Reported: agreement between hardware and exact Bloch vectors and kernels. This part is exploratory.

## 9 · Intended use

The module is decision support alongside the pathologist. It is never presented as a replacement for histopathology or biopsy reading.

---

## Amendments

*(none yet)*
