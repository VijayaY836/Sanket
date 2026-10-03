# SANKET demo video script (5 minutes, full walkthrough)

SIH26139 · Team Yukthi6G

## At a glance

The video runs 5:00 in fifteen scenes and **visits every page in the sidebar**, doing at least one real interaction on each: clicking, sliding, running or revealing. It needs one narrator and about 660 spoken words at a calm 2.3 words per second, which leaves room for the clicks to land.

The app has **two modes**, chosen with the **Oral cancer / Breast cancer** switch at the top of the sidebar. Oral cancer is the flagship and carries scenes 2–11; scene 12 switches to breast cancer and shows the same pages working on a second cancer. **Leukaemia is not a mode.** It is a benchmark (the Golub dataset that published quantum machine learning uses), and scene 14 says so on the Data page and names it as the next scope.

| # | Time | Mode | Sidebar page | What you actually do on screen | Takeaway |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 – 0:10 | – | PPT slide 1 | – | Team, PS ID, idea |
| 2 | 0:10 – 0:30 | Oral | Overview | Point at the mode switch and the sidebar badges | Two modes, real patients, real hardware |
| 3 | 0:30 – 0:55 | Oral | Overview | Scroll the 8-chapter story | How SANKET works |
| 4 | 0:55 – 1:05 | Oral | Overview | Scroll to the two-cancer table and care path | Where it fits in the clinic |
| 5 | 1:05 – 1:40 | Oral | **Detect** | Click a dot, reveal its diagnosis, move sliders on your own sample | It reads tissue: normal, precancer or cancer |
| 6 | 1:40 – 2:20 | Oral | **Patient case** | Open a case, read the risk, drag a what-if slider, reveal the real outcome, open FHIR | It predicts a precancer's future and explains it |
| 7 | 2:20 – 2:35 | Oral | **Constellation** | Toggle stable vs progressor, then bandwidth 1 | Patients as 12 qubits; what entanglement does |
| 8 | 2:35 – 2:55 | Oral | **Circuit and noise** | Press Run circuit, drag the noise slider, click shot buttons | The circuit is real and survives noise |
| 9 | 2:55 – 3:12 | Oral | **When quantum wins** | Press Run experiment | Where quantum wins, and where it does not |
| 10 | 3:12 – 3:30 | Oral | **Evidence** | Scroll the five findings, switch quantum/classical in calibration | Tested like a clinical model |
| 11 | 3:30 – 3:47 | Oral | **Hardware** | Read the job record, drag shots, view measured Bloch spheres | It ran on IBM's quantum computer |
| 12 | 3:47 – 4:17 | **Breast** | Switch → Overview, Detect, Patient case, Hardware | One click, then three pages | Same pipeline, second cancer |
| 13 | 4:17 – 4:30 | Breast | **Readiness check** | Use the loaded cohort, run, read the verdict | Any team can test their own data |
| 14 | 4:30 – 4:47 | Breast | **Data** | Point along the module table to the leukaemia row | Leukaemia is a benchmark and the next scope |
| 15 | 4:47 – 5:00 | – | PPT slides 5–6 | QR code | Impact and where to verify |

Every page in the sidebar appears: Overview, Detect, Patient case (Story); Constellation, Circuit and noise, When quantum wins (Quantum); Evidence, Hardware (Proof); Readiness check, Data (Tools). So do the sidebar badges: **Real patients**, **86 patients, 12 qubits** and **Run on IBM hardware**.

## The two modes and the benchmark

Every number below is in the README and the app. In one line: **2,573 real samples from seven cohorts, covering oral cancer and breast cancer plus a leukaemia benchmark.**

