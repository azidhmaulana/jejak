# JEJAK: SEO, keamanan, dan kapasitas

Domain produksi: **https://jejak.kecoalabs.com**. Jalankan `npm run build` lalu `npm start` di belakang reverse proxy HTTPS. Jangan expose Vite dev server atau port API langsung ke internet.

## SEO

- Homepage menyediakan title, description, canonical, Open Graph, Twitter metadata, dan structured data WebSite.
- `/tentang.html` menyediakan penjelasan fitur yang bisa dibaca tanpa JavaScript, dengan tautan dari footer aplikasi. Peta canvas sendiri bukan konten teks yang dapat diindeks.
- Sitemap: `https://jejak.kecoalabs.com/sitemap.xml`. Verifikasi domain di Google Search Console lalu submit sitemap setelah domain live. Tidak ada jaminan ranking pertama.
- Reverse proxy harus redirect HTTP ke HTTPS dan host alternatif ke domain canonical. Staging harus dilindungi autentikasi atau diberi `X-Robots-Tag: noindex`; jangan mengandalkan robots.txt sebagai kontrol keamanan.
- Jangan membuat halaman kota/claim stream live yang belum didukung data. Tambahkan halaman wilayah berisi informasi nyata ketika katalog sudah terverifikasi.

## Perlindungan yang diterapkan

- API umum: 300 request/menit/IP. Media: 1.800 request/menit/IP, bucket terpisah untuk segmen video. Maksimal 10.000 identitas per limiter; identitas tambahan ditolak saat penuh.
- Login/setup/register: 15 percobaan/15 menit/IP. Maksimal 4 mutasi akun berjalan sekaligus untuk membatasi pekerjaan password hashing.
- Maksimal 128 request API aktif, di samping batas upstream media dan health yang sudah tersedia. Overload menghasilkan 429 atau 503 dengan Retry-After, tanpa antrean tak terbatas.
- Client disconnect dan response selesai membebaskan slot tepat satu kali.
- Header nosniff, anti-framing, referrer policy, permissions policy, dan CSP dasar. CSP ini belum strict script policy karena aplikasi memakai integrasi peta/video; jangan menganggapnya perlindungan XSS menyeluruh.
- Timeout inbound body 120 detik dan header 15 detik; bukan batas durasi playback video.
- Trust proxy default mati. Set `JEJAK_TRUST_PROXY` hanya ke IP/CIDR reverse proxy sebenarnya (contoh `127.0.0.1,::1` bila proxy lokal). Jangan set ke semua alamat. Proxy harus menimpa forwarded headers dan mempertahankan Host publik agar pemeriksaan same-origin bekerja. Secure cookie aktif di produksi; HSTS diberikan bila koneksi terdeteksi HTTPS.

## Batas dan pekerjaan deployment

Limiter menggunakan memori satu proses, bukan perlindungan DDoS terdistribusi. Banyak pengguna di satu NAT berbagi kuota. Terapkan WAF/rate limit/CDN pada edge, limit koneksi dan bandwidth, lalu ukur kapasitas pada server produksi. Untuk banyak instance gunakan limiter terdistribusi dan strategi database/session yang sesuai; jangan membagikan SQLite secara sembarang melalui network filesystem.

Pantau 429/503, CPU, memori, latensi API, bandwidth media, disk dan error upstream. Backup database akun secara konsisten, batasi izin direktori runtime, jangan publish `.env`, token setup, atau database. Rotasi kredensial jika pernah terpapar. Batasi log agar tidak merekam cookie/token/password.

Audit dependency produksi saat perubahan ini: `npm audit --omit=dev` tidak melaporkan vulnerability. Hasil ini bukan pentest atau jaminan semua celah sudah ditemukan. Jalankan ulang audit dan test sebelum deployment.

Referensi: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Google JavaScript/developer guidance](https://developers.google.com/search/docs/fundamentals/get-started-developers), [Express production security](https://expressjs.com/en/advanced/best-practice-security/).
