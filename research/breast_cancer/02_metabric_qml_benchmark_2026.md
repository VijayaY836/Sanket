# A Comparative Evaluation of Quantum Machine Learning Architectures for Breast Cancer Classification Using Clinical and Genomic Data

**Authors:** Saartak Allena, Smrithy G. S., Balaji Chandrasekaran  
**Published:** 2026, *Frontiers in Artificial Intelligence*  
**Article:** https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1837513/full  
**PubMed:** https://pubmed.ncbi.nlm.nih.gov/42591753/

## Why this paper matters
This is one of the most useful recent papers for designing a credible student/research project because it compares several quantum models with multiple classical baselines instead of reporting a quantum model in isolation.

## Dataset
**METABRIC breast-cancer data**
- 2,509 patients in the study's processed cohort
- 63 processed clinical/genomic features
- PCA reductions to 12, 4 and 2 components for quantum experiments

## Models compared
### Quantum
- Quantum Neural Network (QNN)
- Quantum K-Nearest Neighbors (QKNN)
- Quantum Support Vector Machine (QSVM)

### Classical
- Logistic Regression
- RBF SVM
- KNN
- Random Forest
- XGBoost
- LightGBM
- Multilayer Perceptron

## Key result
The strongest reported QML configuration was QKNN with 12 principal components:
- Accuracy: about **75.11% ± 3.76%**
- F1: about **0.7088 ± 0.0433**
- ROC-AUC: about **0.8148 ± 0.0394**

Strong classical models using the full feature representation reached roughly **94% accuracy**.

## Most important lesson
The paper **does not demonstrate quantum advantage**. A major limitation is information loss caused by dimensionality reduction required to fit data into small quantum representations.

That negative/realistic result is extremely valuable. A serious project should ask *when* QML helps and benchmark it against equivalent classical models.

## Project idea derived from it
Build a reproducible **Quantum-vs-Classical Breast Cancer Benchmark**:
1. METABRIC preprocessing
2. PCA/feature selection
3. QSVM + VQC/QNN
4. SVM/XGBoost/Random Forest baselines
5. Cross-validation
6. AUC, F1, calibration and runtime
7. Study how performance changes as the number of encoded features/qubits changes

## Evidence level / caution
**Benchmark research on QML; not clinical deployment and not treatment.**
