# SANKET demo video script (3 minutes)

SIH26139 · Team Yukthi6G

## At a glance

The video runs 3:00 in eleven scenes: a 10-second title, 2 minutes 35 seconds of the live web app, and a 15-second close. It needs one narrator and about 400 spoken words, a calm 2.4 words per second.

The app has **two modes**, chosen with the **Oral cancer / Breast cancer** switch in the sidebar. The video shows both: oral cancer first (the flagship, scenes 2–7), then one click to breast cancer (scene 8). **Leukaemia is not a mode.** It is a benchmark: the Golub dataset that published quantum machine learning work uses, so SANKET can be compared like for like. Scene 9 says this out loud and names leukaemia as the next scope, so no judge mistakes it for a third clinical product.

| # | Time | Mode | On screen | What the judge should take away |
| --- | --- | --- | --- | --- |
| 1 | 0:00 – 0:10 | – | PPT slide 1 (title) | Team, PS ID, one-line idea |
| 2 | 0:10 – 0:26 | Oral | Overview hero, "Same white patch" | Two modes, two cancers; the oral problem is real and unsolved |
| 3 | 0:26 – 0:41 | Oral | Overview scroll story | How SANKET works |
| 4 | 0:41 – 0:56 | Oral | Detect | It detects cancer and precancer, and was tested on Indian patients |
| 5 | 0:56 – 1:24 | Oral | Patient case | It predicts when a precancer may turn malignant |
| 6 | 1:24 – 1:35 | Oral | Constellation | The quantum part is real and biology-shaped |
| 7 | 1:35 – 1:50 | Oral | Hardware | It ran on a real IBM quantum computer |
| 8 | 1:50 – 2:20 | **Breast** | Sidebar switch, Overview hero, Detect, Patient case | Second mode: same pipeline detects breast cancer and predicts relapse |
| 9 | 2:20 – 2:35 | Breast | Data page, module table | Leukaemia is a benchmark, not a mode; it is the next scope |
| 10 | 2:35 – 2:45 | Breast | Evidence | We test honestly |
| 11 | 2:45 – 3:00 | – | PPT slide 5, then slide 6 (QR) | Impact for India, and where to verify |

## The two modes and the benchmark

Keep these three lines straight in the narration, the captions and the deck. Every number below is in the README and the app.

| | Oral cancer mode | Breast cancer mode | Leukaemia (benchmark) |
| --- | --- | --- | --- |
| **Role** | Flagship clinical mode | Second clinical mode | Benchmark only, not a mode in the app |
| **Why** | India's #2 cancer; has the precancer stage SANKET is built for | India's #1 cancer | Golub AML vs ALL is the dataset published quantum ML uses, so results compare directly |
| **Detect** | Normal / dysplasia / cancer: AUC 0.98 (cancer), 87% of dysplasias caught at the screening cut-off | Cancer vs normal: AUC 0.98, 89% sensitivity, 94% specificity | Subtype only (AML vs ALL), 72 samples, diagnosis labels, no follow-up |
| **Predict** | Precancer → cancer, 3-year risk (86 patients with follow-up) | 5-year relapse (1,975 METABRIC patients; 300 in the app) | – |
| **Independent check** | Tata Memorial Centre, India: AUC 0.90 | Granada, Spain: AUC 0.76–0.91 across models | – |
| **IBM hardware** | All 86 patients, agreement 0.98 | 8-patient pilot, agreement 0.99 | – |
| **Quantum vs classical** | Tie | Tie | Classical ahead (0.94 vs 0.86), reported as is |
| **Where in the app** | Sidebar: Oral cancer | Sidebar: Breast cancer | Data page (module table), When quantum wins page |

**Leukaemia scope (say it only as a plan, never as a result).** Leukaemia is diagnosed from blood, which is easier to collect than a biopsy, and the pipeline changes cancer through a config file. A leukaemia mode needs a cohort with follow-up (survival or relapse), which Golub does not have; that is the next step, not something already built.

## Before you record

Set everything up so each scene is one click away; a 3-minute video has no time for loading screens or searching.

- [ ] Run the app locally (`cd web && npm run dev`), or use the single-file build (`npm run build:single`) so nothing depends on Wi-Fi
- [ ] The app opens on real oral cancer patients. Check the sidebar shows **Oral cancer** selected and "Real patients" at the bottom; if not, click Oral cancer
- [ ] Pick your oral demo patient in advance (GSM652763 is the one in the screenshots) and rehearse its outcome reveal and FHIR report
- [ ] Do one dry run of the switch to **Breast cancer** and back before recording, so you know the kernel-build wait (about 5 seconds) and which breast patient you will open in scene 8
- [ ] Light theme, browser at 100% zoom, full screen (F11), bookmarks bar and extensions hidden, notifications off
- [ ] Record at 1920×1080, 30 fps (OBS Studio or the Windows/Mac built-in recorder)
- [ ] Open the PPT in a second window, already on slide 1, in slideshow mode. Check its slides also show leukaemia as a benchmark, not a third mode
- [ ] External or earphone mic, quiet room, phone on silent; record voice separately if your screen recorder makes keyboard noise
- [ ] Read the full script aloud twice with a timer before the real take

