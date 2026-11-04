# JEJAK — OSINT workspace

Ekstraksi workspace OSINT dari working tree `bms_cueing` (HEAD saat migrasi: `94e0163`). Aplikasi React + TypeScript dengan provider, drawing, dan konfigurasi peta dari sumber, serta UI command center mengikuti referensi visual terbaru.

## Menjalankan

Gunakan Node.js 24 atau lebih baru; SQLite bawaan Node dipakai untuk membaca MBTiles/GMDB.

```sh
npm ci
npm run dev
```

Buka `http://127.0.0.1:5173`. Perintah ini menjalankan frontend dan API lokal sekaligus. `.env` opsional; contoh tersedia di `.env.example`.

```sh
npm run build
npm start
```

Build produksi dilayani di `http://127.0.0.1:4174`. `npm run preview` juga menjalankan server beserta API, sehingga penyimpanan tetap berfungsi. Default server adalah loopback untuk penggunaan lokal. Modul login, akun, dan role BMS tidak termasuk ekstraksi ini.

## Fitur yang dibawa

- MapLibre, pusat awal Bandung `[107.6191, -6.9175]`, zoom 12, navigasi vertikal, header status, panel layer, inspector CCTV, camera dock, dan pengaturan warna/glow.
- Provider online: ArcGIS/Esri, Google Maps, OpenStreetMap, CARTO, EOX, MapTiler; jenis peta, atribusi, key provider, kontrol zoom/kompas/skala.
- Provider offline: GMDB/GMap.NET, MBTiles raster, OpenMapTiles, Protomaps, dan EOX satellite. Pilihan paket aktif mengikuti manifest offline.
- Terra Draw: point, line, polygon, rectangle, circle, edit geometri/style, pengukuran, history, objek/grup, visibility/lock, import KML/GeoJSON, dan export.
- Penyimpanan drawing dengan cache browser, retry, deteksi konflik antar-client, dan penulisan file atomik; overlay PNG dengan koordinat, rotasi, opacity, serta revision/lock.
- Layer cuaca dan kontrol waktu; katalog CCTV publik, sumber manual, HLS, preview, serta health monitor dengan pembatasan concurrency.
- Bahasa Indonesia/Inggris, fullscreen, dan layout responsif.

UI baru menyediakan pencarian katalog, Nearby (jarak ke pusat peta), Favorites dan Recent yang disimpan di browser. Layer jalan memakai paket OpenMapTiles lokal yang aktif, jika tersedia. Preview dock hanya membuka maksimal tiga stream yang telah terverifikasi online dan terlihat di layar. Kartu tanpa preview menampilkan placeholder; angka online/alert memakai health check aktual. Feed Monitor menampilkan gangguan kamera, bukan deteksi insiden atau aktivitas manusia. Kategori feed sumber yang belum terintegrasi tidak ditampilkan sebagai fitur aktif pada navigasi baru.

Panel CCTV menampilkan empat kontrol Surveillance: CCTV Cameras, Live Previews, Camera Offline, dan Live News Feeds. Dock kamera dapat dilipat dengan animasi turun, menyisakan baris tab; pilihan lipat disimpan di browser dan preview dihentikan saat dilipat. Toolbar peta dan header status berada di atas footer. Sidebar, peta, dan inspector menggunakan ruang layout terpisah agar tidak saling menutupi; pada layar kecil panel disusun vertikal.

Ketersediaan cuaca, CCTV, pencarian lokasi, dan tile online bergantung pada layanan asal. Google Maps/MapTiler memerlukan key sendiri yang diisi lewat toolbar; key dibatasi domain dan disimpan di browser.

## Struktur dan pemakaian ulang

```text
src/
  app/                    entry aplikasi dan style dasar
  features/
    osint/                komposisi workspace, sidebar, ticker
    surveillance/         CCTV, katalog, player, konfigurasi, state
    weather/              layer dan panel cuaca
  modules/
    maps/                 MapCanvas, provider, navigasi, preferences
    drawing/              controller, geometri, import, history, UI, sinkronisasi
    overlays/             layer, editor, state overlay gambar
  shared/                 komponen shell, hook, i18n, tema
server/                   API drawing, overlay, proxy dan health CCTV
services/offline-maps/    reader dan manajemen paket peta dari sumber
test/                     unit, API, dan pengujian browser
```