| | Oral cancer mode | Breast cancer mode | Leukaemia (benchmark) |
| --- | --- | --- | --- |
| **Role** | Flagship clinical mode | Second clinical mode | Benchmark only, not a mode in the app |
| **Detect** | Normal / dysplasia / cancer: AUC 0.98 (cancer), 87% of dysplasias caught at the screening cut-off | Cancer vs normal: AUC 0.98, 89% sensitivity, 94% specificity | Subtype only (AML vs ALL), 72 samples, no follow-up |
| **Predict** | Precancer → cancer, 3-year risk (86 patients with follow-up) | 5-year relapse (1,975 METABRIC patients; 300 in the app) | – |
| **Independent check** | Tata Memorial Centre, India: AUC 0.90 | Granada, Spain: AUC 0.76–0.91 across models | – |
| **IBM hardware** | All 86 patients, agreement 0.98 | 8-patient pilot, agreement 0.99 | – |
| **Quantum vs classical** | Tie | Tie | Classical ahead (0.94 vs 0.86) |
| **Where in the app** | Sidebar: Oral cancer | Sidebar: Breast cancer | Data page (module table) |

## Before you record

Each scene must be one click away; cut every wait in editing.

- [ ] Run the app locally (`cd web && npm run dev`), or use the single-file build (`npm run build:single`) so nothing depends on Wi-Fi
- [ ] The app opens in **Oral cancer** mode with "Real patients", "86 patients, 12 qubits" and "Run on IBM hardware" at the bottom of the sidebar. If not, click Oral cancer
- [ ] Do one full dry run. Three things compute live and can take from a few seconds to a minute on a slower laptop; cut any wait in editing: **Run experiment** on When quantum wins, **Run readiness check**, and the switch to **Breast cancer** (kernels build for 300 patients)
- [ ] Demo patient: **GSM652763** (top of the list when sorted By risk). It shows a 56% three-year risk, the screening rule says refer, and Reveal shows it did develop cancer. Rehearse its what-if slider so you know which way the risk moves
- [ ] In Detect, pick in advance one **normal** dot and one **dysplasia** dot to click
- [ ] In breast mode, pick in advance the patient you will open (the top one By risk works)
- [ ] Light theme, browser at 100% zoom, full screen (F11), bookmarks bar and extensions hidden, notifications off
- [ ] Record at 1920×1080, 30 fps (OBS Studio or the Windows/Mac built-in recorder)
- [ ] PPT open in a second window on slide 1, slideshow mode. Check the slides also call leukaemia a benchmark, not a third mode
- [ ] External or earphone mic, quiet room, phone on silent
- [ ] Read the script aloud twice with a timer before the real take

## The script

Each scene gives what is on screen, what your hands do, and the exact words.

### Scene 1 · Title (0:00 – 0:10)

**Show:** PPT slide 1. **Do:** Hold still.

> Hello, we are Team Yukthi6G. Problem statement SIH26139: hybrid quantum machine learning for early disease detection. Our solution is SANKET.

### Scene 2 · Overview: two modes, real patients (0:10 – 0:30)

**Show:** Overview, hero "Same white patch. Two different futures." with the whole sidebar visible.

**Do:**

1. Switch to the browser and let the particles move for a second.
2. Circle the **Oral cancer / Breast cancer** switch with the cursor on "two modes".
3. Move down to the badges at the bottom of the sidebar: **Real patients**, **86 patients, 12 qubits**, **Run on IBM hardware**.

> SANKET has two modes, for India's two most common cancers: oral and breast. We start with oral. Everything here is real patients, eighty-six of them, each encoded on twelve qubits, and this cohort has run on real IBM quantum hardware.

### Scene 3 · Overview: how it works (0:30 – 0:55)

**Show:** the scroll story, eight chapters: white patch → 20,000 genes → 12 pathways → qubits wired like the biology → the circuit → patient constellation → two patients separated → proof.

**Do:** Scroll one chapter per sentence. Pause on "Two patients, separated" so both curves draw.

> One in five white patches in the mouth becomes cancer, and under the microscope they look the same. SANKET compresses a biopsy's twenty thousand genes into twelve pathways. Each pathway becomes one qubit, wired only where pathways share genes. Similar quantum states mean similar futures, so two look-alike patients get two different curves.