## The script

Each scene lists what is on screen, what your hands do, and the exact words. The word counts are sized to the time slot; if you run long, use the trims in the last section.

### Scene 1 · Title (0:00 – 0:10)

**Show:** PPT slide 1, title page.

**Do:** Hold still. No clicks.

> Hello, we are Team Yukthi6G. Problem statement SIH26139: hybrid quantum machine learning for early disease detection. Our solution is SANKET.

### Scene 2 · Two modes, and the oral problem (0:10 – 0:26)

**Show:** App, Overview page in **Oral cancer** mode, the hero "Same white patch. Two different futures." Keep the sidebar switch visible.

**Do:** Switch from the PPT to the browser. Point the cursor at the **Oral cancer / Breast cancer** switch on "two modes", then move it to the hero.

> SANKET has two modes: oral cancer and breast cancer, India's two most common. We start with oral. One in five white patches in the mouth becomes cancer, and under the microscope the dangerous ones look like the harmless ones.

### Scene 3 · How SANKET works (0:26 – 0:41)

**Show:** Overview scroll story: tissue → genes → pathways → qubits → circuit.

**Do:** Scroll slowly and steadily, one chapter per sentence. Stop on "Each patient runs through the circuit".

> SANKET reads the gene activity in a biopsy and compresses twenty thousand genes into twelve biological pathways. Each pathway becomes one qubit, and qubits interact only where pathways share genes, so the circuit is shaped like the biology.

### Scene 4 · Oral mode: detect (0:41 – 0:56)

**Show:** Detect page, "Detect · Oral cancer": the hero numbers (0.98 · 0.95 · 87% · 0.90), then the tissue map.

**Do:**

1. Click Detect in the sidebar and hold on the hero numbers for one sentence.
2. Scroll to the map and click one yellow dysplasia sample so its twelve qubits and neighbour estimate appear.
3. Click reveal so the pathologist's diagnosis shows.

> First, it reads the tissue: normal, precancer or cancer. Cancer versus normal scores an AUC of zero point nine eight; a screening cut-off catches eighty-seven percent of precancers. On Indian patients at Tata Memorial Centre, it reaches zero point nine.

### Scene 5 · Oral mode: predict a patient's future (0:56 – 1:24)

**Show:** Patient case page, patient GSM652763.

**Do:**

1. Click Patient case in the sidebar and select GSM652763. Let the pipeline animation finish.
2. Move the cursor around the risk ring, then scroll to the cancer-free curve.
3. Hover "Why this risk", then "Most similar patients".
4. Click FHIR report and let the JSON appear for two seconds.

> Then, for a precancer, it predicts the future. This real patient gets a three-year cancer risk and a full cancer-free curve. SANKET explains why, with the pathways driving the risk and the most similar past patients, and refers the case when too few similar patients exist. One click produces an HL7 FHIR report, the standard India's digital health mission builds on.

### Scene 6 · The quantum core (1:24 – 1:35)

**Show:** Constellation page.

**Do:** Open Constellation and let the 12 Bloch spheres animate. Hover one sphere as you say "twelve qubits".

> Every patient becomes twelve qubits, shown as Bloch spheres. Patients with similar quantum states tend to have similar futures: that is our quantum kernel.

### Scene 7 · Real quantum hardware (1:35 – 1:50)

**Show:** Hardware page: hero (86 · 0.98 · 49), then measured vs simulated Bloch vectors.

**Do:** Pause on the hero numbers for a full sentence, then scroll to the measured Bloch spheres.

> We ran all eighty-six oral patients on IBM's 156-qubit Heron processor, ibm\_fez. Each circuit needs forty-nine two-qubit gates, about five times fewer than the standard feature map, and hardware matches simulation at zero point nine eight.

### Scene 8 · Breast mode: one click, same pipeline (1:50 – 2:20)

**Show:** the sidebar switch, the Overview hero in breast mode ("Same diagnosis. Two different futures."), the Detect page in breast mode ("Detect · Breast cancer": 0.98 · 89% · 94% · Granada), then one breast patient's case file.

**Do:**

1. Click **Breast cancer** in the sidebar. The page stays up for about 5 seconds while the quantum kernels build; cut that wait in editing.
2. Hold on the breast Overview hero for one sentence.
3. Click Detect so the breast hero numbers are on screen as you say "zero point nine eight". Point at the Granada number on "Spain".
4. Click Patient case, pick the breast patient you rehearsed, and hold on the 5-year relapse ring and curve.

