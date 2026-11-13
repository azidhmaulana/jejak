# Koordinat tampilan CCTV Bina Marga

## Pembaruan 7 November 2026

Seluruh 1.413 kamera tetap memiliki lat/lng. Komposisi terbaru: 628 `chainage-estimate`, 706 `road-reference`, 54 `junction-reference`, 5 `locality-reference`, dan 20 `source-location`. Koordinat terisi tidak berarti lokasi setiap kamera sudah diketahui secara presisi.

Empat dari 20 kamera katalog (21 kandidat) provider Ujung Pandang Seksi 1-3 memakai referensi gerbang/simpang bernama: Biringkanaya, Tallo Barat, Tallo Timur, dan off-ramp Tallo Timur. Biringkanaya menggunakan referensi gerbang Waze (-5.075456, 119.516305); secara geografis termasuk Makassar Seksi IV, sementara label provider sumber tetap dipertahankan. Tallo Timur/Barat menggunakan node OSM 7698953729/317910336. Off-ramp dan kamera Tallo Timur berbagi referensi simpang, bukan offset buatan. 16 entri katalog lain tetap memakai referensi ruas karena lokasi spesifik belum tervalidasi. Semua tetap approximate dan tidak dipakai untuk route matching presisi.

25 dari 26 kamera Semarang ABC diperbaiki: 23 estimasi KM dan dua referensi simpang (Gayamsari dan ujung Srondol). MultiLineString PU 103/104 dipisah per seksi A/B/C; huruf pertama pada A/B adalah seksi, huruf setelah slash adalah jalur. Seksi A menggunakan awal KM 420.400 pada geometri Krapyak; B menggunakan KM 429.600 pada Jangli, dan C memakai acuan simpang Jangli yang sama sebagai kalibrasi perkiraan. Jarak diukur sepanjang masing-masing seksi; jalur B dibalik. Format KM 430 C + 200 tetap dibaca sebagai 430.2. Ujung Srondol di luar panjang geometri tidak diekstrapolasi, melainkan memakai referensi endpoint. KM 421+000 Klampisan: -6.995187, 110.368728. Kamera Lingkar Jangli-Jatingaleh KM 429 masih memakai referensi ruas karena seksi/kalibrasinya belum jelas. Semua posisi tetap approximate, bukan koordinat tiang terverifikasi.

32 kamera Semarang-Demak Seksi 2 (Sayung-Demak) diperbarui: 25 estimasi KM dan 7 referensi simpang. Penomoran operasional KM 449-465 sesuai [laporan pembukaan operasi](https://www.idxchannel.com/economics/mulai-berbayar-segini-tarif-jalan-tol-semarang-demak-seksi-ii) digunakan pada mainline PU sepanjang sekitar 16 km, menggantikan penggunaan STA konstruksi 10+394-26+704. Kamera tanpa arah menggunakan feature 74 (A). KM 462+800: -6.931331, 110.631445. Kamera antrean gerbang, IC, dan akses memakai simpang Sayung/Demak dari OSM; beberapa kamera tetap berbagi referensi simpang karena posisi tiangnya belum diketahui. Seluruh hasil tetap approximate dan tidak dipakai untuk pencocokan rute presisi.

Daftar Jakarta-Cikampek berisi 66 kamera; 64 diperbaiki menjadi 44 estimasi KM dan 20 referensi gerbang/rest area. Mainline PU feature 137 (A) disambung dengan memangkas overlap; feature 136 (B) disambung lewat bagian loop penghubung terpendek tanpa ramp duplikat. Rentang STA 2-72 diinterpolasi mengikuti panjang mainline sekitar 70 km. KM 22+000: -6.279249, 107.062238. Kamera Cikatama memakai referensi plaza KM 70 berdasarkan BPJT; kamera gerbang memakai referensi simpang OSM, bukan posisi gardu tertentu. Dua entri rest area Cipularang 88A dan dua entri Palimanan-Kanci 207A ditempatkan pada ruas yang disebut namanya, dengan provider dan identitas stream dipertahankan.

Dua entri Jakarta-Cikampek masih memakai referensi ruas: `CIKAMPEK SURVEILLANCE` tidak menyebut lokasi, dan `CIKAMPEK KM 01+000` berada di luar geometri tervalidasi yang mulai STA 2. Tidak dilakukan ekstrapolasi atau penyebaran titik acak.

15 kamera Sedyatmo kini menggunakan 14 estimasi KM dan satu referensi plaza GT Cengkareng. Geometri PU 135/138 berupa MultiLineString dengan loop/jalur balik, sehingga hanya potongan mainline yang tersambung digunakan. Penomoran CCTV KM 20-32 berbeda dari STA lokal 0-11 pada metadata PU. Kalibrasi memakai GT Cengkareng 2 KM 31, berdasarkan [laporan pekerjaan Jasa Marga](https://ekonomi.bisnis.com/read/20250620/45/1886706/penuhi-spm-jalan-tol-dalam-kota-jasa-marga-preservasi-gerbang-tol-cengkareng) dan [lokasi plaza Waze](https://www.waze.com/live-map/directions/id/daerah-khusus-ibukota-jakarta/gerbang-tol-cengkareng-2?to=place.ChIJQbVOPecCai4RQuz78WWqO_s). Titik acuan diproyeksikan ke mainline, kemudian selisih KM diukur mengikuti geometri. Ini kalibrasi perkiraan, bukan survei tiang kamera. A/B memakai feature masing-masing; kamera tanpa arah memakai A sebagai referensi jalan. KM 32+000: latitude -6.110241, longitude 106.690394.

23 kamera Cibitung-Cilincing dengan nama `MR STA N` kini diestimasi sepanjang geometri PU feature 31 dari STA awal -0+375 di Cibitung menuju Cilincing. Nomor N ditafsirkan sebagai kilometer STA hanya untuk pola dan ruas ini. Metadata akhir 2+650 merupakan batas seksi, bukan ujung geometri sepanjang sekitar 34,6 km; karena itu tidak dipakai sebagai endpoint interpolasi. Arah jalur kamera belum diketahui, sehingga geometri A hanya menjadi referensi posisi jalan. MR STA 27: latitude -6.111065, longitude 106.994034. Semua tetap approximate dan dikecualikan dari pencocokan rute presisi.

Seluruh 16 kamera Tangerang-Merak sebelumnya berbagi titik tengah ruas. Empat nama KM kini memakai jarak sepanjang geometri PU yang dikalibrasi dari ujung Jakarta-Tangerang (KM 26.039). Geometri jalur B dibalik sebelum pengukuran. Metadata STA 60.239-87.539 pada feature 126/127 hanya menyebut subsegmen, sementara geometri membentang seluruh ruas sekitar 73 km; rentang STA tersebut tidak digunakan untuk kalibrasi ini.

KM 29+700 B sekarang memiliki perkiraan latitude **-6.206907**, longitude **106.539213**. Dua belas kamera entrance/exit menggunakan enam referensi simpang bernama dari OpenStreetMap, tersimpan di `binamarga-location-overrides.json`. Entrance dan exit pada simpang yang sama tetap berbagi referensi, tanpa offset acak. Ini bukan koordinat tiang hasil survei dan tetap tidak dipakai untuk pencocokan rute presisi.

Angka di bagian berikut adalah riwayat pemeriksaan awal, bukan total terbaru.

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
