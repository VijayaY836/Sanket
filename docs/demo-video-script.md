# SANKET demo video script (3 minutes)

SIH26139 · Team Yukthi6G

## At a glance

The video runs 3:00 in ten scenes: a 12-second title, 2 minutes 34 seconds of the live web app, and a 14-second close. It needs one narrator and about 430 spoken words, a calm 2.4 words per second. The structure follows the judges' questions in order: problem, solution, proof it works, proof it is real, proof it scales across cancers, impact.

| # | Time | On screen | What the judge should take away |
| --- | --- | --- | --- |
| 1 | 0:00 – 0:12 | PPT slide 1 (title) | Team, PS ID, one-line idea |
| 2 | 0:12 – 0:32 | App: Overview hero, "Same white patch" | The clinical problem is real and unsolved |
| 3 | 0:32 – 0:50 | App: Overview scroll story | How SANKET works |
| 4 | 0:50 – 1:08 | App: Detect | It detects cancer and precancer, and was tested on Indian patients |
| 5 | 1:08 – 1:45 | App: Patient case | It predicts when a precancer may turn malignant |
| 6 | 1:45 – 1:58 | App: Constellation | The quantum part is real and biology-shaped |
| 7 | 1:58 – 2:16 | App: Hardware | It ran on a real IBM quantum computer |
| 8 | 2:16 – 2:32 | App: sidebar switch to Breast cancer, then Detect | One platform, three cancers; detection for oral and breast (2,573 samples) |
| 9 | 2:32 – 2:46 | App: Evidence | We test honestly |
| 10 | 2:46 – 3:00 | PPT slide 5, then slide 6 (QR) | Impact for India, and where to verify |

## Before you record

Set everything up so each scene is one click away; a 3-minute video has no time for loading screens or searching.

- [ ] Run the app locally (`cd web && npm run dev`), or use the single-file build (`npm run build:single`) so nothing depends on Wi-Fi
- [ ] The app opens on real oral cancer patients. Check the sidebar shows **Oral cancer** selected and "Real patients" at the bottom; if not, click Oral cancer
- [ ] Pick your demo patient in advance (GSM652763 is the one in the screenshots) and rehearse its outcome reveal and FHIR report
- [ ] Light theme, browser at 100% zoom, full screen (F11), bookmarks bar and extensions hidden, notifications off
- [ ] Record at 1920×1080, 30 fps (OBS Studio or the Windows/Mac built-in recorder)
- [ ] Open the PPT in a second window, already on slide 1, in slideshow mode
- [ ] External or earphone mic, quiet room, phone on silent; record voice separately if your screen recorder makes keyboard noise
- [ ] Read the full script aloud twice with a timer before the real take

## The script

Each scene lists what is on screen, what your hands do, and the exact words. The word counts are sized to the time slot; if you run long, use the trims in the last section.

### Scene 1 · Title (0:00 – 0:12)

**Show:** PPT slide 1, title page.

**Do:** Hold still. No clicks.

> Hello, we are Team Yukthi6G. Our problem statement is SIH26139: a hybrid quantum machine learning platform for early disease detection. Our solution is called SANKET.

### Scene 2 · The problem (0:12 – 0:32)

**Show:** App, Overview page, the hero "Same white patch. Two different futures."

**Do:** Switch from the PPT to the browser. Let the particle background move for a second before you speak.

> Oral cancer is India's second most common cancer, and most cases are caught late. Many begin as a white patch in the mouth called leukoplakia. About one in five turns into cancer, but under the microscope the dangerous ones look exactly like the harmless ones. Doctors cannot tell which patient needs urgent follow-up.

### Scene 3 · How SANKET works (0:32 – 0:50)

**Show:** Overview scroll story: tissue → genes → pathways → qubits → circuit.

**Do:** Scroll slowly and steadily, one chapter per sentence. Stop on "Each patient runs through the circuit".

> SANKET reads the gene activity in a biopsy. It compresses twenty thousand genes into twelve biological pathways, like DNA repair and inflammation. Each pathway becomes one qubit, and qubits interact only where pathways share genes, so the circuit is shaped like the biology.

### Scene 4 · Detect: normal, precancer or cancer? (0:50 – 1:08)

**Show:** Detect page: the hero numbers (0.98 · 0.95 · 87% · 0.90), then the tissue map.

**Do:**

1. Click Detect in the sidebar and hold on the hero numbers for one sentence.
2. Scroll to the map and click one yellow dysplasia sample so its twelve qubits and neighbour estimate appear.
3. Click reveal so the pathologist's diagnosis shows.

> First, SANKET reads the tissue: normal, precancer or cancer. It tells cancer from normal tissue with an AUC of zero point nine eight, and with a screening cut-off it catches eighty-seven percent of precancers. On an independent Indian cohort from Tata Memorial Centre, it reaches zero point nine.

### Scene 5 · Predict: a patient case (1:08 – 1:45)

**Show:** Patient case page, patient GSM652763.

**Do:**

1. Click Patient case in the sidebar and select GSM652763. Let the pipeline animation finish.
2. Move the cursor around the risk ring, then scroll to the cancer-free curve.
3. Hover "Why this risk", then "Most similar patients".
4. Click FHIR report and let the JSON appear for two seconds.

