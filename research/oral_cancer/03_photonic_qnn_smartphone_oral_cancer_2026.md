# Parameter-Efficient Continuous-Variable Photonic Quantum Neural Networks for Edge Quantum AI: Demonstration in Oral Cancer Detection

**Authors:** Akshay Bhagwan Sonawane, Sophie Choe, Lakshman Tamil  
**Year:** 2026  
**Status:** arXiv preprint  
**arXiv:** 2606.28252  
**Article:** https://arxiv.org/abs/2606.28252

## Why this is probably the most novel paper in the pack

This paper investigates **oral-cancer detection from smartphone images** using a hybrid classical + continuous-variable (CV) photonic quantum model.

Instead of ordinary qubits, the quantum component uses photonic continuous-variable modes.

## Motivation

Smartphone screening could potentially help in low-resource environments, but an edge model must be lightweight.

The paper therefore investigates whether a very small quantum model can provide useful classification after a classical image encoder.

## Pipeline

`Smartphone image`
→ `MobileNetV1 feature extractor`
→ `PCA to 16 dimensions`
→ `CV photonic QNN`
→ `classification`

The quantum circuit includes operations such as:
- displacement
- interferometric transformations
- Kerr gates

## Parameter efficiency

The proposed simplified CV-QNN reportedly reduces trainable parameters by approximately **40–45%** relative to the referenced standard CV-QNN layer.

The strongest reported configuration uses:
- four qumodes
- only 18 trainable parameters

The authors report that it exceeds their 55-parameter classical baseline while using substantially fewer trainable parameters.

## Particularly interesting technical issue: barren plateaus

Quantum models can develop extremely flat optimization landscapes where useful gradients disappear.

The authors explore dimensionality-reduction and encoding restrictions to mitigate this problem.

This gives your project a deeper research question than simple accuracy comparison.

## Strong project question

> Can a parameter-efficient quantum classifier provide competitive oral-cancer screening after a pretrained mobile image encoder?

Possible comparison:

MobileNet features
→ PCA
→ Logistic Regression / SVM / tiny MLP / VQC / CV-QNN

## Major caution

This is a **preprint**. Treat its very strong reported test results cautiously until peer review, independent reproduction and external clinical validation are available.

## Evidence classification

**Direct oral-cancer QML — highly novel, early-stage/preprint evidence.**
