#!/usr/bin/env bash
# Copies the MediaPipe wasm runtime out of node_modules and downloads the Face Landmarker
# model, so arm B is served locally like arm A (fair load-time comparison, works offline).
# Output lands in static/mediapipe/ (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/static/mediapipe"

mkdir -p "$OUT/wasm"
cp "$ROOT"/node_modules/@mediapipe/tasks-vision/wasm/* "$OUT/wasm/"
[ -s "$OUT/face_landmarker.task" ] || curl -fL --retry 3 -o "$OUT/face_landmarker.task" \
	'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

ls -lh "$OUT"
