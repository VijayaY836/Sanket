# Quantum Enhanced Stratification of Breast Cancer: Exploring Quantum Expressivity for Real Omics Data

**Authors:** Valeria Repetto, Elia Giuseppe Ceroni, Giuseppe Buonaiuto, et al.  
**Published:** 2025, *Quantum Machine Intelligence* 7, Article 81  
**DOI:** 10.1007/s42484-025-00289-x  
**Article:** https://link.springer.com/article/10.1007/s42484-025-00289-x

## Why this is especially interesting
Instead of simply predicting benign vs malignant, this work asks whether quantum kernels can help uncover **molecular structure/subgroups inside breast cancer**. That is closer to precision oncology.

## Dataset
METABRIC multi-omics data:
- 1,980 primary breast-cancer biopsy samples
- Gene expression: 20,603 features
- Copy-number variation: 22,544 features
- Known molecular heterogeneity/subtypes

The high-dimensional data were reduced to four dimensions using UMAP for the quantum experiments.

## Quantum approach
The researchers used quantum kernels with different feature maps:
- Z feature map
- ZZ feature map with linear entanglement
- ZZ feature map with full entanglement

They varied encoding expressivity and tested simulations as well as quantum processing hardware.

## Main findings
Quantum kernels produced clustering behavior comparable to classical methods in several settings and could support more granular grouping in some configurations. Importantly, the paper investigates the trade-off between **expressivity and noise resilience**. Less expressive encodings could be more robust to quantum hardware noise.

## Why it could inspire a strong project
A project based on **breast-cancer subtype stratification from omics** is more research-oriented than another Wisconsin-dataset benign/malignant classifier.

Possible project:
> Quantum-kernel-based breast cancer subtype discovery using multi-omics data, with classical RBF/spectral-clustering baselines and an analysis of quantum noise.

## Questions for the team
- Does quantum clustering reveal stable groups that correspond to clinically meaningful subtypes?
- What information is lost during dimensionality reduction?
- Does performance survive realistic quantum noise?
- Can we reproduce simulator results on IBM quantum hardware?

## Evidence level / caution
**Promising precision-oncology proof of concept. It does not establish clinical benefit or a quantum cure.**
