# Panduan tuning front office

Buka Settings → LLM Backend / Front Office. Mode eksperimen terpisah dari chat agent: tidak ada Context Box, personality, skill guidance, tools, RAG atau long-term memory yang disisipkan. History percakapan eksperimen tetap disimpan lokal dan dikirim lengkap pada turn berikutnya. Provider yang dipilih menerima pertanyaan dan history tersebut.

## Mulai dari Basic

1. Simpan API key pada Settings provider, lalu refresh capability catalog untuk provider itu.
2. Aktifkan experimental chat, pilih manual model/deployment dan simpan backend settings.
3. Buat New experiment, kirim pertanyaan sintetis, lalu lihat routing/budget, attempts dan usage/timing.
4. Pin manual berlaku untuk percakapan tersebut. Perubahan global Auto Router/model hanya berlaku untuk sesi baru yang belum dipin.
5. Jika history terlalu besar, request ditolak dengan alasan. Mulai eksperimen baru atau sesuaikan batas yang didukung; tidak ada history yang dibuang diam-diam.

Katalog membedakan advertised context dari tested context. Filter berdasarkan capability, key tersedia, minimum context, measured-only, favorites dan sample budget. Pilih evidence task untuk melihat hasil tugas yang sesuai. Unknown bukan false dan bukan supported. Harga null bukan gratis. Skor Not tested bukan ranking kualitas buatan.

## Advanced configuration

JSON non-secret menyediakan satu tempat untuk seluruh kontrol. Apply memvalidasi semua nilai; import berisi key atau field asing ditolak tanpa mencetak isinya. Export tidak menyertakan credential. Reset mengembalikan defaults dan mematikan eksperimen.

| Kontrol | Rentang / satuan | Konsekuensi |
| --- | --- | --- |
| routing.mode | manual / auto | Auto harus diaktifkan eksplisit; pin sesi tetap dihormati |
| priority / weights | balanced, quality, cost, speed; bobot 0–1, minimal satu >0 | Skor transparan, tidak menambah panggilan classifier |
| allowedProviders | openrouter / nvidia, minimal satu | Daftar tujuan prompt yang diizinkan, termasuk fallback |
| unverifiedContext | strict / warn / allow | Default warn; strict menolak input tanpa bukti panjang konteks yang sesuai |
| allowFallback / allowModelSwitch | boolean, default false | Fallback hanya auto; pergantian model logis perlu flag kedua |
| allowCrossProviderFallback | boolean, default false | Persetujuan terpisah sebelum history dapat dikirim ke provider lain |
| benchmarkMaxAgeDays | 1–365 hari | Bukti stale tidak menaikkan quality; metadata stale tidak membenarkan auto/cost cap |
| maxOutputTokens | 1–131072 token, di bawah context bound | Cap request, reasoning dapat berbagi anggaran provider |
| contextWindow | 512–2097152 token | Batas lokal, tetap dibatasi advertised capacity yang diketahui |
| headroomFraction | 0–0.5 | Default 0.15 untuk overhead; placeholder konservatif, bukan hasil optimasi |
| temperature | 0–2 | Parameter umum; endpoint yang tidak mendukungnya ditolak bila metadata menyatakan demikian |
| format / jsonSchema | text / json; subset schema terdokumentasi | Output diperiksa lokal, tidak ada repair tersembunyi |
| maxEstimatedUsd / maxTotalTokens | null atau batas non-negatif / token positif | Null berarti tanpa cap tambahan; cap USD menolak harga unknown/stale |
| maxAttempts | 1–4 panggilan | Default 2, termasuk retry/fallback, tidak digandakan proxy |
| deadlineMs | 1000–600000 ms | Deadline kumulatif dari accepted request; default 60000 |
| backoffMs | 0–10000 ms | Backoff eksponensial, dibatasi deadline |
| cooldownMs / circuitThreshold | 1000–300000 ms / 1–10 kegagalan | Circuit lokal per deployment |
| retentionDays | 1–90 hari | Default 14; hanya log metrics terpisah, bukan percakapan/run immutable |
| rawPromptLogging / rawResponseLogging | boolean, default false | Opt-in debug privat di run immutable; tidak masuk metrics export dan tidak dihapus oleh metrics retention |
| gateway.enabled / baseUrl / version | boolean; HTTP 127.0.0.1:PORT/v1; 1.106.6 | Proxy eksternal opsional, wajib autentikasi; tidak dijalankan otomatis |

Gateway key disimpan terpisah melalui safeStorage. Jangan menaruhnya di JSON atau YAML repo. Liveness check tidak membuktikan versi server, entitlement NVIDIA atau kuota. Lihat 03-provider-setup-openrouter-nvidia.md sebelum menyiapkan layanan opsional.

## Membaca eksperimen

Estimated tokens adalah heuristik UTF-8, bukan tokenizer model terverifikasi. Reported tokens berasal dari adapter; partial usage adalah subtotal yang diketahui, bukan biaya nol. firstContentMs mengukur callback; adapterFirstTokenMs memakai diagnostik adapter. Backend duration belum mencakup keseluruhan klik-ke-render. JSON invalid dilabeli gagal validasi dan tidak diperbaiki dengan panggilan berbayar tersembunyi.

Gunakan Stop jika diperlukan. Setelah teks parsial keluar, retry otomatis berhenti. Explicit Retry failed turn mempertahankan satu user turn dan mencatat percobaan baru. Jangan aktifkan fallback lintas provider jika tidak ingin history dikirim ke provider tersebut.

Jalankan npm.cmd run benchmark:front-office untuk bukti harness sintetis. Hasil mock tidak membuktikan kualitas model atau kecepatan LiteLLM. A/B live memerlukan model/provider dan parameter identik, beberapa repetisi, rubric, jumlah sampel dan uncertainty. Tidak ada angka peningkatan yang diklaim sebelum pengukuran nyata.