> Now the second mode. One click switches every page to breast cancer, changed only by a config file. In tissue, SANKET detects breast cancer at an AUC of zero point nine eight, catching eighty-nine percent of cancers and clearing ninety-four percent of normal tissue, and the ranking holds on patients in Spain. After diagnosis, it predicts five-year relapse, trained on 1,975 patients.

### Scene 9 · Leukaemia: our benchmark, and the next scope (2:20 – 2:35)

**Show:** Data page, the module table. The "Leukaemia subtype" row reads "Golub AML/ALL, 72 patients" and "Calibration against published quantum ML".

**Do:** Click Data in the sidebar (under Tools). Move the cursor along the Leukaemia row. Burn in a caption: **Leukaemia = benchmark (Golub, 72 samples) · not a clinical mode · next in scope**.

> Leukaemia is our benchmark, not a third mode: the dataset published quantum studies use, so anyone can compare. Classical wins there, and we report it. A blood-based leukaemia mode is our next scope.

### Scene 10 · Honest evidence (2:35 – 2:45)

**Show:** Evidence page stacked findings (breast cancer is still selected, which is fine: it shows the same tie).

**Do:** Scroll through two finding cards. Pause on the "Quantum and classical kernels perform at parity" card.

> Every analysis was written down before it was run. On today's clinical data our quantum kernel ties classical, and we say so.

### Scene 11 · Impact and close (2:45 – 3:00)

**Show:** PPT slide 5 (Impact), then slide 6 with the QR code for the last 5 seconds.

**Do:** Switch back to slideshow. Click to slide 6 on "Scan the code". Hold the QR on screen until the video ends.

> SANKET covers India's two most common cancers, runs on a laptop with free-tier IBM Quantum, and is ready for Indian quantum hardware. Scan the code to explore. We are Team Yukthi6G. Thank you.

## Recording and editing

Record the screen and the voice in separate passes: screen first while you follow the Do steps, voice second while you watch it back. It is far easier than talking and clicking at once.

- **Pace:** let every click land before the next sentence. Judges watch the screen, so the screen must match the words.
- **Cursor:** move slowly and point at the number you are saying. Turn on cursor highlighting in OBS if available.
- **Mode label:** burn in a small corner tag, **ORAL MODE** for scenes 2–7 and **BREAST MODE** for scene 8, in the two cancers' colours. It makes the two modes obvious even on mute.
- **Face cam (optional):** a small circle in a corner for scenes 1 and 11 only. It shows a real team, but keep it off the app scenes.
- **Captions:** burn in short captions for the key numbers (86 patients, 0.98, 49 gates, 5× fewer, 1,975 patients) and the leukaemia caption in scene 9. Many judges watch on mute.
- **Music:** soft background track at about 10% volume, or none. Never louder than the voice.
- **Editing:** cut every pause longer than one second and every loading moment, especially the breast kernel build in scene 8. Add a 1-second fade only at the start and end.
- **Say the numbers exactly as the deck does.** If the video and PPT disagree on a figure, judges notice.
- **Do not:** call leukaemia a third mode or say "three cancers" without "benchmark", read slides aloud word for word, show code or a terminal, apologise for anything, or claim it diagnoses cancer. It is screening and referral support.
- **Upload:** export 1080p MP4 and check SIH's current submission rules for length, platform and visibility (usually an unlisted YouTube or Drive link). Test the link in an incognito window.

## If you run long or short

Time your first full take. If it is over 3:00, make these cuts in order until it fits; never speed up your speech instead.

1. Scene 5: drop "and refers the case when too few similar patients exist" (saves \~3 s).
2. Scene 8: drop step 4 (the breast patient case) and the words "trained on 1,975 patients"; keep "it predicts five-year relapse" over the Detect page (saves \~4 s).
3. Scene 3: drop "and compresses twenty thousand genes" and say "and turns it into twelve biological pathways" (saves \~2 s).
4. Never cut Scene 4, Scene 8 or Scene 9: they are the only places detection, the Indian cohort, the breast mode and the leukaemia benchmark appear on screen.

If it is under 2:45, add this line at the end of Scene 7, while the measured Bloch spheres are on screen:

> Solid arrows are what IBM's hardware measured; dashed arrows are the exact simulation. They line up almost perfectly.

## If a judge asks about leukaemia

- **Why is it in SANKET?** As a benchmark. Golub AML vs ALL (72 samples) is the dataset published quantum machine learning work reports on, so it is the fairest place to compare SANKET with others.
- **Why is it not a mode?** It has diagnosis labels only, no follow-up, so SANKET's core job (predicting whether and when) cannot run on it. Telling two leukaemia types apart is also a strong-signal task where classical models win (0.94 vs 0.86), and we report that.
- **What is the scope?** A leukaemia mode built on a cohort with survival or relapse follow-up. Leukaemia is diagnosed from blood, so the input is less invasive than a biopsy, and the pipeline changes cancer through a config file.
