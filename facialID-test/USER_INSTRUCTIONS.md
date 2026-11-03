# Facial tracking test: instructions for participants

Thanks for helping. You will sit through a 2½-minute scripted test in front of your webcam
(or phone), then send three files to Omer. It takes about 15 minutes including setup.

You need: this repo, a laptop with a webcam, **Chrome or Edge**,
[Node.js](https://nodejs.org) 22 or newer, a tape measure and some tape. To test on a phone,
see [On a phone](#on-a-phone).

## 1. Get the app running (once)

From the repo folder:

```sh
npm install
./facialID-test/scripts/fetch-mediapipe.sh   # Windows: run this in Git Bash
npm run dev
```

Open <http://localhost:5173/bench>. You only need MediaPipe; skip the OpenCV build.

## 2. Set up your desk

The diagram at the top of the page shows this.

- **Tape:** put three small pieces of tape on the front edge of your desk: one straight below
  the webcam, one 15 cm to **your** left, one 15 cm to **your** right.
- **Three poses you can repeat:**
  - **C:** sitting normally
  - **N:** leaning in (e.g. forearms on the desk)
  - **F:** leaning back (e.g. back against the chair)
- **Measure each pose** from the webcam to the point between your eyes (a helper or a mirror
  makes this easier). Type the three numbers into "Positions" **in millimetres**: 38 cm is
  `380`.
  - An orange warning means you haven't replaced the example values.
  - A red warning means the numbers look like centimetres.

## 3. Fill in the session boxes

- **Participant:** your name
- **Lighting:** normal, dim or backlit
- **Glasses:** tick if you wear them
- **Machine:** your laptop (or phone) model

Leave Tracker on MediaPipe and Source on "Live webcam".

## 4. Run the test

Press **Start** and allow camera access, then follow the screen. You don't need to click
anything.

- **Orange "MOVE NOW":** go to the position shown and settle before the timer runs out.
- **Green "RECORDING: hold still":** stay still until the timer ends.
- **Blue "RECORDING: do this now":** do the action shown (talk and smile, turn your head, sway,
  cover your chin, lean out of view).

When it says to move to the left or right tape, **move your chair or whole body**; don't just
lean sideways. Left and right are your own left and right.

## 5. Send the files

When the results appear, click **Result JSON**, **Recording** and **Sidecar**, and send all
three files to Omer. They are named after you, e.g. `Alex_normal_noglasses.webm` (`.mp4` on an
iPhone).

The recording is a video of your face. It is only used to re-run this test with the other
tracker, and Omer will delete it on request.

**Optional:** repeat in dim light, or with a window or lamp behind you (your face should look
darker than the background in the preview), and send those files too.

## On a phone

The phone runs the test in its browser; a laptop with the repo serves the page. Phones only allow
camera access over HTTPS, so there is a separate command for this.

1. On the laptop, run `npm run dev:phone` (after the setup commands in step 1). It prints a
   **Network** address like `https://192.168.1.57:5173/`.
2. Connect the phone to the **same Wi-Fi** and open that address plus `/bench` in Chrome
   (Android) or Safari (iPhone).
3. You will see a security warning because the certificate is self-signed. This is expected
   for a local test server. Tap _Advanced → Proceed_ (Chrome) or _Show Details → visit this
   website_ (Safari).
4. **Stand the phone upright** on a table (e.g. against books) so it can't move during the
   test, front camera facing you, at roughly eye height.
5. Phones are used closer and see a narrower area, so use smaller distances:
   - Tape on the table edge in front of the phone: centre straight in front of it, and 8 cm to
     each side. Enter `80` in "L/R tape".
   - Measure your poses from the **front camera** to between your eyes. Sitting normally will be
     around 300-400 mm.
6. Put your phone model as "Machine", then run and send the files as in steps 3-5. Downloads
   end up in the Files app (iPhone) or Downloads (Android); send them from there.
