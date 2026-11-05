# Koordinat tampilan CCTV Bina Marga

Tanggal pemeriksaan: 5 November 2026. Seluruh 1.413 kamera katalog memiliki koordinat tampilan. **Tidak ada posisi tiang kamera yang diklaim sudah terverifikasi.**

- 495 `chainage-estimate`: nomor KM eksplisit pada nama dicocokkan ke STA fitur ruas PU, lalu diinterpolasi menurut jarak sepanjang garis.
- 885 `road-reference`: titik tengah sepanjang satu geometri ruas terkait. Kamera pada ruas yang sama dapat berbagi titik. Ini bukan estimasi KM kamera; tidak disebar acak agar terlihat lengkap.
- 5 `locality-reference`: referensi wilayah Kutanegara (Karawang), Kraksaan, atau Paiton (Probolinggo), dari hasil Photon/OpenStreetMap. Bukan posisi gerbang tol atau kamera.

Sumber geometri: [Master Data Jalan Tol Operasi, Kementerian PU](https://data.pu.go.id/sites/default/files/geojson/ast_bpjt_tol_operasi.geojson), [metadata dataset](https://data.pu.go.id/dataset/7cc90b1b-8739-4163-b991-b28d40d7f344). Metadata publikasi baru tidak menjamin semua ruas/STA terkini; beberapa geometri hanya mencakup sebagian ruas.

Pemetaan ruas ke feature ID ditinjau eksplisit dalam `scripts/locate-binamarga.py`. Interpolasi hanya untuk LineString dengan dua STA, nomor KM di dalam rentang, panjang geometri dalam 15% panjang STA, serta titik awal sesuai metadata. MultiLineString, nomor gerbang, nomor kamera, dan KM yang ambigu tidak dipaksakan menjadi chainage. Arah dan kalibrasi STA tetap perlu verifikasi lapangan; metode ini tidak memberi akurasi meter.

Contoh 28+600: latitude -6.164837, longitude 106.912475, referensi PU feature 18, ruas 6 Tol Dalam Kota Jakarta, STA 21+881–31+168. Ini hasil interpolasi, bukan koordinat hasil survei.

Seluruh kamera ditandai `coordinateAccuracy: approximate`, `cameraPositionVerified: false`, `eligibleForRouteMatching: false`. Backend route mengabaikan koordinat approximate. UI search, tooltip marker, dan monitor menjelaskan kualitas posisi.

Reproduksi: unduh GeoJSON sumber, lalu jalankan `python scripts/locate-binamarga.py PATH_TO_GEOJSON`. Output memperbarui katalog, daftar kandidat, dan ringkasan coverage. Setiap kamera menyimpan URL sumber dan feature ID atau nama wilayah. Koordinat kandidat eksternal lama tetap tidak diterima sebagai koordinat kamera.

## Pemeriksaan ulang ruas yang dilaporkan

20 kamera Kuala Tanjung?Tebing Tinggi?Parapat sekarang menggunakan `source-location`: koordinat dari redirect tautan Google Maps pada kartu CCTV Bina Marga. 8 kamera memakai `junction-reference` dari simpang bernama OpenStreetMap yang cocok. Segmen Bangkinang?Pangkalan Tahap I jalur A (PU feature 144) ditambahkan ke pemetaan sehingga 6 kamera BANGPANG dapat diinterpolasi. Jalur B belum dipaksakan karena orientasi geometri/STA berbeda.

Override yang ditinjau disimpan di `binamarga-location-overrides.json` dan diterapkan ulang oleh generator. Semua masih excluded dari route presisi. Katalog tidak memiliki koordinat null, tetapi titik referensi bersama bukan lokasi masing-masing kamera. PERMAI, INKIS, BINSA, Medan?Binjai, sebagian Jambi/Pekbang/Sigli/Jogja/Paspro/Ujung Pandang masih perlu verifikasi posisi per kamera.
