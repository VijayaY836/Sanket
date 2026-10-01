"""SANKET feature map. Identical maths to web/src/lib/quantum.ts (verified by engine.crosscheck).

x_k = scale * (pi/2) * tanh(z_k / 2)
H on every qubit, then `reps` Trotter layers of RZ(2 x_k), RZZ(2 x_i x_j) on crosstalk edges, RX(2 beta).
This is first-order Trotterised evolution under H(x) = sum_k x_k Z_k + sum_(i,j) x_i x_j Z_i Z_j + beta sum_k X_k.
"""
from __future__ import annotations
import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector


def angle_of(z):
    return (np.pi / 2) * np.tanh(np.asarray(z, dtype=float) / 2)


def feature_map(z, edges, reps=2, beta=0.5, scale=0.4) -> QuantumCircuit:
    x = scale * angle_of(z)
    n = len(x)
    qc = QuantumCircuit(n, name="sanket_fm")
    qc.h(range(n))
    for _ in range(reps):
        for k in range(n):
            qc.rz(2 * x[k], k)
        for i, j in edges:
            qc.rzz(2 * x[i] * x[j], i, j)
        for k in range(n):
            qc.rx(2 * beta, k)
    return qc


def bloch_vectors(state: Statevector) -> np.ndarray:
    """Single-qubit Bloch vectors (n, 3) from a statevector, little-endian like Qiskit."""
    n = state.num_qubits
    psi = np.asarray(state.data).reshape([2] * n)  # axis 0 = most significant = qubit n-1
    out = np.zeros((n, 3))
    for k in range(n):
        ax = n - 1 - k
        a = np.moveaxis(psi, ax, 0).reshape(2, -1)
        r01 = np.vdot(a[1], a[0])  # sum a0 * conj(a1)
        out[k] = [2 * r01.real, -2 * r01.imag, np.vdot(a[0], a[0]).real - np.vdot(a[1], a[1]).real]
    return out


def states_and_bloch(Z, edges, reps, beta, scale):
    states = [Statevector(feature_map(z, edges, reps, beta, scale)) for z in Z]
    return states, np.stack([bloch_vectors(s) for s in states])
