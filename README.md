<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png"/>
  <img src="docs/logo.png" alt="SANKET: Quantum Intelligence for Cancer Prevention" width="380"/>
</picture>

### Hybrid quantum machine learning for early cancer detection, run on real IBM quantum hardware, with an honest test of when quantum actually helps

[![Smart India Hackathon 2026](https://img.shields.io/badge/Smart%20India%20Hackathon-2026-1f3864)](https://sih.gov.in)
[![Problem Statement](https://img.shields.io/badge/PS-SIH26139-5b4bc4)](#overview)
[![IBM Quantum](https://img.shields.io/badge/IBM%20Quantum-ran%20on%20ibm__fez-0f62fe)](#run-on-ibm-quantum-hardware)
[![Qiskit](https://img.shields.io/badge/Qiskit-2.x-6929c4)](https://www.ibm.com/quantum/qiskit)
[![Python](https://img.shields.io/badge/Python-3.10%E2%80%933.12-3776ab)](https://www.python.org)
[![React](https://img.shields.io/badge/React-18-149eca)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org)
[![Pre-registered](https://img.shields.io/badge/analyses-pre--registered%20on%20OSF-13807e)](https://osf.io)
[![Status](https://img.shields.io/badge/status-research%20prototype-a86e0a)](#limitations-and-intended-use)
[![License: MIT](https://img.shields.io/badge/license-MIT-2b7a3d)](LICENSE)

**Team Yukthi6G** (Team ID 165798) · BVRIT Hyderabad College of Engineering for Women

[At a glance](#at-a-glance) ·
[Overview](#overview) ·
[Key results](#key-results) ·
[Detect](#detecting-oral-cancer-and-dysplasia-from-tissue) ·
[How SANKET compares](#how-sanket-compares) ·
[IBM hardware run](#run-on-ibm-quantum-hardware) ·
[App tour](#the-web-application) ·
[Architecture](#system-architecture) ·
[Quick start](#quick-start) ·
[Reproducing](#reproducing-the-study) ·
[Limitations](#limitations-and-intended-use)

<br/>

<img src="docs/screenshots/overview.jpg" alt="SANKET overview: a scroll-driven story that follows one biopsy from 20,000 genes to a quantum risk estimate" width="900"/>

</div>

---

## At a glance

| | |
|---|---|
| **Problem statement** | SIH26139: Hybrid Quantum Machine Learning Platform for Early Disease Detection (Egreen Quanta) · MedTech / BioTech / HealthTech · Software |
| **Clinical problem** | About 1 in 5 oral precancers (leukoplakia) becomes cancer, and doctors cannot tell which. SANKET first reads the tissue (normal, dysplasia or cancer?), then estimates which precancers will progress, and when. |
| **Idea** | Compress ~20,000 genes into 12 biological pathways, encode one pathway per qubit, and wire the qubits like the biology (pathways that share genes interact). |
| **Quantum model** | Projected quantum kernel on a Hamiltonian (Trotterised) feature map, inside a kernel-weighted survival model |
| **Real data** | 2,394 samples across three cancers: 86 oral precancer with follow-up (GEO GSE26549), 229 oral tissue biopsies labelled normal, dysplasia or cancer (GSE30784), 32 oral tissues from Tata Memorial Centre, Navi Mumbai (GSE23558, independent check), 1,975 breast cancer (METABRIC), 72 leukaemia (Golub) |
| **Detect** | Normal, dysplasia or cancer from oral tissue: AUC **0.98** cancer vs normal and **0.95** dysplasia vs normal (projected quantum kernel), tied with classical as registered in advance. Upload your own gene-activity file and it is scored on the 12 pathways in the browser. |
| **Run on IBM quantum hardware** | All 86 oral-cohort patients on IBM's 156-qubit Heron processor `ibm_fez`: 1,024 shots each, 49 two-qubit gates per circuit, **0.98 agreement** between the hardware kernel and exact simulation |
| **Honest result** | On real clinical outcomes the quantum kernel matches classical methods (METABRIC C-index 0.582 vs 0.582, p = 0.98; oral diagnosis ties on all three tasks). On data with quantum structure it wins decisively (AUC 0.97 vs 0.66 with 50 patients). Models trained on a US cohort did **not** transfer to the Indian cohort, and we report it. |
| **Why parity** | At the setting cross-validation chooses, the qubits barely entangle (mean Bloch-vector length 0.994; 1 = no entanglement). Quantum structure is available, but these outcomes do not reward it. |
| **Hardware efficiency** | ~5× fewer two-qubit gates than the standard ZZ feature map on IBM Heron (188 vs 906); the projected kernel's circuit count grows linearly with patients, not with patient pairs |
| **Working prototype** | React + TypeScript web app with an exact 12-qubit simulator in the browser (matches Qiskit to 10⁻¹⁵), a Detect page for oral tissue with gene-activity upload (ssGSEA in the browser, matches gseapy to 3 × 10⁻⁴), patient case files, HL7 FHIR R4 export, and a Quantum Readiness Check for any dataset |
| **Rigour** | Equal tuning budgets, nested and repeated cross-validation, Holm-corrected tests, analysis plans pre-registered on OSF before outcomes were examined |

---

## Overview

About one in five oral precancers (leukoplakia) turns into cancer, and under the microscope the lesions that will progress look the same as those that will not. India carries one of the world's highest burdens of oral cancer, and most cases are diagnosed late. SANKET reads the gene activity in a biopsy, encodes it into a quantum circuit **wired like the biology itself**, and estimates whether and when a lesion will become cancer.

Most quantum machine learning projects report high accuracy on easy benchmarks and stop there. SANKET is built around a harder question: **does the quantum part actually help, and how would we know?** Every quantum model is compared against classical models with the same tuning budget, analysis plans are registered publicly before outcomes are examined, a geometric-difference test checks in advance whether quantum has any room to help on a given dataset, and the model has been run end to end on a real IBM quantum processor.

**How it works, in three steps**

1. **Compress the biology.** ~20,000 genes → ssGSEA → 12 MSigDB Hallmark pathways (cell growth, DNA repair, hypoxia, inflammation and others), chosen from cancer biology and never from outcomes.
2. **Encode on qubits.** One pathway per qubit. Two qubits interact only where their pathways share genes, so the circuit's shape is the biology's shape.
3. **Predict, explain, refer.** Similar quantum states mean similar futures: a kernel-weighted Kaplan–Meier model gives a cancer-free curve, a risk at the clinical horizon, the pathways driving it and the most similar past patients, and it refuses to predict when too few similar patients exist.

---

## Key results

All numbers come from real patient data. Survival analyses use Harrell's concordance index (C-index); diagnosis tasks use ROC AUC. Quantum and classical models receive identical tuning budgets, chosen inside cross-validation.

### Quantum versus classical on real outcomes

| Task | Data | Patients | Projected quantum kernel | Classical RBF kernel | Best classical model | Verdict |
|---|---|---:|---:|---:|---|---|
| Oral cancer progression | GEO GSE26549 | 86 | 0.601 | 0.613 | 0.643 · elastic-net Cox | Parity |
| Breast cancer relapse | METABRIC | 1,975 | 0.582 | 0.582 | 0.662 · clinical NPI + pathways | Exact parity (p = 0.98) |
| Breast cancer subtype (basal-like) | METABRIC | 1,200 | 0.885 | 0.913 | 0.925 · logistic regression | Classical ahead |
| Leukaemia diagnosis (AML vs ALL) | Golub et al. 1999 | 72 | 0.857 | 0.903 | 0.941 · logistic regression | Classical ahead |

Oral cohort, nested leave-one-out (bandwidth re-chosen inside every fold): projected quantum 0.554, fidelity quantum 0.568, classical RBF 0.580, with overlapping 95% bootstrap intervals.

<p align="center">
  <img src="out/figures/cindex_forest.png" alt="Oral cohort C-index, repeated cross-validation, for the quantum and classical models" width="47%"/>
  <img src="out/figures/metabric_size_curve.png" alt="METABRIC data-size curve: test C-index against training patients" width="47%"/>
</p>
<p align="center"><sub>Left: oral cohort, 20×5 repeated cross-validation. Right: METABRIC, C-index as the training set grows from 50 to 1,600 patients.</sub></p>

### Detecting oral cancer and dysplasia from tissue

Before predicting whether a precancer will progress, SANKET reads the tissue itself, with the same 12 pathways and the same quantum circuit. The analysis plan ([`docs/osf_oral_diagnosis.md`](docs/osf_oral_diagnosis.md)) was written before any model was run: GSE30784 (Fred Hutchinson Cancer Research Center, 229 biopsies), repeated stratified 5-fold cross-validation with 10 repeats, equal tuning budgets, projected quantum kernel against a tuned classical RBF kernel as the primary test (Bouckaert–Frank corrected t-test, Holm-corrected). Datasets are scored separately and never pooled.

| Task | Samples | Projected quantum AUC | Classical RBF AUC | Best classical | Quantum vs RBF | Verdict |
|---|---|---|---|---|---|---|
| Cancer vs normal | 167 vs 45 | **0.980** ± 0.026 · sensitivity 97%, specificity 86% | 0.985 | 0.990 · random forest | p = 0.72 | Tie |
| Dysplasia vs normal | 17 vs 45 | **0.953** ± 0.051 · sensitivity 51%, specificity 96% | 0.957 | 0.977 · logistic regression | p = 0.83 | Tie |
| Cancer vs dysplasia | 167 vs 17 | **0.753** ± 0.141 · sensitivity 99%, specificity 7% | 0.813 | 0.871 · random forest | p = 0.22 | Tie |

- **Cancer vs normal** works as a ranking and as a yes/no call, for every model. It confirms the pipeline; nobody expected quantum to win it.
- **Dysplasia vs normal** ranks well, but at the default threshold the quantum model catches only 51% of dysplasias. A screening threshold chosen for sensitivity is planned as a declared amendment.
- **Cancer vs dysplasia** is not usable yet: with 167 cancers against 17 dysplasias, every model labels nearly all dysplasias as cancer.

**Independent check on Indian patients.** The cancer-vs-normal models were applied once, unchanged, to GSE23558 from the Advanced Centre for Treatment, Research and Education in Cancer (ACTREC), Tata Memorial Centre, Navi Mumbai: 27 cancers and 5 normals on a different microarray platform (Agilent GPL6480 vs Affymetrix GPL570). **They did not transfer.** Every model called almost everything cancer or almost everything normal (projected quantum: sensitivity 78%, specificity 0%; classical RBF: 100% and 0%). The likely cause is the platform change, but with only 5 normals nothing firmer can be said. This is why SANKET's roadmap needs Indian training data from a clinical partner rather than a model trained abroad, and why the app never mixes scores across datasets.

<p align="center">
  <img src="docs/screenshots/detect-results.jpg" alt="Registered oral diagnosis results: quantum and classical tie on all three tasks" width="90%"/>
</p>

### Where quantum wins

| Result | Evidence |
|---|---|
| **Decisive accuracy win on quantum-structured data** | On labels engineered to carry quantum structure over real METABRIC features (Huang et al., 2021; geometric difference *g* = 6.75), the quantum kernel reaches **AUC 0.902 with 25 training patients and 0.967 with 50**, versus 0.614 and 0.731 for the best of four tuned classical models, and stays ahead at 400 patients (0.999 vs 0.906). Labels are synthetic by construction: this is the positive control that proves the pipeline can detect an advantage when one exists. |
| **Run on real quantum hardware** | 86 patients on IBM `ibm_fez`; the kernel built from hardware measurements agrees with exact simulation at 0.98 ([details](#run-on-ibm-quantum-hardware)). |
| **~5× cheaper circuits** | Like-for-like on IBM Heron, SANKET's fidelity-kernel circuit needs **188 two-qubit gates** versus **906** for the standard full ZZ feature map (estimated fidelity 0.48 vs 0.04). The projected kernel needs 94 with two Trotter steps, and 49 with the one-step circuit that ran on hardware. |
| **Better than the standard quantum approach** | The projected kernel beats the standard fidelity kernel on the oral cohort (p ≈ 0.002, Holm-corrected) and matches or beats it on every task, while needing half the gates. |
| **Linear, not quadratic, circuit cost** | The projected kernel needs three measurement settings per patient (258 circuits for 86 patients) instead of one circuit per patient pair (3,655): 14× fewer at 86 patients, ~329× fewer at 1,975. On IBM Runtime the Estimator runs this as one job entry per patient. |
| **Robust to noise** | In noisy simulation at 3% two-qubit gate error, the gentle encodings lose at most 0.011 C-index on METABRIC. |

<p align="center">
  <img src="out/figures/advantage_curve.png" alt="Engineered quantum-structured labels versus the real outcome: quantum kernel against four tuned classical models" width="90%"/>
</p>
<p align="center"><sub>Left: on quantum-structured labels the quantum kernel (blue) wins at every training size. Right: on the real outcome, all models sit together.</sub></p>

### Why the quantum kernel ties on real outcomes

At the bandwidth that cross-validation selects (0.25), each qubit's Bloch vector keeps almost its full length: the mean length is **0.994** on the oral cohort, where 1 means no entanglement at all. The quantum kernel therefore behaves much like a classical kernel on the same 12 pathway scores, which is exactly what the results show. The same circuit at bandwidth 1 shortens the arrows to **0.685**, so the entanglement is available, but the real outcome does not reward it. The app shows this side by side on the Constellation page, and the Quantum Readiness Check reaches the same verdict independently (headroom *g* = 3.28, but quantum and classical within 0.02 AUC on the outcome: "choose classical").

Declared exploratory upgrades (gentler encodings, per-qubit kernel training, entanglement ablation, hybrid kernels) did not close the gap on real tasks, indicating that the signal in these datasets is predominantly linear. This is consistent with the largest systematic review of the field (Gupta et al., *npj Digital Medicine*, 2025).

### Clinical usefulness

| Measure (oral cohort, 3-year horizon) | Projected quantum | Classical RBF | Elastic-net Cox |
|---|---:|---:|---:|
| C-index (out-of-fold) | 0.587 | 0.598 | 0.620 |
| Referral rule set to catch ≥ 90% of progressions: patients referred | 84% | 90% | 78% |
| Cancer-free if not referred (NPV) | 86% | 76% | 89% |

On METABRIC (5-year relapse), adding the 12 pathways to the clinical Nottingham Prognostic Index model raises the C-index from 0.639 to 0.662 (repeated cross-validation). Calibration, Brier scores and decision curves for both cohorts are in `out/results_clinical_*.json` and shown on the Evidence page. Across METABRIC's five recruitment cohorts (leave-one-cohort-out), the quantum kernel scores 0.595 on average against 0.587 for the classical kernel.

---

## Run on IBM quantum hardware

The full oral cohort was run on **IBM `ibm_fez`**, a 156-qubit IBM Heron processor, through Qiskit Runtime (EstimatorV2, Batch mode, TREX readout mitigation). Each patient is one circuit; the Estimator measures the 36 single-qubit expectations ⟨X⟩, ⟨Y⟩, ⟨Z⟩ on 12 qubits, which are exactly the Bloch vectors the projected kernel needs.

| Job | Cohort | Patients | Shots | Two-qubit gates (depth) | Measured vs exact Bloch vectors | Hardware vs exact kernel |
|---|---|---:|---:|---|---|---|
| `davbc6il7guc73cekc8g` | Oral precancer (GSE26549) | **86** | 1,024 | 48.7 (19) | correlation **0.961** · mean error 0.174 per qubit | agreement **0.979** · C-index 0.566 vs 0.593 |
| `davbao04oijs73e799p0` | Oral precancer, pilot | 8 | 1,024 | 49 (19) | correlation 0.959 | – |
| `davjuitj371s73dn2570` | METABRIC breast cancer | 8 | 1,024 | – | correlation 0.991 · mean error 0.105 per qubit | – |

The circuit that ran uses one Trotter step at bandwidth 0.25, as the noise study recommends: about half the two-qubit gates of the two-step circuit with the same accuracy. The gap between the two C-indices (0.566 vs 0.593, same 86 patients, leave-one-out) measures what hardware noise costs; it is not a separate accuracy claim. Job records and measured vectors are stored in `out/cohort.json`, `out/metabric_cohort.json` and `out/hardware_<job>.json`. (`out/hardware_65089b68…json` and `out/hardware_f3905f65…json` are local noisy-simulator dry runs, labelled as such.)

<p align="center">
  <img src="docs/screenshots/hardware.jpg" alt="Hardware page: 86 patients run on ibm_fez, 0.98 hardware versus simulated kernel agreement, 49 two-qubit gates per circuit" width="49%"/>
  <img src="docs/screenshots/hardware-measured.jpg" alt="Measured Bloch vectors from ibm_fez for one patient, against the exact simulated state" width="49%"/>
</p>
<p align="center"><sub>Left: the Hardware page. Right: one patient's 12 qubits as measured on <code>ibm_fez</code> (solid) against the exact simulated state (dashed).</sub></p>

---

## The web application

A React + TypeScript app that re-simulates every patient live from the loaded cohort file. Every number on screen is computed from the data; synthetic data and engineered labels are labelled on every screen. Interior pages open with a darkfield hero card carrying live figures, and panels animate in as you scroll. Light and dark themes, responsive down to phone width, and the wording follows the loaded disease (oral precancer, breast cancer, or any other cohort).

### Overview: one biopsy, followed through SANKET

A scroll-driven story: a particle system morphs from tissue to genes, pathways, qubits, the circuit, the patient constellation and two diverging futures, ending with the evidence and the hardware run.

<p align="center">
  <img src="docs/screenshots/overview-circuit.jpg" alt="Story chapter: each patient runs through the circuit" width="49%"/>
  <img src="docs/screenshots/overview-proof.jpg" alt="Story finale: tested honestly, run on real quantum hardware" width="49%"/>
</p>

### Detect: normal, dysplasia or cancer?

The first step of the clinical path. All 229 GSE30784 biopsies are simulated live as 12-qubit states and placed on a map by quantum similarity alone (the labels are never used to position them). Pick any sample to see its twelve qubits, the diagnosis its quantum neighbours suggest and how its pathways differ from normal tissue, then reveal the pathologist's diagnosis, including the cases where the estimate is wrong. A "Try a sample" panel lets you move a sample's pathway scores with sliders, or paste 12 scores, and watch where it lands. The registered results and the failed Indian transfer are shown on the same page.

<p align="center">
  <img src="docs/screenshots/detect.jpg" alt="Detect page: normal, dysplasia or cancer, with registered AUCs" width="90%"/>
</p>
<p align="center">
  <img src="docs/screenshots/detect-map.jpg" alt="Quantum similarity map of 229 oral tissue samples, and the pathways that change from normal to cancer" width="49%"/>
  <img src="docs/screenshots/detect-sample.jpg" alt="One dysplasia sample: twelve Bloch spheres, the quantum-neighbour estimate and the revealed diagnosis" width="49%"/>
</p>

**Use your own data.** Upload a gene-activity table (CSV or TSV): gene symbols in the first column, one column per sample, and a row named `diagnosis` with normal, dysplasia or cancer for the reference samples. Leave the diagnosis empty for the patients you want estimated.

```
gene,      S1,     S2,        S3,     P1
diagnosis, normal, dysplasia, cancer,
TP53,      7.21,   7.80,      8.93,   8.10
MYC,       6.02,   6.55,      7.41,   7.02
…          (500+ genes)
```

The browser scores every sample on the 12 Hallmark pathways with ssGSEA (`web/src/lib/ssgsea.ts`, the same rank-normalised method the engine runs through gseapy, matching it to 3 × 10⁻⁴ after standardisation on test data), simulates the quantum states and places the unlabelled patients among your labelled samples. The file never leaves the device. Patients are compared **only with labelled samples from the same file**, because scores from different platforms or labs do not line up (the failed Indian transfer above). A scored file can be downloaded and re-loaded, and a JSON written by `python -m engine.oral_diagnosis --accession GSE…` loads the same way for probe-level GEO data. Estimates on uploaded data are illustrative, never a diagnosis.

<p align="center">
  <img src="docs/screenshots/detect-upload.jpg" alt="Upload gene activity or pathway scores, with the file format explained" width="90%"/>
</p>

### Patient case

A biopsy case file: an animated pipeline (genes → pathways → qubits → risk), the predicted cancer-free curve, a referral tier, the pathways driving the risk, the most similar past patients, live what-if sliders, an outcome reveal, and an HL7 FHIR R4 DiagnosticReport export.

<p align="center">
  <img src="docs/screenshots/patient-case.jpg" alt="Patient case file with risk ring and analysis stages" width="49%"/>
  <img src="docs/screenshots/patient-case-detail.jpg" alt="Patient case detail: predicted future, why this risk, similar patients and what-if sliders" width="49%"/>
</p>
<p align="center">
  <img src="docs/screenshots/fhir.jpg" alt="HL7 FHIR R4 DiagnosticReport generated for a patient" width="60%"/>
</p>

### Constellation

Twelve Bloch spheres per patient, compared qubit by qubit with the most similar progressor or stable patient, and the entanglement comparison: mean arrow length at the chosen bandwidth against the same circuit at bandwidth 1.

<p align="center">
  <img src="docs/screenshots/constellation.jpg" alt="Constellation page hero: every patient as 12 qubits" width="49%"/>
  <img src="docs/screenshots/constellation-entanglement.jpg" alt="How entangled are these states: 0.994 at the chosen bandwidth versus 0.685 at bandwidth 1" width="49%"/>
</p>

### Circuit and noise

Gate-by-gate circuit step-through for any patient, the hardware cost table on IBM Heron (including the circuit that ran on `ibm_fez`), depolarising-noise and finite-shot laboratories with kernel repair, and an expressivity-versus-noise comparison.

<p align="center">
  <img src="docs/screenshots/circuit.jpg" alt="Feature map circuit for one patient, with Bloch spheres after each step" width="49%"/>
  <img src="docs/screenshots/hardware-cost.jpg" alt="Hardware cost on IBM Heron: SANKET topology against all-to-all and the standard ZZ map" width="49%"/>
</p>

### Evidence

Opens with five findings that pin and stack as you scroll (performance, why parity, quantum headroom, hardware, clinical rule), then the detail: nested cross-validation forest plot, calibration, decision curves and a screening-first referral threshold, qubit-count curve, geometric difference, Kaplan–Meier risk groups with log-rank test, data-size curve and kernel heatmaps.

<p align="center">
  <img src="docs/screenshots/evidence.jpg" alt="Evidence page hero with live C-indices and the stacked findings" width="49%"/>
  <img src="docs/screenshots/evidence-stack.jpg" alt="Stacked finding cards: why parity, and quantum headroom" width="49%"/>
</p>
<p align="center">
  <img src="docs/screenshots/evidence-clinical.jpg" alt="Would it help a clinician: calibration, decision curve and screening threshold" width="49%"/>
  <img src="docs/screenshots/evidence-riskgroups.jpg" alt="Geometric difference and Kaplan–Meier risk groups" width="49%"/>
</p>

### When quantum wins

A live engineered-advantage experiment on the loaded cohort, the full engine benchmark, and the diagnosis-task tables.

<p align="center">
  <img src="docs/screenshots/advantage.jpg" alt="When quantum wins page" width="49%"/>
  <img src="docs/screenshots/advantage-live.jpg" alt="Live engineered-advantage experiment result" width="49%"/>
</p>

### Quantum Readiness Check

Upload any CSV (or try a sample) and get a **go / wait / classical** verdict on whether quantum is worth the cost: label-free encoding search, quantum headroom (geometric difference), a learning test on labels with quantum structure, a held-out comparison on the real outcome against tuned RBF and linear models, hardware cost, and a downloadable report. Includes a positive control that must come out "go". Everything runs in the browser; the file never leaves the device. The same check runs in Python (`python -m engine.readiness`).

<p align="center">
  <img src="docs/screenshots/readiness-verdict.jpg" alt="Readiness check verdict on the oral cohort: quantum matches classical, choose classical" width="49%"/>
  <img src="docs/screenshots/readiness-headroom.jpg" alt="Readiness check: quantum headroom and what an advantage would look like" width="49%"/>
</p>

### Hardware and Data

The Hardware page shows the circuit budget, the IBM job record and measured versus simulated Bloch vectors. The Data page loads cohort files, generates synthetic cohorts, and verifies the browser simulator against Qiskit.

<p align="center">
  <img src="docs/screenshots/hardware-record.jpg" alt="Circuit budget and IBM hardware job record" width="49%"/>
  <img src="docs/screenshots/data.jpg" alt="Data page: one pipeline, any cohort" width="49%"/>
</p>

### Dark theme and phone

<p align="center">
  <img src="docs/screenshots/dark-constellation.jpg" alt="Constellation page in the dark theme" width="58%"/>
  <img src="docs/screenshots/phone.jpg" alt="Overview, patient case and hardware pages at phone width" width="38%"/>
</p>

| Screen | What it shows |
|---|---|
| **Overview** | Scroll story from biopsy to quantum risk, two patients with the same clinical picture and diverging futures, headline evidence |
| **Patient case** | Pipeline animation, survival curve, referral tier, pathway attributions, similar patients, what-if sliders, outcome reveal, HL7 FHIR R4 export |
| **Constellation** | Twelve Bloch spheres per patient, qubit-by-qubit comparison, entanglement at the chosen versus a wider bandwidth |
| **Circuit and noise** | Circuit step-through, IBM Heron cost table with the circuit that ran on hardware, noise and finite-shot laboratories, kernel repair |
| **Evidence** | Stacked findings, forest plot, calibration, decision curves, screening threshold, qubit-count curve, geometric difference, risk groups, data-size curve, kernel heatmaps |
| **When quantum wins** | Live engineered-advantage experiment, engine benchmark, diagnosis tasks |
| **Readiness check** | Go / wait / classical verdict for any uploaded dataset, with a downloadable report |
| **Hardware** | Circuit budget, IBM job record, measured versus simulated Bloch vectors, why hardware and Evidence scores differ |
| **Data** | Load cohorts, generate synthetic data, verify the browser simulator against Qiskit |

---

## How SANKET compares

Many quantum machine learning prototypes for healthcare follow one pattern: a public benchmark dataset (breast cancer, diabetes, heart disease) or an image classifier with a small quantum layer, a single train/test split, and a headline such as "98% accuracy, quantum beats classical". SANKET is built to answer the question those projects skip.

| | Typical quantum-ML health prototype | SANKET |
|---|---|---|
| **Data** | One public benchmark | 2,394 real samples, five cohorts, three cancers, including an Indian cohort (Tata Memorial Centre) |
| **Clinical question** | One prediction | The full path: detect (normal / dysplasia / cancer), predict progression and timing, explain and refer |
| **Quantum design** | Generic feature map | One pathway per qubit, entangled only where pathways share genes; ~5× fewer two-qubit gates than the standard ZZ map |
| **Quantum hardware** | Simulator only | 86 patients on IBM `ibm_fez` (156-qubit Heron), kernel agreement 0.98 with simulation |
| **Comparison** | Untuned or no classical baseline | Four tuned classical models, equal budgets, nested and repeated CV, corrected tests with Holm correction |
| **Reporting** | Best number | Analysis plans registered before results; ties and failures reported (oral diagnosis ties, Indian transfer failed) |
| **When to use quantum** | Assumed | Quantum Readiness Check: go / wait / classical for any dataset, with a positive control |

**Where we are still weaker, and what we are doing about it**

- **The input.** A doctor in a district hospital has a biopsy slide, a photograph and a history, not a whole-genome expression profile, which needs a specialised lab. Next step: test whether a small, fixed gene panel (a few dozen genes across the 12 pathways, measurable by qPCR or a targeted panel at a fraction of the cost) reproduces the pathway scores and the diagnosis results on GSE30784, with the analysis plan written first.
- **No quantum win on real outcomes yet.** The tie is the correct finding at this data size, and we show why (the qubits barely entangle at the bandwidth cross-validation selects). The engineered positive control shows the pipeline would detect an advantage if one existed.
- **Transfer across platforms.** Models trained on US data failed on the Indian cohort. The fix is Indian training data through a clinical partner, not more tuning.

---

## System architecture

```mermaid
flowchart TB
    subgraph SRC["① Public data sources"]
        direction LR
        GEO["NCBI GEO<br/>GSE26549 · oral precancer"]
        CBP["cBioPortal<br/>METABRIC · breast cancer"]
        GOL["Golub 1999<br/>leukaemia"]
        MSIG["MSigDB<br/>Hallmark gene sets"]
        GEO ~~~ CBP ~~~ GOL ~~~ MSIG
    end

    subgraph ENG["② Research engine · Python + Qiskit"]
        direction LR
        LOAD["Loaders<br/>probe → gene"] --> SSG["ssGSEA<br/>12 pathway scores"]
        SSG --> FM["Hamiltonian feature map<br/>12 qubits · crosstalk wiring"]
        XT["Crosstalk graph<br/>shared genes"] --> FM
        FM --> KER["Quantum kernels<br/>projected · fidelity"]
        SSG --> CLS["Classical baselines<br/>RBF · Cox · RSF · GBM"]
        KER --> BEN["Fair benchmark<br/>nested + repeated CV"]
        CLS --> BEN
        KER --> ADV["Advantage test<br/>geometric difference"]
        FM --> HW["Hardware runner<br/>Qiskit Runtime"]
    end

    subgraph OUT["③ Portable artefacts"]
        direction LR
        COH[("cohort.json<br/>pathways · outcomes · graph · hardware jobs")]
        RES[("results*.json<br/>statistics · figures")]
        COH ~~~ RES
    end

    subgraph APP["④ Web application · React + TypeScript"]
        direction LR
        SIM["In-browser 12-qubit<br/>statevector simulator"] --> VIEWS["Patient case · Constellation<br/>Evidence · When quantum wins<br/>Hardware · Readiness check"]
        VIEWS --> FHIR["HL7 FHIR R4<br/>clinical report"]
    end

    IBM(["IBM Quantum<br/>Heron QPU · ibm_fez"])
    OSF(["OSF Registries<br/>pre-registered plans"])

    SRC --> ENG
    ENG --> OUT
    OUT --> APP
    ENG <-- "circuits · measured Bloch vectors" --> IBM
    OSF -. "plans fixed before outcome analysis" .-> ENG

    classDef src fill:#eaf1fb,stroke:#2e75b6,color:#1f3864
    classDef eng fill:#f3eefb,stroke:#5b4bc4,color:#211b45
    classDef out fill:#fff7e6,stroke:#a86e0a,color:#4a3405
    classDef app fill:#e6f6f4,stroke:#13807e,color:#0b3d3c
    classDef ext fill:#ffffff,stroke:#d4436e,color:#7a1c3a
    class GEO,CBP,GOL,MSIG src
    class LOAD,SSG,XT,FM,KER,CLS,BEN,ADV,HW eng
    class COH,RES out
    class SIM,VIEWS,FHIR app
    class IBM,OSF ext
    style SRC fill:#f7f9fc,stroke:#2e75b6,stroke-width:1px,color:#1f3864
    style ENG fill:#faf8ff,stroke:#5b4bc4,stroke-width:1px,color:#211b45
    style OUT fill:#fffcf5,stroke:#a86e0a,stroke-width:1px,color:#4a3405
    style APP fill:#f5fbfa,stroke:#13807e,stroke-width:1px,color:#0b3d3c
```

**Design principles**

- **One source of truth.** The engine writes a portable `cohort.json`; the app re-simulates every patient from it, so the demo and the reported numbers can never disagree.
- **Heavy work offline, interaction live.** Statistics at scale and hardware runs happen in the engine; the browser runs the exact 12-qubit simulation, kernels and survival model interactively.
- **Verification at every boundary.** The TypeScript simulator, the batched NumPy simulator and Qiskit `Statevector` agree to 10⁻¹⁵, and the Python Readiness Check reproduces the web page to floating-point precision.
- **Honesty by construction.** Synthetic data, engineered labels and simulated hardware runs are labelled as such; registered and exploratory results are kept separate.

### The quantum feature map

Each patient's 12 pathway z-scores become rotation angles $x_k = s \cdot \tfrac{\pi}{2}\tanh(z_k/2)$, where the bandwidth $s$ is chosen by cross-validation. The circuit implements Trotterised evolution under

$$H(\mathbf{x}) = \sum_k x_k Z_k + \sum_{(i,j)\in E} x_i x_j\, Z_i Z_j + \beta \sum_k X_k$$

where the coupling graph $E$ is the **pathway crosstalk graph**: two qubits interact only if their pathways share genes. On GSE26549 this graph recovers known biology, linking the cell-cycle programmes (MYC, E2F, G2/M) and the inflammatory programmes (TNF-α, inflammatory response, p53) without ever seeing patient outcomes.

```mermaid
flowchart LR
    A["|0⟩<sup>⊗12</sup>"] --> B["H on<br/>every qubit"]
    B --> C["R<sub>Z</sub>(2x<sub>k</sub>)<br/>pathway activity"]
    C --> D["R<sub>ZZ</sub>(2x<sub>i</sub>x<sub>j</sub>)<br/>on crosstalk edges"]
    D --> E["R<sub>X</sub>(2β)<br/>mixing"]
    E -->|"repeat · 1–2 Trotter steps"| C
    E --> F["Measure X, Y, Z<br/>per qubit"]
    F --> G["Bloch vectors<br/>→ projected kernel"]
```

**Projected quantum kernel.** $k(\mathbf{x},\mathbf{x}') = \exp\big(-\gamma \sum_k \lVert \mathbf{r}_k(\mathbf{x}) - \mathbf{r}_k(\mathbf{x}')\rVert^2\big)$, where $\mathbf{r}_k$ is the Bloch vector of qubit $k$. It needs only single-qubit measurements and stays positive semi-definite even under shot noise; noise-damaged fidelity kernels are repaired by projection onto the positive semi-definite cone.

**Survival model.** A kernel-weighted Kaplan–Meier (Beran) estimator over the 15 most similar patients gives a full cancer-free survival curve, a risk at the clinical horizon (3 years for oral precancer, 5 years for breast cancer), pathway attributions and the nearest past cases, and abstains when too few similar patients exist.

### Hardware cost on IBM Heron

Qiskit 2.5 transpilation (optimisation level 3, best of 8 seeds) onto IBM Heron using the FakeFez calibration snapshot, on the real 14-edge crosstalk graph. Estimated fidelity is the product of calibrated gate and readout success rates.

| Encoding (12 qubits) | Kernel | Two-qubit gates | Two-qubit depth | Fidelity |
|---|---|---:|---:|---:|
| **SANKET pathway topology, 2 Trotter steps** | Projected | **94** | 33 | 0.67 (estimated) |
| **SANKET pathway topology, 2 Trotter steps** | Fidelity | **188** | 70 | 0.48 (estimated) |
| All-to-all Hamiltonian, 2 steps | Projected | 433 | 151 | 0.21 (estimated) |
| Standard ZZ feature map (full), 2 reps | Fidelity | 906 | 333 | 0.04 (estimated) |
| **SANKET, 1 Trotter step: run on `ibm_fez`** | Projected | **49** | 19 | measured: 0.96 correlation with exact |

---

## Repository structure

```
sanket/
├── engine/                       Research engine (Python, Qiskit)
│   ├── config.yaml               Oral cohort settings (registered)
│   ├── config_metabric.yaml      Breast cohort settings (registered)
│   ├── featuremap.py             Qiskit feature map and Bloch vectors
│   ├── fastsim.py                Batched NumPy simulator, verified against Qiskit
│   ├── data.py, inspect_geo.py, build.py     GEO loading → cohort.json
│   ├── metabric.py               METABRIC loading → cohort.json
│   ├── golub.py                  Golub leukaemia loading
│   ├── pathways.py, crosstalk.py ssGSEA scoring and crosstalk graph
│   ├── model.py                  Kernels, Beran survival, C-index, nested CV
│   ├── benchmark.py              Oral benchmark: nested + repeated CV, baselines, tests
│   ├── scale.py                  Large-cohort evaluation and data-size curve
│   ├── classify.py               Diagnosis tasks (incl. oral normal / dysplasia / cancer, external check) and exploratory upgrades
│   ├── oral_diagnosis.py         Oral tissue diagnosis cohorts (GSE30784, GSE23558, any GEO accession) → out/*.json
│   ├── export_detect.py          Bundles the oral diagnosis results and the 12 pathway gene lists for the Detect page
│   ├── advantage.py              Engineered quantum-advantage benchmark
│   ├── clinical.py               Calibration, Brier, decision curves, screening threshold, multimodal
│   ├── shift.py                  METABRIC leave-one-cohort-out validation
│   ├── qubits.py, noise.py       Qubit-count curve and expressivity-versus-noise test
│   ├── readiness.py              Quantum Readiness Check for any CSV (same results as the web page)
│   ├── hardware_run.py           IBM Quantum runs (Estimator, Batch mode) and hardware-versus-simulation analysis
│   ├── hardware.py               Original hardware script (two Trotter steps; superseded by hardware_run.py)
│   ├── resources.py              Gate-count study on IBM Heron
│   └── crosscheck.py             Export for browser-vs-Qiskit verification
├── web/                          Web application (React 18, TypeScript, Vite, Framer Motion)
│   └── src/
│       ├── lib/                  quantum · analysis · survival · clinical · linalg · advantage · readiness · cohort · ssgsea
│       ├── components/           Story, case file, cinematic page heroes and card stack, charts, Bloch spheres
│       ├── data/                 Sample CSV for the Readiness check (Golub), oral Detect bundle, Hallmark gene lists
│       └── views/                One file per screen
├── out/                          Cohorts, results, IBM job records and figures
├── docs/                         OSF registration texts and README screenshots
├── data/                         Downloaded raw datasets (created automatically, not committed)
└── requirements.txt
```

---

## Quick start

**Prerequisites:** Node.js 20+, Python 3.10–3.12, Git.

```bash
git clone https://github.com/VijayaY836/sanket.git
cd sanket
```

### Run the web app

```bash
cd web
npm install
npm run dev              # open the printed localhost link
```

The app opens on a clearly labelled synthetic cohort. Load the real cohorts from the **Data** page: `out/cohort.json` (oral precancer, with the IBM hardware run) or `out/metabric_cohort.json` (breast cancer). `npm run build:single` produces one self-contained HTML file for offline demos.

### Set up the engine

```bash
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m engine.fastsim             # sanity check: differences of about 1e-15 vs Qiskit
```

---

## Reproducing the study

Each step is a single command. Datasets download automatically unless noted.

### 1 · Oral precancer progression (GSE26549)

```bash
python -m engine.inspect_geo          # list sample fields
python -m engine.build                # → out/cohort.json  (86 patients, 35 events)
python -m engine.benchmark --repeats 20
```

### 2 · Breast cancer relapse (METABRIC)

Download *Breast Cancer (METABRIC, Nature 2012 & Nat Commun 2016)* from the cBioPortal Datasets page and unpack it into `data/brca_metabric/`.

```bash
python -m engine.metabric             # → out/metabric_cohort.json  (1,975 patients)
python -m engine.scale                # registered analysis and data-size curve (30–60 min)
```

### 3 · Engineered quantum-advantage benchmark

```bash
python -m engine.advantage --cohort out/metabric_cohort.json
```

### 4 · Diagnosis tasks

```bash
python -m engine.golub                # → out/golub_cohort.json  (72 patients)
python -m engine.classify --task golub
python -m engine.classify --task metabric_basal
python -m engine.classify --task golub --upgrades      # exploratory
```

**Oral tissue diagnosis** (declared in `docs/osf_oral_diagnosis.md`):

```bash
python -m engine.oral_diagnosis --inspect                    # labels, counts, platform, submitter; no model output
python -m engine.oral_diagnosis                              # GSE30784 → out/oral_dx_cohort.json
python -m engine.oral_diagnosis --dataset gse23558           # GSE23558 → out/oral_dx_external_cohort.json
python -m engine.classify --task oral_cancer_normal
python -m engine.classify --task oral_dysplasia_normal
python -m engine.classify --task oral_cancer_dysplasia
python -m engine.classify --task oral_cancer_normal --external   # GSE30784 → GSE23558, run once
python -m engine.export_detect                               # → web/src/data/oral_detect.json and hallmark12.json
python -m engine.oral_diagnosis --accession GSE12345         # any other GEO tissue series, loadable on the Detect page
```

### 5 · Clinical usefulness and cohort shift

Declare first (`docs/osf_clinical_shift.md`), then:

```bash
python -m engine.clinical --cohort out/cohort.json                       # calibration, Brier, decision curves, screening threshold, multimodal
python -m engine.clinical --cohort out/metabric_cohort.json --repeats 1
python -m engine.shift                                                   # METABRIC leave-one-cohort-out
```

### 6 · Qubit count and noise robustness

Declare first (`docs/osf_qubits_noise.md`), then:

```bash
python -m engine.qubits --task survival --cohort out/metabric_cohort.json   # performance vs number of qubits
python -m engine.qubits --task metabric_basal
python -m engine.noise --task survival --cohort out/metabric_cohort.json    # gentle vs expressive encodings under noise
```

### 7 · IBM quantum hardware

```bash
# one-time account setup
python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S; S.save_account(channel='ibm_quantum_platform', token='YOUR_TOKEN', overwrite=True)"

python -m engine.resources                                 # gate counts on IBM Heron
python -m engine.hardware_run --transpile-only --backend fake   # gate counts for the run circuit
python -m engine.hardware_run --backend fake --patients 4  # noisy local dry run (add --record to save it in the cohort file)
python -m engine.hardware_run --backend least_busy --patients 8 # small real run
python -m engine.hardware_run --backend least_busy         # full cohort on a real QPU
python -m engine.hardware_run --fetch JOB_ID --patients 8  # analyse a finished job later, with the original options
```

A real run writes the job record, the measured Bloch vectors and the job each patient came from into the cohort file, so the app's Hardware page shows it. Dry runs on the noise model are never written there unless `--record` is given.

### 8 · Quantum Readiness Check on your own data

```bash
python -m engine.readiness data.csv                                   # outcome and features detected automatically
python -m engine.readiness data.csv --outcome diagnosis --positive AML
python -m engine.readiness data.csv --time os_months --event status --event-level dead --horizon 60
python -m engine.readiness data.csv --max-rows 150                    # exactly what the web page computes
```

Writes `out/results_readiness_<file>.json` and a Markdown report. It is a line-for-line port of `web/src/lib/readiness.ts` with the same seeded random numbers, so on the same rows the two agree to floating-point precision (largest difference 6 × 10⁻¹² across four test datasets, with identical verdicts and text).

Load any `out/*.json` file on the app's **Data**, **When quantum wins** or **Readiness check** pages to explore results interactively.

---

## Scientific rigour

- **Pre-registration.** Analysis plans were registered on OSF before outcome analysis and are embargoed until 31 January 2027. Results are reported regardless of direction.
- **Equal tuning budgets.** Quantum and classical models choose hyperparameters with the same inner cross-validation.
- **No outcome leakage.** The 12 pathways were fixed from prior cancer biology; no feature was selected using outcomes.
- **Appropriate statistics.** Nested leave-one-out and repeated stratified cross-validation, bootstrap confidence intervals, Wilcoxon signed-rank and the Bouckaert–Frank corrected t-test for repeated cross-validation, with Holm correction.
- **Positive and negative controls.** Engineered quantum-structured labels must come out as a quantum win, and the Readiness Check includes a control that must come out "go".
- **Separate datasets stay separate.** Each dataset is scored and standardised on its own; expression values are never pooled, and an external cohort is used once, unchanged, after training.
- **Exploratory work labelled as such.** Engineered labels are always presented as synthetic; upgrades are reported alongside, never instead of, registered results; simulated hardware runs are kept out of the hardware record.

---

## Limitations and intended use

> **SANKET is a research prototype, not a medical device.** It must not be used for diagnosis or treatment decisions.

- No model in this study is clinically ready; the best real-outcome C-indices (0.62–0.66) are modest, in line with the published literature.
- On real outcomes the quantum kernel matches, but does not beat, classical methods. Its demonstrated advantages are on quantum-structured data and in circuit cost.
- The oral cohort is small (86 patients) and comes from a single trial; external validation on Indian patients is required.
- Oral diagnosis: quantum and classical tie on all three tasks; dysplasia sensitivity is 51% at the default threshold; cancer vs dysplasia is not usable (17 dysplasias); and the models did not transfer to the Indian cohort (GSE23558, 32 samples, different platform).
- Gene-activity uploads are scored within the uploaded file only, need labelled reference samples in the same file, and give illustrative estimates, not a diagnosis.
- METABRIC relapse reflects historical treatment, which affects outcomes.
- METABRIC subtype labels are themselves derived from gene expression, so high scores on that task are expected.
- The hardware run covers the oral cohort (86 patients) and an 8-patient METABRIC sample; gate fidelities in the cost table are calibration-based estimates.

**Clinical path:** retrospective validation → ethics-approved (IEC) pilot with an oral oncology unit on de-identified data, compliant with India's Digital Personal Data Protection Act, 2023.

---

## Roadmap

- [x] Exact 12-qubit simulator verified against Qiskit
- [x] Registered analyses on two independent survival cohorts
- [x] Engineered quantum-advantage benchmark and diagnosis tasks
- [x] Hardware-aware circuit design and gate-count study
- [x] Full projected-kernel run on IBM Heron hardware (86 patients on `ibm_fez`; kernel agreement 0.98 with simulation)
- [x] Quantum Readiness Check: upload any dataset, get a quantum-headroom verdict
- [x] Clinical web prototype with case files, FHIR R4 export and disease-aware wording
- [x] Detect: registered oral tissue diagnosis (normal / dysplasia / cancer), independent Indian check, gene-activity upload scored in the browser
- [ ] Small gene panel: test whether a few dozen genes reproduce the 12 pathway scores (lower-cost input)
- [ ] Declared amendments: screening threshold for dysplasia, investigation of the failed platform transfer
- [ ] Technical report on Zenodo, then a preprint
- [ ] Clinician dashboard and API service (FastAPI, Docker)
- [ ] Indian oral precancer cohort through a clinical partner
- [ ] Quantum-sensor data (biomagnetic signals), where theory predicts genuine advantage

---

## License

Code is released under the [MIT License](LICENSE). The datasets keep their own terms: GEO GSE26549, GSE30784, GSE23558 and the Golub data are public, METABRIC is used under cBioPortal's terms, and MSigDB Hallmark gene sets are licensed by the Broad Institute.

---

## References

1. Havlíček, V. *et al.* Supervised learning with quantum-enhanced feature spaces. *Nature* **567**, 209–212 (2019).
2. Huang, H.-Y. *et al.* Power of data in quantum machine learning. *Nat. Commun.* **12**, 2631 (2021).
3. Huang, H.-Y. *et al.* Quantum advantage in learning from experiments. *Science* **376**, 1182–1186 (2022).
4. Gupta, R. S. *et al.* A systematic review of quantum machine learning for digital health. *npj Digit. Med.* **8**, 237 (2025).
5. Bowles, J., Ahmed, S. & Schuld, M. Better than classical? The subtle art of benchmarking quantum machine learning models. arXiv:2403.07059 (2024).
6. Javadi-Abhari, A. *et al.* Quantum computing with Qiskit. arXiv:2405.08810 (2024).
7. Saintigny, P. *et al.* Gene expression profiling predicts the development of oral cancer. *Cancer Prev. Res.* **4**, 218–229 (2011).
8. Curtis, C. *et al.* The genomic and transcriptomic architecture of 2,000 breast tumours. *Nature* **486**, 346–352 (2012).
9. Golub, T. R. *et al.* Molecular classification of cancer: class discovery and class prediction by gene expression monitoring. *Science* **286**, 531–537 (1999).
10. Liberzon, A. *et al.* The Molecular Signatures Database Hallmark gene set collection. *Cell Syst.* **1**, 417–425 (2015).
11. Barbie, D. A. *et al.* Systematic RNA interference reveals that oncogenic KRAS-driven cancers require TBK1. *Nature* **462**, 108–112 (2009). (ssGSEA)
12. Beran, R. Nonparametric regression with randomly censored survival data. Technical report, University of California, Berkeley (1981).
13. Bouckaert, R. R. & Frank, E. Evaluating the replicability of significance tests for comparing learning algorithms. *PAKDD*, 3–12 (2004).
14. Chen, C. *et al.* Gene expression profiling identifies genes predictive of oral squamous cell carcinoma. *Cancer Epidemiol. Biomarkers Prev.* **17**, 2152–2162 (2008). (GSE30784)
15. Ambatipudi, S. *et al.* Genomic profiling of advanced-stage oral cancers reveals chromosome 11q alterations as markers of poor clinical outcome. *PLoS One* **7**, e32436 (2012). (GSE23558)

---

<div align="center">

**Team Yukthi6G** · Smart India Hackathon 2026 · BVRIT Hyderabad College of Engineering for Women

*Research prototype. Not for clinical use.*

</div>
