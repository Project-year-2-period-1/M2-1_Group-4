# M2-1_Group-4: Parallax Tracker

Webcam head tracking drives a head-coupled 3D view, so the screen acts as a window and the scene
appears to have depth through motion parallax, without stereo glasses.

**How it works:** see [`docs/WORKFLOW.md`](docs/WORKFLOW.md) for the pipeline diagram and a
description of each stage.

## Running the prototype

You need Node.js 22 or newer, a webcam, Chrome or Edge, and a bash shell (Git Bash on Windows).

```sh
npm install
./facialID-test/scripts/fetch-mediapipe.sh   # copies the MediaPipe runtime, downloads the face model
npm run dev
```

Open <http://localhost:5173/bench/live> (`npm run dev -- --open` opens the browser for you).

### Using it

1. **Measure once** (millimetres, saved in the browser) and fill in "Screen & marks":
   - the visible screen width and height
   - the webcam's position relative to the screen centre (on a laptop: x = 0, y ≈ half the
     screen height + 8)
   - **C:** your normal sitting distance from webcam to eyes
   - **R:** put tape on the desk edge straight below the webcam and another piece e.g. 150 mm
     to your right, and enter that distance
2. Keep the tracker on **MediaPipe Face Landmarker** and press **Start**. Allow camera access.
3. Under Estimator, pick **MediaPipe transformation matrix / poseMatrix**: the option our tests
   found best.
4. Sit at C (nose over the centre tape) and click. Then slide (don't lean) to R and click. Hold
   still for 1.5 s each time.
5. Press **Parallax scene** and move your head.

On a phone: `npm run dev:phone`, then open `https://<your-computer's-IP>:5173/bench/live` and
accept the self-signed certificate (phones only allow camera access over HTTPS).

### Other commands

```sh
npm test         # unit tests for the maths and analysis
npm run check    # type check
npm run lint     # formatting check (npm run format to fix)
```

## Where the code is

| Stage                                     | File                                          |
| ----------------------------------------- | --------------------------------------------- |
| Webcam + per-frame loop, calibration flow | `src/lib/bench/live.ts` (`LiveTracker`)       |
| Face tracking (neural network)            | `src/lib/bench/trackers/mediapipe.ts`         |
| Pose → centre + size                      | `src/lib/bench/estimators.ts`                 |
| Calibration → mm                          | `src/lib/bench/geometry.ts`                   |
| Smoothing                                 | `src/lib/bench/oneEuro.ts`                    |
| 3D rendering                              | `src/lib/bench/parallax.ts` (`ParallaxScene`) |
| Page                                      | `src/routes/bench/live/+page.svelte`          |

The code sits under `bench/` because it was built alongside the tracker benchmark. MediaPipe vs
OpenCV results, and how to take part in the test, are in
[`facialID-test/`](facialID-test/README.md).
