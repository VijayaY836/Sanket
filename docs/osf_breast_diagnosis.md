# Analysis plan: breast tissue detection (cancer vs normal) with quantum kernels

**Status:** written on 3 October 2026, before any data were downloaded or any model was run on GSE42568 or GSE10810. Commit this file **before** running the analyses below. Any later change is recorded in the Amendments section with its date and reason.

---

**Summary.** SANKET's oral module detects cancer and precancer from tissue and then predicts progression. This plan adds the same detection step for breast cancer, India's most common cancer, so that detection covers both of India's top two cancers. METABRIC, used for breast relapse prediction, contains tumours only, so detection needs datasets with normal breast tissue. The method is unchanged from the oral analyses: the same 12 MSigDB Hallmark pathways, the same pathway-crosstalk quantum circuit, the same models and the same validation. Results will be reported whichever way they go.

## 1 · Data

| Role | Dataset | Expected samples | Platform |
|---|---|---|---|
| Main | GEO **GSE42568** (Clarke et al., 2013, Dublin): pre-treatment breast cancer biopsies and normal breast tissue | 104 cancer, 17 normal | Affymetrix HG-U133 Plus 2.0 (GPL570) |
| Independent check | GEO **GSE10810**: breast tumours and normal breast tissue from a different laboratory | about 31 cancer, 27 normal (counts confirmed by `--inspect` before any model is run) | as listed on GEO |

- Labels are parsed from GEO sample characteristics with the same patterns as the oral loader (`engine/oral_diagnosis.py`). `--inspect` prints every label source and the counts before anything is scored; samples without exactly one class are excluded and listed.
- Each dataset is mapped from probes to genes and scored on the 12 Hallmark pathways **on its own**. Expression values are never pooled across datasets.
- If an individual contributed more than one sample, cross-validation is grouped by individual (as in the oral analysis).

## 2 · Hypotheses and expectations

| | Question | Expectation stated in advance |
|---|---|---|
| **H1** | Cancer vs normal on GSE42568: projected quantum kernel vs tuned classical RBF kernel (primary), and vs logistic regression, random forest, gradient boosting and the fidelity kernel (secondary) | Every model reaches a high AUC (≥ 0.95). This checks the pipeline; **no quantum advantage is expected**. Projected quantum close to RBF. |
| **H2** | The same task at a screening cut-off | Sensitivity close to the 90% target on held-out folds; specificity reported as found. |
| **H3** | Models trained on all of GSE42568, applied once to GSE10810 | The ranking transfers (AUC well above 0.5). The default cut-off may not; specificity reported as found. |

## 3 · Methods

**H1, registered benchmark** (`python -m engine.classify --task breast_cancer_normal`): repeated stratified 5-fold cross-validation, 10 repeats, `random_state = 11`; equal tuning budgets (inner CV) for every model; kernel bandwidths from training folds only. Metrics: AUC (mean ± SD over folds), sensitivity and specificity at the default threshold. Primary test: projected quantum vs classical RBF, Bouckaert–Frank corrected repeated-CV t-test. Secondary comparisons Holm-corrected.

**H2, screening cut-off** (`python -m engine.breast_detect --screening`): same folds. Within each outer training fold, out-of-fold decision values on the training samples (inner 3-fold) set the highest threshold that reaches at least 90% sensitivity on those samples; it is applied unchanged to the held-out fold. Same rule for every model, the rule used in oral Amendment A2. Reported: sensitivity, specificity, PPV, NPV. Descriptive; no new significance claims.

**H3, independent check** (`python -m engine.breast_detect --external`): trained on all GSE42568 cancer and normal samples, hyperparameters by inner CV on GSE42568 only, applied **once** to GSE10810 with no tuning or threshold change. Each dataset is standardised on its own (z-score of each pathway's raw score over that dataset's samples), the correction established in oral Amendment A1 because the stored ssGSEA NES is dataset-relative. Reported: AUC with a bootstrap 95% interval, sensitivity and specificity at the default threshold, and a label-free biology check (direction of the cancer minus normal mean score per pathway in each dataset). Descriptive.

## 4 · What will be reported

All three results, whichever way they go, in `out/results_classify_breast_cancer_normal.json`, `out/results_breast_screening.json` and `out/results_breast_external.json`, and in the README. If the quantum kernel ties classical, it is reported as a tie.

## 5 · Limitations known in advance

- 17 normal samples in the main cohort: specificity estimates will be noisy.
- Normal breast tissue in these datasets may be adjacent to tumour or from reduction surgery; this differs between studies and may affect transfer.
- Neither dataset is from Indian patients. An Indian breast cohort through a clinical partner remains a roadmap item.
- Detection on tissue supports the pathologist; it does not replace reading the biopsy.

## Amendments

### N1 · 3 October 2026 · Inspection notes (before any scoring)

- GSE42568: 104 cancer, 17 normal, all labelled, no repeated individuals. Matches the plan.
- GSE10810: 31 cancer, 27 normal, all labelled. Many samples are tumour–normal pairs from the same women ("Tumor paired N" in the sample text), which the loader does not detect as repeated individuals. This does not affect H3: the check is applied once with no cross-validation, so pairing cannot leak information between training and testing. The bootstrap 95% interval treats samples as independent and is therefore slightly optimistic; it is reported as descriptive.