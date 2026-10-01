# Exploring Bagging Ensemble of Variational Quantum Classifiers with Out-of-Bag Weighting for Breast Cancer Diagnosis

**Published:** 2026, *Procedia Computer Science*, Vol. 283, pp. 1866–1875  
**DOI:** 10.1016/j.procs.2026.06.261  
**Article:** https://www.sciencedirect.com/science/article/pii/S1877050926018934

## Problem
Variational Quantum Classifiers (VQCs) can be unstable on small biomedical datasets. This paper explores whether an ensemble can reduce that variance.

## Dataset
Wisconsin Breast Cancer Diagnostic (WBCD):
- 569 samples
- 30 cytological features
- benign/malignant labels

PCA compresses the input to roughly 3–4 components for quantum encoding.

## Method
An ensemble of six shallow VQCs introduces diversity through:
- different feature maps
- different circuit architectures
- different optimization strategies
- RX/RY/RZ rotations
- CNOT/CZ entangling gates

Out-of-bag error is used to weight ensemble members, followed by weighted soft voting.

## Reported results
Individual VQCs varied substantially (roughly 80–96% accuracy), while the ensemble reported:
- **95.71%** with 3 qubits
- **96.43%** with 4 qubits

The ensemble was reported as competitive with strong SVM/Random-Forest baselines.

## Strong project angle
Instead of “QML detects cancer,” investigate:
> **Can ensemble learning stabilize noisy/variable variational quantum classifiers on small medical datasets?**

That gives the project a real ML research question.

## Limitation
WBCD is a small, heavily studied benchmark. High performance on it does not establish clinical usefulness.

## Evidence level / caution
**Algorithmic benchmark, mostly simulator-based; not clinical evidence.**
