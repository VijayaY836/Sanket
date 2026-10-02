# SANKET demo video: full script (≈ 5 minutes)

**Goal:** in five minutes a judge should remember three things:
1. **Same white patch, two different futures.** SANKET tells them apart from gene activity.
2. **It is real.** A working app, real patients, and an actual run on IBM's quantum computer.
3. **It is honest.** We test whether quantum helps before claiming it, and show exactly where it does.

**Pace:** about 140 spoken words per minute. The narration below is about 610 words (about 4.5 minutes spoken), which leaves room for pauses while things animate. Read it calmly. Silence while something animates is fine.

---

## Before you record (do all of this first)

**Machine and browser**
- Use Chrome, full screen (F11), window at **1920 × 1080**, browser zoom **100 %**.
- Close every other tab, mute notifications (Do Not Disturb), hide the bookmarks bar.
- Run the app: `cd web && npm run dev`, then open the localhost link.
- Use the **light theme** (the "Theme" button at the bottom of the sidebar: set it to *light*). It looks cleaner on video. The dark heroes stay dark anyway.

**Load the real data (important)**
- Go to **Data**, click **Choose file** under *Load a cohort* and pick **`out/cohort.json`**.
- Check the sidebar says **"Real cohort loaded"** and **"Run on IBM hardware"**, and that the yellow *Synthetic data* banner is gone.

**Pre-warm the slow pages** (so nothing loads on camera)
- Open **Evidence** once and wait until the headline says *"Quantum and classical kernels perform at parity on this cohort"* (about 15 s).
- Open **Readiness check**, click **Use the loaded cohort (86 patients)**, then **Run readiness check**, and wait for the **Verdict** box. You can either show it already done, or record the click and cut the wait.
- Open **When quantum wins**, click **Run experiment** once. It finishes in a few seconds; it will say **Run again** after.
- Go back to **Overview** and scroll to the very top before you start.

**Recording**
- Record the screen with OBS Studio (free) at 1080p, 30 fps. Record voice separately or with a good headset mic in a quiet room. A phone voice memo held 20 cm from your mouth is better than a laptop mic.
- Easiest workflow: **record the screen first in silence, following the "DO" column; then record the voice-over reading the "SAY" column, and line them up in the editor** (CapCut, DaVinci Resolve or Clipchamp). This gives a much smoother result than talking while clicking.
- Move the mouse slowly and deliberately. Pause the cursor on whatever you are talking about. Never wiggle it.
- Add soft background music at about 10 % volume (YouTube Audio Library, "cinematic" or "ambient tech").
- Add burned-in subtitles (CapCut auto-captions, then fix spelling of *SANKET*, *qubit*, *ibm_fez*, *Kaplan–Meier*).

**The two demo patients (both have the same biopsy diagnosis: hyperplasia)**

| Patient | Age, sex | SANKET 3-year risk | Tier shown | What actually happened |
|---|---|---:|---|---|
| **GSM652833** | 71, male | **53 %** | High risk: refer to oral oncology | **Developed cancer at 3.8 years** |
| **GSM652770** | 60, female | **13 %** | Low risk: routine surveillance | **Cancer-free at 11.6 years** |

Find each one by typing the ID into the **Search** box on the Patient case page.

---

## The script

### 0:00 – 0:20 · Cold open: the problem

| DO | SAY |
|---|---|
| Start on **Overview**, at the very top. The particle animation and the headline *"Same white patch. Two different futures."* are on screen. Hold still for 2 seconds. | *"Two patients. The same white patch in the mouth. Under the microscope, they look exactly the same."* |
| Hold. Slow push-in in the editor (optional, 105 % zoom). | *"One of them will develop oral cancer. The other never will. Today, no doctor can tell which. This is SANKET, and it can."* |

> Title card overlay (editor, 2 s, bottom-left): **SANKET · Quantum Intelligence for Cancer Prevention · Team Yukthi6G · SIH26139**

### 0:20 – 1:00 · How it works (scroll story)

| DO | SAY |
|---|---|
| Scroll down slowly to chapter 2: *"Inside every biopsy, 20,000 genes."* | *"Every biopsy carries the activity of twenty thousand genes."* |
| Scroll to chapter 3: *"Compressed into 12 pathways a biologist can read."* | *"We compress them into twelve biological pathways: cell growth, DNA repair, hypoxia, inflammation. Chosen from biology, never from outcomes."* |
| Scroll to chapter 4: the ring of 12 qubits. | *"Each pathway becomes one qubit, and the qubits are wired exactly like the biology: two pathways interact only if they share genes."* |
| Scroll to chapter 5: the circuit. | *"Every patient runs through this quantum circuit."* |
| Scroll to chapter 6: the constellation of dots. Point at a pink cluster, then a teal one. | *"Patients with similar quantum states have similar futures. Pink went on to develop cancer. Teal stayed cancer-free."* |

