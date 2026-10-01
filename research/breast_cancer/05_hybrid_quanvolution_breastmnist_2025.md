# A Hybrid Quantum-Classical Model for Breast Cancer Diagnosis with Quanvolutions

**Published:** 2025 IEEE 38th International Symposium on Computer-Based Medical Systems (CBMS)  
**IEEE:** https://ieeexplore.ieee.org/document/11058799/

## Core idea
This work uses a **quanvolutional layer as a quantum feature extractor** and connects it to classical neural-network components for breast-cancer image classification.

## Data
The study reports use of:
- BreastMNIST
- Segmented mass regions derived from the BCDR dataset

The task is binary malignant/benign classification.

## Why this paper matters for a team project
BreastMNIST is far easier to start with than raw hospital imaging. This makes the paper a practical bridge from a classroom QML experiment to a medical-imaging research prototype.

## Suggested project extension
Instead of reproducing only accuracy:
- Compare quantum and classical feature maps
- Evaluate class imbalance
- Add ROC-AUC, sensitivity and specificity
- Test robustness to image noise
- Compare parameter count and compute cost
- Test simulated quantum noise
- Visualize learned embeddings

## Research question
> Does a small quanvolutional feature extractor provide useful representations for low-data breast-imaging classification when compared under equal-data and equal-capacity conditions?

## Evidence level / caution
**Conference proof of concept. Diagnostic research only.**
