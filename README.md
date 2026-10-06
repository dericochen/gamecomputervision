# AI Hand Battle

Game kamera 60 detik dengan bidik, energy blast, shield, nova, boss, dan power-up. Kamera diproses di perangkat, tanpa merekam atau mengunggah video. Tersedia sebagai **aplikasi desktop** (Windows, macOS, Linux) dan sebagai situs GitHub Pages.

## Aplikasi desktop

**Download:** buka tab **Actions → Build desktop app → Run workflow** di GitHub. Setelah selesai, unduh artefak:

- `ai-hand-battle-win`: `AI-Hand-Battle-Setup-x.y.z.exe` (installer) dan `AI-Hand-Battle-Portable-x.y.z.exe` (langsung jalan, cocok untuk laptop booth)
- `ai-hand-battle-mac`: `.dmg`
- `ai-hand-battle-linux`: `.AppImage`

Push tag `v*` (misalnya `v4.0.0`) juga akan melampirkan file ini ke GitHub Release.

Build belum ditandatangani (unsigned):
- Windows SmartScreen: pilih *More info → Run anyway*.
- macOS: klik kanan aplikasi lalu pilih *Open*.

**Menjalankan dari source** (Node.js 22+):

```sh
npm install
npm start          # buka aplikasi
npm run dist:win   # atau dist:mac / dist:linux, hasil di folder release/
```

Kelebihan aplikasi dibanding versi website:
- Berjalan offline, dan kamera diizinkan otomatis untuk game ini saja.
- Pelacak tangan memakai GPU, dengan CPU sebagai cadangan.
- Tidak ada throttling di background, dan layar tidak tidur selama aplikasi terbuka.
- Langsung masuk **Mode panggung** (arena layar penuh). Suara aktif sejak awal.

## Main di keramaian / booth

- **Pemain dikunci.** Pemain adalah orang yang tangannya paling dekat dengan kamera.
  - Tangan penonton di belakang ditampilkan abu-abu dengan label `DIABAIKAN`. Tangan ini tidak bisa membidik, menembak, membuka shield, atau mengisi nova.
  - Pelacak membaca hingga 4 tangan, jadi penonton tidak "merebut slot" tangan pemain.
- **Tangan kedua pemain** tetap bisa memakai shield. Syaratnya, ukurannya mirip tangan pertama dan masih dalam jangkauan lengan.
- **Selama ronde**, penonton tidak bisa mengambil alih. Kalau pemain keluar dari kamera, game dijeda sampai pemain (atau orang lain yang sama dekatnya) kembali.
- **Tanpa sentuh:** tahan ✋ telapak terbuka 2 detik di layar tes untuk mulai. Di layar hasil, tahan lagi untuk pemain berikutnya.
- **Mode panggung:** arena memenuhi layar dan menampilkan Top 5 hari ini. Panel samping disembunyikan. Tombol *Mode halaman* mengembalikan tampilan biasa.
- Leaderboard bisa direset dari panel *Top players*.

## Gameplay

- **Wave 1 (0–20 dtk):** VIRUS dan BUG yang cepat dan zig-zag.
- **Wave 2 (20–40 dtk):** muncul TROJAN berlapis baja (3 HP) dan WORM yang membelah jadi dua BUG.
- **Wave 3 (40–60 dtk):** semua musuh, plus **BOSS MEGA VIRUS** pada detik 42.
  - Boss punya 30 HP dan menembakkan BUG. Nova memberi 8 damage ke boss.
  - Mengalahkan boss memberi +3000 poin.
- **Bonus emas** melintas di atas layar: +400 poin, dan pasti menjatuhkan power-up.
- **Power-up** (tembak ikonnya):
  - ⚡ Rapid fire
  - ✦ Chain blast: mengenai 2 musuh terdekat
  - ✚ Core repair
  - ◈ Shield penuh
- **FEVER ×2:** setiap combo 12. Skor dobel dan tembakan cepat selama 8 detik.
- **Hasil ronde:** grade S/A/B/C/D, akurasi, peringkat harian, dan penanda rekor baru. 10 detik terakhir ditandai hitungan mundur.

## Kontrol

- **Telunjuk:** bidik.
- **Jepit ibu jari + telunjuk:** energy blast berulang.
- **Telapak terbuka:** shield, termasuk dengan tangan kedua.
  - Energi shield habis kalau ditahan terus.
  - Lepas telapak untuk mengisi ulang sampai 25 sebelum bisa dipakai lagi.
- **Kepalan 1,5 detik lalu buka:** nova ke seluruh arena. Cooldown 5 detik.
- **Latihan mouse:**
  - Bidik: mouse atau tombol panah.
  - Tembak: klik atau Enter.
  - Shield: S.
  - Nova: tahan lalu lepas Spasi.
  - Esc: jeda.

**Kalibrasi 4 gerakan** menyesuaikan pengenal gestur dengan bentuk tangan pemain. Kalibrasi hanya berlaku selama sesi.

## Implementasi

- HTML, CSS, dan JS statis dengan Canvas. MediaPipe Tasks Vision 0.10.21 dan model Gesture Recognizer float16 v1 dibundel di `dist/vendor`.
- Inferensi berjalan di Web Worker dengan delegate GPU, dan beralih ke CPU kalau GPU gagal.
  - Frame diperkecil ke lebar 960 px sebelum dikirim ke worker.
  - Laju tracking menyesuaikan kecepatan perangkat, maksimal ±30/detik, dengan satu frame dalam proses.
- Kalau worker gagal, game memakai fallback di main thread.
- Penulisan DOM per frame hanya terjadi saat nilainya berubah. Latar statis dirender sekali. Game loop tetap berjalan walaupun satu frame error.
- `electron/main.cjs` menyajikan `dist/` lewat origin privat `app://arena`.
  - Origin ini aman (secure), sehingga kamera, worker, WASM, dan ES module berjalan seperti di website HTTPS.
  - Halaman tidak punya akses Node.js (`contextIsolation`, `sandbox`).

Sumber dependensi:
- https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21
- https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js

## GitHub Pages dan verifikasi

Deploy website lewat `.github/workflows/pages.yml`; lihat [DEPLOY_GITHUB.md](DEPLOY_GITHUB.md).

`npm test` (tanpa `npm install`) memeriksa:
- sintaks,
- aset,
- alur skor dan leaderboard,
- 44 kasus regresi, termasuk 12 replay inferensi MediaPipe asli. Detail fixture ada di `scripts/fixtures/README.md`.

Akurasi webcam langsung dan performa di perangkat pemain tetap perlu dicoba di perangkat aslinya.