### Scene 4 · Overview: two cancers, and where it fits (0:55 – 1:05)

**Show:** the "Two of India's most common cancers. One quantum pipeline." table, then the "Where SANKET fits" care path.

**Do:** Scroll to the table, hold for one sentence, then to the care path chips.

> The same pipeline covers both cancers. In the clinic, it sits after the biopsy: it supports the referral decision, it never replaces the pathologist.

### Scene 5 · Detect: read the tissue (1:05 – 1:40)

**Show:** Detect page, "Detect · Oral cancer". Hero numbers 0.98 · 0.95 · 87% · 0.90, the quantum similarity map, "One tissue sample", "Try a sample of your own", "Tested honestly".

**Do:**

1. Click **Detect**. Hold on the four hero numbers.
2. Scroll to the **quantum similarity map**. Click a **dysplasia** (yellow) dot. Its twelve qubits and the quantum-similarity estimate appear.
3. Click **Reveal the pathologist's diagnosis**.
4. Click a **normal** (teal) dot on the map so it becomes the selected sample. Scroll to **Try a sample of your own**, click **Start from …**, then drag the **Inflammation** and **EMT** sliders up. Under **Where it lands**, the vote bars and nearest samples shift towards cancer (rehearse this: pick a normal sample where the shift is clear).
5. Scroll past the **Tested honestly** table and stop on **Independent check: an Indian cohort**.

> First, Detect. Every dot is a tissue sample, placed only by quantum similarity. I click a precancer: its twelve qubits, and what its neighbours say. Reveal: the pathologist agrees. Now a normal sample: raise inflammation and EMT, and its neighbours shift towards cancer. Cancer versus normal: AUC zero point nine eight. The screening cut-off catches eighty-seven percent of precancers, and at Tata Memorial Centre, India, it reaches zero point nine.

### Scene 6 · Patient case: predict, explain, refer (1:40 – 2:20)

**Show:** Patient case, GSM652763.

**Do:**

1. Click **Patient case**. In the cohort list, keep **By risk** selected and click **GSM652763**. Let the four-stage pipeline play: genes measured → pathway scores → encoded on 12 qubits → prediction.
2. Point at the **56%** ring and the **Screening rule: refer** chip.
3. Scroll to **Predicted future** (1, 3, 5 years) and the **Cancer-free over time** curve against the whole cohort.
4. Point at **Why this risk**, then **Most similar patients**.
5. In **What if**, drag the top pathway slider. The violet what-if curve and risk update live. Click **Reset**.
6. Scroll up, click **Reveal what actually happened**: "Developed cancer".
7. Click **FHIR report**, hold the JSON for two seconds, close it.

> Next, a precancer patient. SANKET reads their genes, scores twelve pathways, runs them through the circuit, and gives a fifty-six percent risk of cancer within three years, with a full cancer-free curve. It explains why, with the pathways pushing risk up and the most similar past patients. Drag a pathway, and the circuit is re-simulated live. The screening rule says refer. Reveal what happened: this patient did develop cancer. One click exports an HL7 FHIR report for India's digital health mission.

### Scene 7 · Constellation: patients as qubits (2:20 – 2:35)

**Show:** Constellation, twelve Bloch spheres for the same patient.

**Do:**

1. Click **Constellation**. The violet arrows are this patient, the grey ghosts the comparison patient.
2. Click **Most similar progressor**, then **Most similar stable patient**. The highlighted cells move.
3. Click **Bandwidth 1 (comparison)**: the arrows shorten.

> Every patient is twelve qubits. Compare them with their most similar patient who progressed, or stayed stable. At a wider setting the arrows shorten: that is entanglement.

### Scene 8 · Circuit and noise: the real circuit (2:35 – 2:55)

**Show:** Circuit and noise: the gate-by-gate circuit, the hardware cost table, the noise laboratory.

**Do:**