`app` menyusun fitur; `features` menggunakan `modules`; modul tidak mengimpor fitur OSINT. `MapCanvas` menerima render callback `children(map)` untuk memasang layer lain. `MapTools` menerima `searchItems` dan callback `onSelect`, sehingga pencarian CCTV tidak menjadi dependensi modul drawing. Public exports tersedia pada `index.ts` setiap modul. State drawing saat ini satu workspace per dokumen, mengikuti aplikasi sumber; jangan memasang dua controller drawing sekaligus dalam satu halaman.

Nama class CSS serta properti data `bms*` dipertahankan untuk kompatibilitas format. Scope browser dan API dikunci ke OSINT, termasuk saat membuka `/`, sehingga tidak memakai proyek BMS default. Integrasi perangkat/radar/target BMS tidak dimuat oleh workspace ini.

## Data lokal dan peta offline

Data aplikasi disimpan di `.runtime/` dan tidak masuk Git:

- `osint-project.json`: drawing dan grup.
- `image-overlays.json`: overlay.
- `offline-maps/regions.json` dan `offline-maps/packages/`: manifest dan paket peta.
- `map-assets/`: font dan sprite vektor offline.

Pada workspace ini, dua paket yang tersedia di sumber sudah disalin: OpenMapTiles Indonesia (sekitar 1,36 GB) dan GMDB (sekitar 400 MB), beserta manifest/pilihan aktifnya. Pilih **Offline** di footer, lalu paket yang diinginkan. Pengaturan awal tetap `esri-dark`, seperti sumber. File runtime tidak ikut ketika repo di-clone dari Git; salin direktori data secara terpisah atau gunakan API import. Data drawing yang tersimpan pada database/backend BMS lama dan preferences browser asal tidak otomatis dipindahkan.

Untuk memasang ulang font/sprite pada mesin baru (Python 3):

```sh
python scripts/setup-map-assets.py
```

Script mengambil aset Protomaps dari sumber yang sama dengan Dockerfile BMS. Dataset peta tetap mempertahankan atribusi asal. `MAP_DATA_DIR` dapat menunjuk salinan dataset lain, `MAP_ASSET_DIR` menunjuk folder aset. Hindari berbagi direktori tulis dengan server BMS yang sedang berjalan.

Kontrak API tetap kompatibel:

| Endpoint | Fungsi |
| --- | --- |
| `GET/PATCH /api/bms/projects/osint` | Baca/sinkronisasi drawing |
| `/api/osint/map-overlays` | CRUD overlay |
| `/api/osint/camera-health` | Status sumber kamera |
| `/api/osint/camera-media/:id/:resource` | Proxy media katalog |
| `/api/offline-maps/regions` | Daftar/manajemen paket |
| `POST /api/offline-maps/import?filename=...` | Import binary MBTiles/GMDB dengan content-type `application/octet-stream` |
| `PUT /api/offline-maps/active` | Aktivasi paket dengan body `{ "id": "...", "enabled": true }` |

Server drawing memakai satu proses pemilik direktori data. Unduhan Protomaps tambahan memerlukan executable `pmtiles` pada PATH, sebagaimana layanan sumber. Menampilkan paket MBTiles/GMDB yang sudah disalin tidak membutuhkan executable tersebut.

## Verifikasi

```sh
npm test
npm run test:offline
npm run test:browser
npm run build
npm run format:check
```

Browser test menggunakan Google Chrome yang terpasang, menjalankan server sementara, dan menyimpan data pengujian di `.runtime/browser-tests`. Screenshot berada di `test-results`. Test mencakup drawing melalui klik, penyimpanan/reload, provider/key UI, panel OSINT, dan ukuran layar mobile. Live CCTV/cuaca tidak dijadikan syarat kelulusan karena bergantung jaringan/provider.

Provider online dan dataset katalog dipertahankan dari sumber. Saat verifikasi lokal, ArcGIS mengalami timeout; map satelit GMDB berhasil dirender dari data offline.

### Vehicle routing

The route panel supports car (OSRM) and motorcycle (Valhalla) routing. Vehicle choice is saved with a route; older saved routes default to car. Motorcycle requests use the motorcycle costing profile with highway/toll exclusions; routing depends on OpenStreetMap access data and is not live traffic navigation.

- `JEJAK_ROUTING_URL`: OSRM car endpoint (default `https://routing.openstreetmap.de/routed-car`).
- `JEJAK_MOTORCYCLE_ROUTING_URL`: Valhalla server base URL (default `https://valhalla1.openstreetmap.de`).

The public Valhalla endpoint is for bounded development use. Before a public deployment, configure a suitable hosted/self-hosted service or follow the provider's publication notice and identification requirements: https://valhalla.github.io/valhalla/start/introduction/ . Requests are rate-limited server-side and have no automatic retries.