### 1:00 – 2:05 · The patient case (the "wow" moment)

| DO | SAY |
|---|---|
| Click **Patient case** in the sidebar. Type **GSM652833** in Search, click it. Let the four stages animate (about 4 s): genes → pathways → qubits → prediction. | *"Here is a real patient from the GEO oral precancer study. Seventy-one years old, diagnosed with hyperplasia, the mildest finding there is. SANKET reads twenty thousand genes, scores twelve pathways, encodes them on twelve qubits..."* |
| The ring fills to **53 %**. Hover over *"High risk: Consider referral to oral oncology"*. | *"...and estimates a fifty-three percent chance of cancer within three years. High risk: refer to oncology."* |
| Click **Reveal what actually happened**. The stamp drops: **Developed cancer at 3.8 years**. Pause 2 seconds. | *"The model never saw this outcome. This patient developed cancer."* |
| Clear the search, type **GSM652770**, click it, let it animate. Ring shows **13 %**, *Low risk: routine surveillance*. Click **Reveal**: **Cancer-free at 11.6 years**. | *"Now a second patient. Same diagnosis. Same white patch. Thirteen percent risk. Eleven years later: still cancer-free. Same white patch, two different futures, told apart from gene activity alone."* |
| Scroll down to **Why this risk** (the bars). | *"And it explains itself, pathway by pathway, so a clinician can see why."* |
| Scroll up and click **FHIR report**. Let the modal show for 2 seconds, then close it. | *"The result exports as a standard HL7 FHIR report, ready for digital health records."* |

### 2:05 – 2:35 · The circuit

| DO | SAY |
|---|---|
| Click **Circuit and noise**. The hero *"The circuit, gate by gate."* is visible. Scroll a little to the feature-map panel and click **Run circuit**. The steps play and the twelve Bloch spheres move. | *"This is the actual circuit, simulated exactly in the browser and verified against IBM's Qiskit to fifteen decimal places."* |
| Scroll to **Hardware cost on IBM Heron**. Point at the green bottom row: **"SANKET, 1 step: run on ibm_fez", 49 gates**. | *"Because it follows the biology, it is small: about five times fewer two-qubit gates than the standard quantum feature map. Small enough for today's real quantum hardware."* |

### 2:35 – 3:05 · Real quantum hardware

| DO | SAY |
|---|---|
| Click **Hardware**. The hero shows **86 · 0.98 · 49 · 2**. Hold 2 seconds. | *"So we ran it. All eighty-six patients, on IBM's 156-qubit Heron processor, ibm_fez."* |
| Scroll to **What finite shots look like**. Point at the solid (measured) vs dashed (exact) arrows. | *"Solid arrows are measured on the quantum computer. Dashed arrows are the exact simulation. They agree. The similarity between patients computed on real hardware matches simulation at zero point nine eight."* |

### 3:05 – 3:55 · The honest evidence

| DO | SAY |
|---|---|
| Click **Evidence**. Hero: *"Tested like a clinical model."* Hold 1 second. | *"Now the part most quantum projects skip: does the quantum part actually help?"* |
| Scroll slowly through the **stacked cards**. Card 1: **0.55**, *"perform at parity"*. | *"We gave quantum and classical models the same data and the same tuning. On real clinical outcomes, they tie. We report that."* |
| Card 2: **0.994**, *"the qubits barely entangle."* | *"And we found out why: at the setting the data chooses, the qubits barely entangle, so the quantum model behaves almost classically."* |
| Card 3: **g 2.5**, headroom. Card 4: **0.98**, hardware. Card 5: the clinical referral rule. | *"There is room for quantum in principle, the model survives real hardware, and a referral rule built on it catches over ninety percent of cancers."* |

### 3:55 – 4:30 · Where quantum wins, and a tool for everyone

| DO | SAY |
|---|---|
| Click **When quantum wins**. Show the live experiment result (already run): the purple quantum line above the classical one on the left chart. | *"When data does have quantum structure, the picture changes. Here the quantum model pulls ahead with just ten training patients, and in our full benchmark it wins clearly: zero point nine seven against zero point six six."* |
| Click **Readiness check**. Show the **Verdict** box: *"Quantum matches classical on your outcome: choose classical."* | *"So we turned this into a tool. Upload any medical dataset, and SANKET tells you honestly whether quantum is worth it: go, wait, or stay classical. For this data, it says classical, and it is right."* |

### 4:30 – 5:00 · Close

