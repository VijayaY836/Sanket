# Quant Oral Net: Development of Oral Cancer Histopathology Image Analysis Using Multiscale Feature Extraction with Quantum SVM (QSVM)

**Authors:** T. Saravanan, S. Vimal  
**Journal:** Biomedical Signal Processing and Control  
**Volume:** 125 (2026), 110742  
**DOI:** 10.1016/j.bspc.2026.110742  
**Source:** https://www.sciencedirect.com/science/article/pii/S1746809426012966

## Why this is the first paper your team should read

This is one of the most directly relevant papers available: oral-cancer histopathology + deep feature extraction + a quantum-inspired SVM classifier.

## Dataset

Total: **5,192 histopathology images**

- 2,698 Oral Squamous Cell Carcinoma (OSCC) images
- 2,494 normal oral epithelium images
- H&E-stained tissue
- Leica ICC50 HD microscope
- 100× imagery described in the study

Split:
- Training: 3,894 images (75%)
- Testing: 1,298 images (25%)

## Pipeline

The proposed OralHistNet pipeline has three broad stages:

1. Image preprocessing
2. Multiscale feature extraction using InceptionV3
3. Classification using a simulated quantum-inspired SVM

## Reported performance

The proposed method reports approximately **92% accuracy**.

The paper reports comparisons around:
- common deep-learning techniques: ~86%
- ResNet101 + R-CNN: ~89%
- proposed approach: ~92%

## Important scientific caveat

The terminology needs careful handling. The work describes a **simulated quantum / quantum-inspired SVM**. That is not automatically evidence of speedup or advantage on physical quantum hardware.

## Excellent reproduction project

Build:

`Histopathology → Inception/ResNet features → PCA/feature selection → Classical SVM vs quantum-kernel/QSVM → evaluation`

Measure:
- Accuracy
- Sensitivity
- Specificity
- F1
- ROC-AUC
- Training/inference cost
- Number of encoded features/qubits
- Noise sensitivity

## Evidence classification

**Direct oral-cancer QML/quantum-inspired paper — highly relevant.**