> Then, for a precancer, SANKET predicts the future. Here is a real patient from a public oral precancer study. It gives the risk of cancer within three years and a full cancer-free curve, not just a yes or no. It explains why, showing the pathways driving the risk and the most similar past patients. When too few similar patients exist, SANKET refuses to guess and refers the case. And with one click it produces an HL7 FHIR report, the standard India's digital health mission builds on.

### Scene 6 · The quantum core (1:45 – 1:58)

**Show:** Constellation page.

**Do:** Open Constellation and let the 12 Bloch spheres animate. Hover one sphere as you say "twelve qubits".

> Here, every patient becomes twelve qubits, shown as Bloch spheres. Patients with similar quantum states tend to have similar futures, and that similarity is our quantum kernel.

### Scene 7 · Real quantum hardware (1:58 – 2:16)

**Show:** Hardware page: hero (86 · 0.98 · 49), then measured vs simulated Bloch vectors.

**Do:** Pause on the hero numbers for a full sentence, then scroll to the measured Bloch spheres.

> We ran all eighty-six patients on IBM's 156-qubit Heron processor, ibm\_fez. Each circuit needs only forty-nine two-qubit gates, and the hardware results agree with exact simulation at zero point nine eight: about five times fewer gates than the standard quantum feature map.

### Scene 8 · One pipeline, three cancers (2:16 – 2:32)

**Show:** the sidebar's **Oral cancer / Breast cancer** switch, the Overview hero in breast cancer mode ("Same diagnosis. Two different futures."), then the Detect page's breast cancer numbers.

**Do:**

1. Click **Breast cancer** in the sidebar. The page stays up for about 5 seconds while the quantum kernels build; cut that wait in editing.
2. Hold on the breast cancer Overview hero for one sentence.
3. Click Detect so the breast cancer hero numbers (0.98, 89%, 94%) are on screen as you say "zero point nine eight".

> The same pipeline, changed only by a config file, detects breast cancer in tissue at an AUC of zero point nine eight, predicts five-year relapse for 1,975 breast cancer patients, and tells two leukaemia types apart: 2,573 real samples across three cancers.

### Scene 9 · Honest evidence (2:32 – 2:46)

**Show:** Evidence page stacked findings (breast cancer is still selected, which is fine: it shows the same tie).

**Do:** Scroll through two finding cards on the Evidence page. Pause on the "Quantum and classical kernels perform at parity" card.

> Every analysis was written down before it was run. Where data has quantum structure, our kernel wins clearly; on today's clinical outcomes it ties classical, and we say so.

### Scene 10 · Impact and close (2:46 – 3:00)

**Show:** PPT slide 5 (Impact), then slide 6 with the QR code for the last 5 seconds.

**Do:** Switch back to slideshow. Click to slide 6 on "Scan the code". Hold the QR on screen until the video ends.

> SANKET covers India's two most common cancers, runs on a laptop with free-tier IBM Quantum, and is ready for Indian quantum hardware. Scan the code to explore everything. We are Team Yukthi6G. Thank you.

## Recording and editing

Record the screen and the voice in separate passes: screen first while you follow the Do steps, voice second while you watch it back. It is far easier than talking and clicking at once.

- **Pace:** let every click land before the next sentence. Judges watch the screen, so the screen must match the words.
- **Cursor:** move slowly and point at the number you are saying. Turn on cursor highlighting in OBS if available.
- **Face cam (optional):** a small circle in a corner for scenes 1 and 10 only. It shows a real team, but keep it off the app scenes.
- **Captions:** burn in short captions for the key numbers (86 patients, 0.98, 49 gates, 5× fewer). Many judges watch on mute.
- **Music:** soft background track at about 10% volume, or none. Never louder than the voice.
- **Editing:** cut every pause longer than one second and every loading moment. Add a 1-second fade only at the start and end.
- **Say the numbers exactly as the deck does.** If the video and PPT disagree on a figure, judges notice.
- **Do not:** read slides aloud word for word, show code or a terminal, apologise for anything, or claim it diagnoses cancer. It is screening and referral support.
- **Upload:** export 1080p MP4 and check SIH's current submission rules for length, platform and visibility (usually an unlisted YouTube or Drive link). Test the link in an incognito window.

## If you run long or short

Time your first full take. If it is over 3:00, make these cuts in order until it fits; never speed up your speech instead.

1. Scene 5: drop "When too few similar patients exist, SANKET refuses to guess and refers the case" (saves \~5 s).
2. Scene 2: drop "Many begin as a white patch in the mouth called leukoplakia" and say "About one in five oral precancers turns into cancer" instead (saves \~4 s).
3. Scene 3: drop "like DNA repair and inflammation" (saves \~2 s).
4. Never cut Scene 4 or Scene 8: they are the only places detection, the Indian cohort, breast cancer and leukaemia appear on screen.

If it is under 2:45, add this line at the end of Scene 7, while the measured Bloch spheres are on screen:

> Solid arrows are what IBM's hardware measured; dashed arrows are the exact simulation. They line up almost perfectly.