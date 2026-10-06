# Deploy ke GitHub Pages

Proyek sudah berisi workflow `.github/workflows/pages.yml`. Folder yang diterbitkan adalah `dist`, bukan seluruh repositori. Model dan WASM sudah disertakan; tidak perlu build atau API key.

1. Buat repositori GitHub bernama `ai-hand-battle`, atau pilih repositori tujuan.
2. Unggah isi proyek, termasuk folder `.github`, ke branch `main`. Jika memakai ZIP, ekstrak terlebih dahulu; jangan hanya mengunggah ZIP sebagai satu berkas.
3. Buka **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Buka **Actions → Deploy AI Hand Battle → Run workflow**. Push berikutnya ke `main` atau `master` akan memicu pemeriksaan dan deploy otomatis.
5. Tunggu kedua job `build` dan `deploy` berhasil. URL situs ditampilkan pada deployment `github-pages` dan halaman Settings → Pages.

GitHub Pages tersedia untuk repositori publik pada GitHub Free. Repositori privat membutuhkan paket GitHub yang mendukung Pages. Pilih visibilitas repositori sesuai kebutuhan; jangan mengubah repositori privat menjadi publik tanpa keputusan pemilik.

## Verifikasi lokal

Dengan Node.js 22 atau lebih baru:

```sh
npm test
```

Tidak perlu `npm install` karena tes menggunakan modul bawaan Node.js. Untuk mencoba kamera di komputer sendiri:

```sh
python -m http.server 8000 --directory dist
```

Buka `http://localhost:8000`, izinkan kamera, lalu gunakan **Kalibrasi 4 gerakan**. Untuk pemakaian melalui jaringan atau perangkat lain, gunakan URL HTTPS GitHub Pages.

Kamera diproses di perangkat. Skor disimpan di browser masing-masing. Kalibrasi hanya disimpan selama halaman masih terbuka.

Panduan resmi: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