1. Click **Circuit and noise**, then **Run circuit**. The gates light up column by column and the twelve spheres turn.
2. Scroll to **Hardware cost on IBM Heron**: point at 188 vs 906.
3. Scroll to **Depolarising noise** and drag the **Two-qubit gate error** slider to the right. The kernel heatmap and C-index update.
4. In **Finite shots and kernel repair**, click **64 shots**, then **4096 shots**.

> This is the exact circuit, gate by gate, simulated in the browser and checked against Qiskit. Shaped like the biology, it needs about five times fewer two-qubit gates than the standard map. Add hardware noise live, and the kernel degrades gracefully; with few shots, SANKET repairs it.

### Scene 9 · When quantum wins (2:55 – 3:12)

**Show:** When quantum wins, live experiment.

**Do:** Click **When quantum wins**, then **Run experiment**. Cut the wait. Hold on the two charts: **Engineered quantum-structured labels** on the left, **Real outcome** on the right.

> Does quantum ever win? On labels with quantum structure, left, the quantum kernel learns from far fewer patients. On the real outcome, right, they tie. This test tells the two apart before anyone spends on hardware.

### Scene 10 · Evidence: tested like a clinical model (3:12 – 3:30)

**Show:** Evidence, five stacked findings, then the chapters.

**Do:**

1. Click **Evidence**. Scroll slowly through **Performance**, **Why**, **Headroom**, **Hardware**, **In the clinic**.
2. In chapter 2 (**Would it help a clinician?**), click **Classical kernel**, then **Quantum kernel**, on the calibration chart.
3. Stop on **Risk groups separate** (the two Kaplan–Meier curves).

> Every analysis was registered before it was run. Quantum and classical get the same data and tuning budget, and on real outcomes they tie. We also show calibration, a referral rule catching ninety-one percent of progressions, and separating risk groups.

### Scene 11 · Hardware: IBM's quantum computer (3:30 – 3:47)

**Show:** Hardware: hero 86 · 0.98 · 49 · 2, the job record, measured Bloch spheres.

**Do:**

1. Click **Hardware**. Hold on the hero.
2. Point at the **Hardware job record** row with the 86-patient job ID.
3. Drag the **Shots per circuit** slider: the circuit budget updates.
4. Scroll to **Measured, one patient at a time**: solid arrows measured on ibm\_fez, dashed exact.

> We ran all eighty-six patients on IBM's 156-qubit Heron processor, ibm\_fez, with forty-nine two-qubit gates per circuit. The job IDs are public. Hardware and simulation agree at zero point nine eight, and the whole cohort fits IBM's free tier.

### Scene 12 · Breast cancer mode (3:47 – 4:17)

**Show:** the sidebar switch, then breast mode on Overview, Detect, Patient case and Hardware.

**Do:**

1. Click **Breast cancer** in the sidebar. Cut the kernel-build wait. The sidebar now reads "Relapse, 300 of 1,975 patients".
2. **Overview:** hold on "Same diagnosis. Two different futures."
3. **Detect:** hold on the hero (0.98 · 89% · 94% · Granada). Click one dot on the breast tissue map.
4. **Patient case:** click the top patient By risk. Hold on the **5-year relapse** ring and the relapse-free curve.
5. **Hardware:** point at the 8-patient breast job in the job record.

> Now the second mode. One click switches every page to breast cancer, India's most common, changed only by a config file. Detect finds breast cancer at an AUC of zero point nine eight, catching eighty-nine percent of cancers and clearing ninety-four percent of normal tissue, and it holds in Spain. It predicts five-year relapse from 1,975 patients, and a breast pilot ran on the same IBM chip.

### Scene 13 · Readiness check: your own data (4:17 – 4:30)

**Show:** Readiness check, "Should your data go quantum?"

**Do:** Click **Readiness check**, then **Use the loaded cohort** (it fills in the 12 pathways and the time-to-event outcome for you), then **Run readiness check**. Cut any wait. Hold on the **Verdict** box, which reads "Quantum matches classical on your outcome: choose classical", then on **Quantum headroom**.

