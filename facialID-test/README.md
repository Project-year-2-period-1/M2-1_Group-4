# Facial tracking test

Which way of tracking the head should drive the parallax, and which facial landmarks to use:

- **Arm A:** OpenCV.js built with the contrib `face` module (Haar cascade + Facemark LBF, 68
  landmarks)
- **Arm B:** MediaPipe Face Landmarker alone (478 landmarks, including the irises)
- **Control:** the mouse pointer. It measures display latency and checks the logging; it is not
  an accuracy baseline.

**Taking part?** Follow [USER_INSTRUCTIONS.md](USER_INSTRUCTIONS.md).

## Results so far (29 Sept 2026)

One participant (Omer), normal lighting, no glasses. Each tracker was run live in its own
session, on Omer's laptop and on his phone. Result files are in [`results/`](results/).

### Laptop

**MediaPipe is clearly better than OpenCV.** The gaps are far larger than anything more
sessions would reverse:

|                                           | MediaPipe               | OpenCV                                 |
| ----------------------------------------- | ----------------------- | -------------------------------------- |
| Processing time per frame (typical / p95) | 8.5 / 10.8 ms           | 25.9 / 27.5 ms                         |
| Frames dropped                            | 4                       | 319                                    |
| Face found (normal view)                  | 100%                    | 94.5% (fails the 95% gate)             |
| Leaning in (pose N)                       | found 100%, jitter 4 mm | found 71%, jitter 96 mm                |
| At the L tape                             | found 100%, jitter 4 mm | found 81%, jitter 142 mm, off by 15 cm |

Sitting centred and still, OpenCV is about as steady as MediaPipe once filtered (~2.5 mm). It
breaks as soon as you lean in or move sideways: it loses the face or jumps 10-15 cm.

### Phone

|                                           | MediaPipe      | OpenCV       |
| ----------------------------------------- | -------------- | ------------ |
| Frame rate                                | 26 fps         | **8 fps**    |
| Processing time per frame (typical / p95) | 31 / 39 ms     | 117 / 155 ms |
| Frames dropped                            | 481 (13%)      | 2254 (66%)   |
| Face found (normal view)                  | 100%           | 98%          |
| Jitter holding still                      | about 0.5-2 mm | 1.4-20 mm    |

OpenCV is unusable on a phone: at 8 fps it skips two of every three frames. MediaPipe works but
only just: it misses the 33 ms speed gate (written for the laptop) and drops about 1 frame in 8.
It is very steady, likely because the face fills more of the frame at phone distance.

### Which MediaPipe output to use

All options are computed from the same frames, so this comparison is fair. Laptop and phone
agree:

- Use **MediaPipe's facial transformation matrix** (`poseMatrix`): lowest jitter when still, and
  turning your head moves it less than the landmark options (laptop 29 vs 60 mm, phone 7 vs 10
  mm). Runner-up: eye-corner midpoint + face width.
- **Don't estimate distance from iris size**: blinking partly covers the iris. During the
  talk/smile/blink step the scene jumped 53 mm on the laptop and 21 mm on the phone (face width:
  2.5 and 3.5 mm).
- **Eye spacing is also poor** for distance (15 mm drift on the laptop): the irises move when you
  look around.

### What these sessions cannot tell you

- **Absolute accuracy and the jitter/accuracy gates.** In the laptop session the pose distances
  were the example values rather than measured ones. In both sessions the head was still moving
  (and leaning rather than sliding) during the "move to R" calibration step, which makes
  sideways distances come out about 20% short. Both affect every tracker equally, so the
  comparisons above stand, but absolute mm figures are approximate (±10-20%).
- On the phone every tracker put pose F at about 50 cm instead of the entered 45 cm, so that
  measurement was probably off.
- The analysis now calibrates from only the settled second half of the R step, and the prompts
  say to move rather than lean. That only helps new sessions: these result files were computed
  before the fix and cannot be re-analysed without the recordings.

## Processing sent-in data (Omer)

Participants send a Result JSON, a Recording and a Sidecar. On `/bench`, choose Source "Replay a
recording", pick the recording and sidecar, and run it through **both** trackers on the same
computer, so speed is comparable across participants. Then load all the result JSONs under
"Compare arms". Keep phone and laptop results apart: they answer different questions.

## Running the tools

The code lives in the app itself, because SvelteKit needs it there: `src/lib/bench/`
(trackers, analysis, criteria) and `src/routes/bench/` (the pages). Everything else for this
test is in this folder.

### Setup

```sh
npm install
npm run bench:assets        # MediaPipe model + OpenCV.js build (needs docker; slow the first time)
```

Both land in `static/` and are gitignored. The OpenCV build patches three things so Facemark is
exposed to JS; see `scripts/build-opencv.sh`. Participants only need MediaPipe
(`scripts/fetch-mediapipe.sh`).

### Criteria

The gates, weights and decision rules are in `src/lib/bench/criteria.ts`, each with its
reasoning. Before collecting data you intend to decide on, agree them, set `agreedOn` and commit;
the commit is the proof the rules were fixed before anyone saw results.

### Pages (`npm run dev`, or `npm run dev:phone` for phones)

| Page           | What it is for                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/bench`       | The scripted test. **Live** runs it on your head and records the webcam; **Replay** runs a recording through any tracker, so every arm sees identical frames. Compare all result JSONs at the bottom.                               |
| `/bench/live`  | Free use on your real head: pick a tracker and estimator, calibrate on C then R, and watch a dot or the parallax scene follow you. For latency, film head and screen in 240 fps slow motion; do the mouse control too and subtract. |
| `/bench/blind` | Blind A/B: the participant rates "Condition 1/2" for depth and comfort and picks a preference. The arms can be two trackers or two estimators.                                                                                      |

Each frame is logged raw (landmark pixels), and calibration, filtering (One Euro, the same for
every arm) and metrics run afterwards, so a filter can be re-tuned without re-recording.

### Developer tests

```sh
npm test                    # unit tests: maths and analysis on simulated data
node facialID-test/scripts/make-synthetic.mjs path/to/face.jpg   # known-motion video of a face photo
npm run test:e2e            # replays that video through both arms in a real browser (~16 min)
```

`make-synthetic.mjs` defaults its eye position to OpenCV's `samples/data/lena.jpg` (in
`.opencv-build/opencv/` after the OpenCV build).

## Folder contents

| Path                           | What                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `USER_INSTRUCTIONS.md`         | Step-by-step for participants                                   |
| `results/`                     | Result JSONs from the sessions above                            |
| `scripts/`                     | Asset download, OpenCV.js build, synthetic test-video generator |
| `e2e/`, `playwright.config.ts` | Browser test replaying the synthetic video through both arms    |
| `.opencv-build/`               | OpenCV sources and build cache (gitignored)                     |
