# SANKET: which oral precancers become cancer, and when

Hybrid quantum ML for SIH26139 (team Yukthi6G). Gene expression from a biopsy is compressed into 12 Hallmark pathway scores, one per qubit, encoded with a Hamiltonian feature map whose entanglement follows pathway crosstalk. Projected and fidelity quantum kernels feed a kernel survival model that predicts time to oral cancer, with explanations, nearest similar patients and an honest quantum-vs-classical test.

```
sanket/
  web/        React + TypeScript app (browser statevector simulator, kernels, survival, stats)
  engine/     Python + Qiskit research engine (GEO -> pathways -> cohort.json, benchmark, IBM hardware)
  data/       downloads (GEO series, Hallmark GMT) — created automatically
  out/        engine outputs: cohort.json, results.json, figures/, crosscheck.json
```

## 1. Set up VS Code

Install Node.js 20+, Python 3.11 (3.10–3.12 work), Git, and VS Code with the **Python** and **ESLint** extensions. Open the `sanket` folder in VS Code and use the built-in terminal (Ctrl+`).

## 2. Run the app

```bash
cd web
npm install
npm run dev            # open the localhost link it prints
npm run build:single   # optional: one self-contained HTML file in web/dist-single/
```

It starts on a clearly labelled synthetic cohort, so you can demo immediately.

## 3. Set up the engine

From the `sanket` folder:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

In VS Code, pick `.venv` as the interpreter (Ctrl+Shift+P > Python: Select Interpreter).

## 4. Real data (GSE26549)

```bash
python -m engine.inspect_geo                 # downloads GSE26549, lists every sample field
```

Copy the exact time-to-cancer and progression field names and values into `engine/config.yaml` (`time_field`, `event_field`, `event_positive_values`, `time_unit`). Then:

```bash
python -m engine.build                       # writes out/cohort.json
```

Open the app > **Data** > drop `out/cohort.json`. Every screen recomputes on real patients and the synthetic banner disappears.

If the Hallmark download fails, download `h.all.v2023.1.Hs.symbols.gmt` from MSigDB (free registration) into `data/`.

## 5. Results for the report

```bash
python -m engine.benchmark --repeats 20      # out/results.json + out/figures/
python -m engine.crosscheck --scale 0.4      # then app > Data > Verify against Qiskit
python -m engine.resources                   # gate-count study on IBM Heron
```

The benchmark's nested leave-one-out numbers match the app exactly (same protocol). It adds elastic-net Cox and random survival forest baselines, repeated stratified 5-fold CV and Wilcoxon tests with Holm correction.

## 6. IBM quantum hardware

Create a free account at quantum.cloud.ibm.com, copy your API key, and save it once:

```bash
python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S; S.save_account(channel='ibm_quantum_platform', token='YOUR_TOKEN', overwrite=True)"
python -m engine.hardware --backend fake --patients 2     # local dry run on a noisy Heron model
python -m engine.hardware --backend least_busy            # real QPU, whole cohort
```

The job ID and measured Bloch vectors are written into `out/cohort.json`; reload it in the app and the Hardware page shows the real run. Never call the QPU live during a demo.

## Demo checklist

- Load the real `cohort.json` before presenting; open Patient case on a progressor, then click Replay analysis.
- Show the reveal toggle, a nearest-neighbour click, and one what-if slider.
- Constellation: compare with the most similar stable patient.
- Evidence: read the verdict sentence aloud, whatever it says.
- Keep `web/dist-single/index.html` on a USB stick as an offline fallback, plus a recorded video.

Research prototype. Not for diagnosis.

## 7. Breast cancer module (METABRIC, about 1,900 patients)

1. On cbioportal.org, open Datasets, find "Breast Cancer (METABRIC, Nature 2012 & Nat Commun 2016)", download it, and unpack it so the files sit in `data/brca_metabric/` (`data_clinical_patient.txt`, `data_clinical_sample.txt`, `data_mrna_illumina_microarray.txt`, about 700 MB).
2. `python -m engine.metabric --inspect` lists the clinical columns. Check that `RFS_MONTHS` and `RFS_STATUS` exist.
3. `python -m engine.metabric` writes `out/metabric_cohort.json` (all patients) and `out/metabric_app.json` (a 300-patient display sample for the app). This step analyses no outcomes.
4. Register on OSF first: follow `docs/osf_metabric_registration.md`, uploading `engine/config_metabric.yaml` before submitting.
5. `python -m engine.scale --quick` for a 5-minute smoke test, then `python -m engine.scale` for the registered analysis (30–60 minutes). Results go to `out/results_metabric.json` and `out/figures/metabric_size_curve.png`.
6. Load `out/metabric_app.json` in the app's Data page to explore breast patients. For cohorts over 150 patients the app shows a leave-one-out preview and leaves the full protocol to the engine.
7. `python -m engine.resources` re-runs the gate-count study from any cohort's crosstalk graph.

## 8. When quantum wins (engineered-advantage benchmark)

Following Huang et al. (Nat. Commun. 2021), SANKET builds labels with quantum structure from real pathway scores and checks whether the quantum kernel learns them from fewer patients than tuned classical models; the same models then run on the real outcome as a contrast.

- In the app: open **When quantum wins** and click **Run experiment** (runs live on up to 110 patients of the loaded cohort).
- Full benchmark: `python -m engine.advantage --cohort out/metabric_cohort.json` (800-patient pool, adds linear, random forest and gradient boosting baselines; 20–40 minutes). For the oral cohort: `python -m engine.advantage --cohort out/cohort.json --pool 86`. Load `out/results_advantage.json` on the same page.
- Always present the engineered task as synthetic labels. It demonstrates that the platform detects quantum structure; the real-outcome results are the clinically meaningful ones.

## 9. Diagnosis tasks (leukaemia and breast cancer subtype)

- Leukaemia: `python -m engine.golub` downloads the Golub AML/ALL data (72 patients) and the GPL80 probe annotation, and writes `out/golub_cohort.json`.
- Declare both tasks on OSF first: `docs/osf_diagnosis_tasks.md`.
- `python -m engine.classify --task golub` (a few minutes) and `python -m engine.classify --task metabric_basal` (needs the METABRIC folder; 15–30 minutes).
- Load the `out/results_classify_*.json` files on the app's **When quantum wins** page.