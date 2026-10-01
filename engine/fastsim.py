"""Batched NumPy statevector simulator for the SANKET feature map (all patients at once).

Same maths as engine/featuremap.py and web/src/lib/quantum.ts (verified by `python -m engine.fastsim`), but
hundreds of times faster than building one Qiskit circuit per patient, which makes kernel training practical.
Per-qubit scales are supported: x_k = scale_k * (pi/2) * tanh(z_k / 2).
"""
from __future__ import annotations
import numpy as np


def _bits(n):
    idx = np.arange(1 << n)
    return np.array([(idx >> k) & 1 for k in range(n)], dtype=np.int8)  # (n, 2^n)


def bloch_batch(Z, edges, reps=2, beta=0.5, scale=0.4, chunk=256):
    """Z: (P, n) pathway z-scores. scale: float or length-n array. Returns Bloch vectors (P, n, 3)."""
    Z = np.asarray(Z, float); P, n = Z.shape
    sc = np.broadcast_to(np.asarray(scale, float), (n,))
    X = sc * (np.pi / 2) * np.tanh(Z / 2)
    zsign = (1 - 2 * _bits(n)).astype(float)                       # (n, 2^n), +1 for |0>, -1 for |1>
    E = np.array(edges, int).reshape(-1, 2)
    zz = zsign[E[:, 0]] * zsign[E[:, 1]] if len(E) else np.zeros((0, 1 << n))
    c, s = np.cos(beta), np.sin(beta)                              # RX(2 beta): cos(beta), -i sin(beta)
    out = np.empty((P, n, 3))
    for a in range(0, P, chunk):
        x = X[a:a + chunk]; p = len(x)
        psi = np.full((p, 1 << n), (1 / np.sqrt(1 << n)) + 0j)      # H on all qubits from |0..0>
        # phase of one Trotter layer: RZ(2x_k) -> exp(-i x_k z_k); RZZ(2 x_i x_j) -> exp(-i x_i x_j z_i z_j)
        coef = np.hstack([x, (x[:, E[:, 0]] * x[:, E[:, 1]]) if len(E) else np.zeros((p, 0))])
        phase = np.exp(-1j * (coef @ np.vstack([zsign, zz])))
        for _ in range(reps):
            psi = psi * phase
            for k in range(n):
                v = psi.reshape(p, -1, 2, 1 << k)
                a0, a1 = v[:, :, 0, :].copy(), v[:, :, 1, :].copy()
                v[:, :, 0, :] = c * a0 - 1j * s * a1
                v[:, :, 1, :] = -1j * s * a0 + c * a1
        for k in range(n):
            v = psi.reshape(p, -1, 2, 1 << k)
            a0, a1 = v[:, :, 0, :], v[:, :, 1, :]
            r01 = (a0 * a1.conj()).sum(axis=(1, 2))
            out[a:a + p, k] = np.stack([2 * r01.real, -2 * r01.imag, (np.abs(a0) ** 2).sum(axis=(1, 2)) - (np.abs(a1) ** 2).sum(axis=(1, 2))], 1)
    return out


def projected_kernel(B, gamma=None):
    F = B.reshape(len(B), -1)
    sq = (F ** 2).sum(1); D = np.clip(sq[:, None] + sq[None, :] - 2 * F @ F.T, 0, None)
    if gamma is None:
        iu = np.triu_indices(len(D), 1); gamma = 1 / (np.median(D[iu]) or 1.0)
    return np.exp(-gamma * D)


if __name__ == "__main__":
    # verification against Qiskit
    from qiskit.quantum_info import Statevector
    from .featuremap import feature_map, bloch_vectors
    rng = np.random.default_rng(0); Z = rng.normal(size=(5, 12))
    edges = [[0, 1], [1, 2], [0, 3], [3, 4], [0, 5], [6, 7], [6, 2], [8, 9], [8, 3], [10, 11], [11, 9], [7, 1]]
    for reps, beta, scale in [(2, 0.5, 0.4), (1, 0.3, 1.0), (2, 1.0, 0.15)]:
        Bf = bloch_batch(Z, edges, reps, beta, scale)
        Bq = np.stack([bloch_vectors(Statevector(feature_map(z, edges, reps, beta, scale))) for z in Z])
        print(f"reps {reps} beta {beta} scale {scale}: max difference vs Qiskit {np.abs(Bf - Bq).max():.1e}")