> Any hospital can test its own data. SANKET measures the room for quantum and gives a verdict: go, wait, or choose classical. Here, honestly: choose classical. The file never leaves the browser.

### Scene 14 · Data: the modules, and leukaemia (4:30 – 4:47)

**Show:** Data page, the **Disease modules** table: Oral precancer progression, Early breast cancer relapse, **Leukaemia subtype** ("Calibration against published quantum ML").

**Do:** Click **Data**. Move the cursor down the module table and stop on the Leukaemia row. Burn in a caption: **Leukaemia = benchmark (Golub, 72 samples) · not a clinical mode · next in scope**.

> Oral and breast are our two clinical modes. Leukaemia is our benchmark, the dataset published quantum studies use, so anyone can compare. Classical wins there, and we report it. A blood-based leukaemia mode is our next scope.

### Scene 15 · Impact and close (4:47 – 5:00)

**Show:** PPT slide 5 (Impact), then slide 6 with the QR code for the last 5 seconds.

**Do:** Switch to the slideshow. Click to slide 6 on "Scan the code". Hold until the end.

> SANKET covers India's two most common cancers, runs on a laptop with free-tier IBM Quantum, and is ready for Indian quantum hardware. Scan to explore. Thank you.

## Recording and editing

Record the screen first while following the Do steps, then record the voice while watching it back.

- **Pace:** let every click land before the next sentence. The screen must match the words.
- **Cursor:** move slowly and point at the number you are saying. Turn on cursor highlighting in OBS.
- **Mode label:** burn in a corner tag, **ORAL MODE** for scenes 2–11 and **BREAST MODE** for scenes 12–14, in each cancer's colour.
- **Page label:** burn in the sidebar page name for each app scene (for example **Quantum · Circuit and noise**) so judges can map the video to the app.
- **Captions:** burn in the key numbers (86 patients, 0.98, 49 gates, 5× fewer, 87%, 1,975 patients) and the leukaemia caption in scene 14. Many judges watch on mute.
- **Cut every wait:** Run experiment, Run readiness check, the breast kernel build and the Patient case pipeline replay. Never show a spinner.
- **Music:** soft, about 10% volume, or none.
- **Face cam (optional):** scenes 1 and 15 only.
- **Say the numbers exactly as the deck does.**
- **Do not:** call leukaemia a third mode or say "three cancers" (say "two cancers plus a leukaemia benchmark"), quote exact numbers from the live experiment or readiness check (they vary slightly per run; describe the shape), show code or a terminal, or claim it diagnoses cancer. It is screening and referral support.
- **Upload:** 1080p MP4. Check SIH's current rules for maximum length; if they cap the video at 3 minutes, use the cuts below.

## If you run long, or SIH caps the length

Cut in this order; never speed up your speech.

1. Scene 8: drop step 4 (the shot buttons) and the last clause (saves \~4 s).
2. Scene 10: drop step 2 (the calibration toggle) (saves \~3 s).
3. Scene 4: merge into scene 3, say only the care-path sentence (saves \~5 s).
4. Scene 7: drop the bandwidth toggle and its last sentence (saves \~4 s).
5. Scene 13: drop "The file never leaves the browser." (saves \~2 s).

Never cut scenes 5, 6, 11, 12 or 14: they carry detection, prediction, real hardware, the breast mode and the leukaemia benchmark.

## If a judge asks about leukaemia

- **Why is it in SANKET?** As a benchmark. Golub AML vs ALL (72 samples) is the dataset published quantum machine learning work reports on, so it is the fairest place to compare SANKET with others.
- **Why is it not a mode?** It has diagnosis labels only, no follow-up, so SANKET's core job (predicting whether and when) cannot run on it. Telling two leukaemia types apart is also a strong-signal task where classical models win (0.94 vs 0.86), and we report that.
- **What is the scope?** A leukaemia mode built on a cohort with survival or relapse follow-up. Leukaemia is diagnosed from blood, so the input is less invasive than a biopsy, and the pipeline changes cancer through a config file.