| DO | SAY |
|---|---|
| Click **Overview** and scroll to the last chapter: *"Tested honestly. Run on real quantum hardware."* with the four numbers. | *"Oral and breast cancer are India's two most common cancers. Eighty percent of oral cancers here are found late."* |
| Hold on the four numbers. | *"SANKET: real patients, two cancers, a working platform, an actual run on a quantum computer, and an honest answer to when quantum helps."* |
| Cut to the **logo end card** (`docs/logo.png` on a white background, 4 s). | *"Built for India's National Quantum Mission. We are Team Yukthi6G. Thank you."* |

> End card text: **SANKET · Quantum Intelligence for Cancer Prevention** · Team Yukthi6G · SIH26139 · github.com/VijayaY836/sanket

---

## Timing check

| Section | Time | Length |
|---|---|---:|
| Cold open | 0:00 – 0:20 | 20 s |
| How it works | 0:20 – 1:00 | 40 s |
| Patient case | 1:00 – 2:05 | 65 s |
| Circuit | 2:05 – 2:35 | 30 s |
| Real hardware | 2:35 – 3:05 | 30 s |
| Honest evidence | 3:05 – 3:55 | 50 s |
| Where quantum wins + Readiness | 3:55 – 4:30 | 35 s |
| Close | 4:30 – 5:00 | 30 s |

**If you run long:** cut the FHIR report (−8 s) and the Circuit section's first line (−8 s). **If you must hit 4 minutes:** drop the Circuit section entirely and fold "five times fewer gates" into the Hardware section.

---

## Words to use, and words to avoid

Judges in quantum and medicine will check claims. Every number in this script is real and comes from the repository.

**Say:**
- "ties", "matches classical", "at parity" on real outcomes
- "wins on data with quantum structure"
- "ran on IBM's quantum computer", "86 patients on ibm_fez"
- "research prototype", "decision support"

**Never say:**
- "quantum beats classical at predicting cancer" (it does not on real outcomes)
- "diagnoses cancer" or "replaces the biopsy" (it is decision support after biopsy)
- "100 % accurate" or any accuracy you cannot point to on screen
- "first in the world" (cannot be verified)

**If you get asked "how much would this cost a patient?" (one line):**
*"SANKET reads only 12 biological pathways, under 2,400 genes instead of 20,000, so it can move from whole-transcriptome profiling to a small targeted gene panel that costs a fraction as much, and the quantum step itself takes seconds per patient."*

(If pushed: the 12 Hallmark gene sets have at most 200 genes each; trimming them to a minimal clinical panel is planned work, not done yet.)

**If you get asked "so why use quantum at all?":**
*"Three reasons. It matches the best classical kernel on real outcomes while running on hardware five times smaller than standard quantum circuits. It wins clearly where data has quantum structure, which is where future quantum-sensor medical data is heading. And our Readiness Check tells any hospital in advance whether quantum is worth the cost for their data, which no one else offers."*

---

## Quick facts to have ready (for Q&A or captions)

| Fact | Value |
|---|---|
| Oral cohort | GEO GSE26549: 86 patients with oral premalignant lesions, 35 progressed to cancer |
| Breast cohort | METABRIC: 1,975 patients, 800 relapses |
| Real patients across three cancers | 2,133 (oral, breast, leukaemia) |
| Hardware run | IBM `ibm_fez` (Heron, 156 qubits), job `davbc6il7guc73cekc8g`, 86 patients × 1,024 shots |
| Hardware agreement | kernel 0.98, Bloch vectors 0.96 correlation |
| Circuit size | 49 two-qubit gates on hardware; 188 vs 906 for the standard ZZ map (≈ 5×) |
| Real-outcome result | METABRIC C-index 0.582 vs 0.582 (p = 0.98); oral nested CV 0.554 vs 0.580 |
| Quantum win (engineered data) | AUC 0.97 vs 0.66 with 50 training patients |
| Why parity | mean Bloch length 0.994 at the chosen setting (1 = no entanglement) |
| Referral rule | catches ≥ 90 % of progressions |
| Rigour | pre-registered on OSF, equal tuning budgets, nested and repeated cross-validation |

---

## Optional polish (if you have time)

- **Split-screen moment (1:40):** put GSM652833 and GSM652770 side by side in the editor, both ring results visible, with the caption *"Same diagnosis. Different futures."*
- **Lower-third captions** for each key number when it first appears: "53 % risk → developed cancer", "13 % risk → cancer-free 11.6 years", "86 patients on IBM ibm_fez", "0.98 agreement".
- **Face cam:** a 5-second intro of the team at the start, or a small circular face cam in a corner, makes it personal. Keep it off during the patient case so the screen stays clean.
- **Phone shot (5 s):** show the app on a phone (the layout works at phone width) during the close, to say "works anywhere".
