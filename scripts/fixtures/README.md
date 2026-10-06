# Gesture fixtures

`real-landmarks.json` contains actual model inference output from the MediaPipe Gesture Recognizer float16/v1 task, executed on CPU with MediaPipe Python 1.0.1. It is not hand-authored landmark data.

Source photos are the four public samples from Google's official notebook:

https://github.com/googlesamples/mediapipe/blob/main/examples/gesture_recognizer/python/gesture_recognizer.ipynb

- https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/pointing_up.jpg
- https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/thumbs_up.jpg
- https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/thumbs_down.jpg
- https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/victory.jpg

Each photo was inferred as original, horizontally mirrored, and rotated 35 degrees with an expanded canvas. The photos are not redistributed here. The pointing examples must activate aim. Unrelated poses and the one no-hand result must not activate shooting, shield, or nova.

These fixtures validate the game's interpretation of real model output. They do not establish live webcam accuracy, pinch accuracy on real video, browser rendering, or performance on the player's device. Temporal transitions and calibration are covered separately using synthetic sequences in `scripts/regression.mjs`.
