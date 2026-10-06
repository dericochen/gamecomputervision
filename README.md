# AI Hand Battle

Game kamera 60 detik dengan bidik, energy blast, shield, dan nova. Kamera diproses di perangkat, tanpa merekam atau mengunggah video.

## GitHub Pages

Konfigurasi deploy sudah ada di `.github/workflows/pages.yml`; panduan ada di [DEPLOY_GITHUB.md](DEPLOY_GITHUB.md). Folder situs: `dist`. Tidak perlu API key atau proses build. Jalankan `npm test` untuk pemeriksaan sebelum deploy.

## Gesture update v3

- Pengenal gestur terlatih membedakan telunjuk, telapak terbuka, dan kepalan. Bentuk yang belum jelas tetap dapat menggerakkan bidikan tanpa memicu aksi khusus.
- Tes kamera menampilkan reticle, sasaran latihan, nama gestur, dan indikator empat gerakan sebelum ronde dimulai.
- **Kalibrasi 4 gerakan** menyesuaikan bentuk tangan. Setiap langkah memberi waktu persiapan 2 detik dan mengambil sampel selama 1,2 detik. Gerakan yang tidak sesuai, terlalu mirip, atau tidak stabil perlu diulang. Kalibrasi aktif setelah semua langkah berhasil, tersimpan dalam memori halaman saja, dan bisa direset.
- Serangan memerlukan gestur stabil. Melepas jepitan menghentikan tembakan; bentuk tidak jelas tidak melepaskan nova. Nova dilepas setelah telapak/bidik/jepit yang valid muncul.
- Bidikan memakai area kamera yang lebih nyaman, dengan penghalusan gerak dan posisi tetap saat jari dilipat untuk menembak.

## Controls

- Raise the aiming hand first. Index finger: aim. Pinch thumb and index: repeated energy blast. The reticle stays anchored when the finger curls, and follows palm movement while pinched. Every shot uses the displayed reticle position.
- Open palm: shield. A second hand can shield while the first fires. Shield energy drains while held, locks at empty, and must be released to recover to 25 energy before reuse.
- Closed fist for 1.5 seconds, then release: arena-wide nova. Cooldown: 5 seconds.
- Training: pointer or arrow keys to aim, click/Enter to fire, S to shield, hold Space and release for nova. Touch controls are available below the arena.

Missing hands freeze play and countdown immediately. Tracking results older than 350 ms also freeze play. Interruptions exceeding 650 ms display a pause screen; stable reacquisition is required for automatic continuation. Switching away from the page pauses the round without automatic background resumption. Pause clears charge and inputs; release a pinch/fist before attacking again. Camera tracks stop on returning to the menu or leaving the page.

Daily top ten scores are stored only in this browser's localStorage, with separate camera/training lists. They are not shared between devices. No fake player scores are seeded. Sound is synthesized locally and opt-in.

## Implementation

Static HTML/CSS/JS with Canvas rendering. MediaPipe Tasks Vision 0.10.21 and the Gesture Recognizer float16 v1 model are bundled under `dist/vendor`. Inference normally runs in a classic Web Worker, so MediaPipe's WASM script loader can use importScripts. Tracking is throttled to at most 20 requests/second and allows one frame in flight. Unsupported worker/bitmap capabilities, repeated bitmap errors, worker failures, or timeouts trigger a throttled main-thread fallback. Two hands and 21 landmarks per hand are supported. World-space geometry is used when provided, with aspect-corrected image coordinates as fallback. Stable hand identities avoid swapping controllers when result order changes. Telemetry shows observed inference timing and tracking rate.

Runtime dependency and model sources:

- https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21
- https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task
- https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js

MediaPipe is licensed under Apache 2.0. Google Fonts load optional typefaces; system fonts are the fallback.

## Verification

Run `npm test` with Node.js 22+. It checks JavaScript syntax, bundled assets, baseline scoring/storage flows, and 44 regression cases: 32 synthetic game-state/gesture/calibration cases plus 12 replays of actual MediaPipe inference on Google's public sample photos. The pointing pose is recognized in original, mirrored, and rotated samples; unrelated gestures do not activate attacks or shields. Fixture provenance and limits are documented in `scripts/fixtures/README.md`.

The real-photo inference ran on CPU with MediaPipe Python 1.0.1 using the same bundled model asset. It does not substitute for live webcam, browser-rendering, or performance testing. Real-video pinch accuracy and behavior on the player's actual camera remain unverified; a physical webcam and supported Sites browser preview were unavailable. The app provides visible practice and optional calibration for that final device check.

Optional read-only WebMCP tool `read_arena_state` registers only when the browser exposes document.modelContext. No supported WebMCP browser context was available for validation.
