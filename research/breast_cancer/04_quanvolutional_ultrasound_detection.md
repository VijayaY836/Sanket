# Breast Cancer Detection with Quanvolutional Neural Networks

**Published:** 2024  
**PubMed:** https://pubmed.ncbi.nlm.nih.gov/39202100/  
**Full text:** https://pmc.ncbi.nlm.nih.gov/articles/PMC11353681/

## Problem
Classifying breast ultrasound images using a hybrid quantum/classical image model.

## Approach
The study encodes classical image information into quantum states and uses quantum circuits as convolution-like feature extractors. Its QCNN uses a 9-qubit circuit design with angle embedding and entanglement.

## Reported result
The paper reports:
- QCNN peak training accuracy: **76.66%**
- QCNN validation accuracy: **87.17%**
- Comparable classical CNN validation accuracy: **83.33%**

These numbers are interesting, but should be interpreted cautiously because small medical-imaging datasets can produce unstable estimates and a single experiment is not proof of general quantum advantage.

## Why it is useful
This is a visually demonstrable project direction:
**Ultrasound image → preprocessing → quantum/quanvolution layer → classical layers → benign/malignant prediction.**

It is more portfolio-friendly than a purely tabular classifier because your team can show the image, extracted representation and model output.

## Suggested reproduction
Compare:
1. Classical CNN
2. Same architecture with quanvolution feature extraction
3. Transfer-learning baseline
4. Hybrid model under simulated quantum noise

Use repeated cross-validation or carefully separated patient-level train/test splits.

## Evidence level / caution
**Diagnostic research proof of concept. Not a clinical diagnostic system and not treatment.**
