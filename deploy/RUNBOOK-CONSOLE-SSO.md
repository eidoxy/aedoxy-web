# Runbook: root console masuk lewat Aedoxy, lalu login dan daftar password dimatikan

Untuk operator yang bekerja di terminal Bitvise pada VPS Ubuntu. Semua perintah dijalankan sebagai user biasa, di `~/aedoxy-web`, memakai `sudo docker compose ...`. Jangan menempel nilai rahasia ke terminal dan jangan mencetak `.env`.

## 0. Gambaran, prasyarat, dan peringatan

**Tujuan.** Pemilik produk mematikan dua pengaturan di console gateway (`ai.aedoxy.com`): login password (`PasswordLoginEnabled`) dan daftar password (`PasswordRegisterEnabled`). Akun root console (peran 100, username `eidoxy`) harus tetap bisa masuk.

**Fakta dari kode gateway yang mendasari rancangan ini:**

- Bila login password mati, endpoint login password menolak SEMUA akun, termasuk root, tanpa pengecualian. Root butuh jalur lain: (1) tombol Aedoxy (OIDC) lewat binding, dan (2) passkey console sebagai jaring pengaman yang tidak bergantung pada `aedoxy.com`.
- Login lewat penyedia OAuth mencari user lewat binding lebih dulu. Pengaturan `RegisterEnabled` baru diperiksa bila binding TIDAK ada. Root yang sudah punya binding tetap bisa masuk walau pendaftaran mati. User berstatus bukan aktif ditolak.
- Opsi yang diubah lewat SQL di tabel `options` dimuat ulang gateway tiap `SYNC_FREQUENCY` detik (bawaan 60; compose tidak menyetelnya). Tidak perlu restart.
- Jika root punya passkey atau 2FA aktif, SETIAP login root (tombol Aedoxy maupun password) meminta verifikasi faktor itu. Selama root punya passkey, pengaturan "Enable Passkey" di System Settings harus tetap aktif; bila dimatikan, login root lewat Aedoxy maupun password ditolak. Hilang perangkat passkey berarti root terkunci sampai langkah 8(d).

**Rancangan penautan.** Root ditautkan ke akun Aedoxy KHUSUS (username `eidoxy`, email root, terpisah dari akun admin harian). Penautan dilakukan SEBELUM email akun itu diverifikasi. Setelah itu `newapi_user_id` di database web sudah terisi, sehingga web tidak memanggil bridge dan tidak membuat user console duplikat.

**Apa yang berubah:** 1 baris di `user_oauth_bindings` (gateway), 1 kolom `newapi_user_id` di tabel `"user"` (web), 1 passkey, dan 2 sampai 3 pengaturan di console. Tidak ada image, kode, atau berkas compose yang berubah.

> **PERINGATAN.** Jangan matikan login password (langkah 6) sebelum uji masuk lewat Aedoxy di langkah 5 lulus. Jangan menutup sesi console root yang sedang terbuka sampai langkah 7 selesai.

**Konvensi.**

- `[BACA]` tidak mengubah data. `[UBAH]` mengubah data. Blok `[UBAH]` memakai transaksi dan memeriksa dirinya sendiri: bila pemeriksaan gagal, blok mencetak `DIBATALKAN` atau `GAGAL ... ROLLBACK` dan tidak mengubah apa pun. Baca keluarannya sebelum lanjut.
- Tempel satu blok penuh sekaligus. Blok memakai variabel shell (`ROOT_ID`, `PROVIDER_ID`, `SUBJECT`, ...) yang diisi di langkah sebelumnya; tetap pakai satu sesi terminal sepanjang runbook.
- Database gateway bernama `gateway-aedoxy` (user dari `$POSTGRES_USER` di dalam container). Database web bernama `aedoxy` (user `aedoxy`). Dua fungsi di bawah membungkus `psql` untuk keduanya; nilai variabel masuk lewat `-v` dan dikutip aman oleh `:'nama'`.

Definisikan sekali di awal sesi:

<!-- blok:fn -->
```sh
cd ~/aedoxy-web
sudo -v
gwsql()  { sudo docker compose exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d gateway-aedoxy -X -v ON_ERROR_STOP=1 "$@"' sh "$@"; }
websql() { sudo docker compose exec -T postgres sh -c 'exec psql -U aedoxy -d aedoxy -X -v ON_ERROR_STOP=1 "$@"' sh "$@"; }
```

## 1. Cadangan kedua database

`[BACA]` pada data, menulis dua berkas di `~/backup/`.

<!-- blok:dump -->
```sh
mkdir -p ~/backup && chmod 700 ~/backup
STAMP=$(date +%Y%m%d-%H%M%S)
sudo docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc -d gateway-aedoxy' > ~/backup/gateway-aedoxy-$STAMP.dump
sudo docker compose exec -T postgres sh -c 'pg_dump -U aedoxy -Fc -d aedoxy' > ~/backup/aedoxy-$STAMP.dump
chmod 600 ~/backup/*-$STAMP.dump
ls -l ~/backup/*-$STAMP.dump
```

Ukuran kedua berkas harus lebih dari 0 (biasanya puluhan KB ke atas). Periksa juga bahwa arsip terbaca:

<!-- blok:dump-verify -->
```sh
sudo docker compose exec -T postgres pg_restore -l < ~/backup/gateway-aedoxy-$STAMP.dump | head -n 4
sudo docker compose exec -T postgres pg_restore -l < ~/backup/aedoxy-$STAMP.dump | head -n 4
```

Hasil yang diharapkan: tiap perintah mencetak baris yang diawali `;` (`; Archive created at ...`, `; dbname: ...`). Bila kosong atau ada error, berhenti dan ulangi cadangan. Berkas ini berisi data pengguna: jangan disalin ke tempat publik.

## 2. Jaring pengaman: passkey untuk root

Lakukan SAAT login password masih aktif. Login sebagai root dengan password di `https://ai.aedoxy.com`.

1. Aktifkan fitur passkey di sistem. Klik menu profil (kanan atas sidebar) > `System Settings`, lalu di sidebar: grup `System Administration` > `Authentication` > `Passkey Authentication` (alamat `/system-settings/auth/passkey`). Nyalakan sakelar `Enable Passkey`, lalu klik `Save Changes`. Bagian `Passkey domains` harus menunjukkan domain `ai.aedoxy.com` (kolom kosong berarti domain diambil otomatis dari alamat situs sistem). Pengaturan ini default MATI; tanpa langkah ini passkey tidak bisa didaftarkan.
2. Daftarkan passkey root. Sidebar grup `Personal` > `Security & Access` (alamat `/security`). Di kolom kanan, bagian `Security verification`, kartu `Passkey Login`: klik `Enable Passkey`. Konsol bisa meminta verifikasi password lebih dulu. Ikuti perintah browser/perangkat untuk membuat passkey. Lencana pada kartu berubah dari `Disabled` menjadi `Enabled`. Satu user hanya bisa punya satu passkey.
3. Simpan perangkat atau pengelola passkey itu di tempat yang aman, terpisah dari akun Aedoxy. Ingat: sejak saat ini setiap login root meminta passkey ini (lihat bagian 0).
4. Uji: buka jendela privat, `https://ai.aedoxy.com/sign-in`, klik `Sign in with Passkey`. Root harus masuk.

Pastikan passkey tercatat. `[BACA]`:

<!-- blok:s2-passkey -->
```sh
gwsql <<'SQL'
SELECT u.id, u.username, count(p.id) AS passkey
FROM users u LEFT JOIN passkey_credentials p ON p.user_id = u.id AND p.deleted_at IS NULL
WHERE u.role = 100 AND u.deleted_at IS NULL
GROUP BY u.id, u.username;
SQL
```

Hasil yang diharapkan: satu baris, `username` = `eidoxy`, `passkey` = `1`. Bila `0`, ulangi langkah 2 sebelum lanjut.

Bila root mengaktifkan 2FA (kartu 2FA di bawah kartu passkey, halaman yang sama), simpan kode cadangannya juga. Cek status 2FA `[BACA]`:

<!-- blok:s2-2fa -->
```sh
gwsql <<'SQL'
SELECT user_id, is_enabled FROM two_fas WHERE user_id IN (SELECT id FROM users WHERE role = 100 AND deleted_at IS NULL) AND deleted_at IS NULL;
SQL
```

Nol baris berarti root belum punya 2FA; baris dengan `is_enabled` = `t` berarti aktif.

## 3. Kumpulkan nilai

`[BACA]`. Mengisi `ROOT_ID`, `PROVIDER_ID`, dan `USERS_BEFORE`.

<!-- blok:s3-values -->
```sh
ROOT_ID=$(gwsql -At <<'SQL'
SELECT id FROM users WHERE role = 100 AND deleted_at IS NULL;
SQL
)
PROVIDER_ID=$(gwsql -At <<'SQL'
SELECT id FROM custom_oauth_providers WHERE slug = 'aedoxy';
SQL
)
USERS_BEFORE=$(gwsql -At <<'SQL'
SELECT count(*) FROM users WHERE deleted_at IS NULL;
SQL
)
echo "ROOT_ID=$ROOT_ID PROVIDER_ID=$PROVIDER_ID USERS_BEFORE=$USERS_BEFORE"
case "$ROOT_ID.$PROVIDER_ID.$USERS_BEFORE" in
  *[!0-9.]*|.*|*..*|*.) echo "BERHENTI: tiap nilai harus tepat satu angka. Root harus tepat satu baris; slug aedoxy harus ada." ;;
  *) echo "OK: nilai valid" ;;
esac
```

Hasil yang diharapkan: `OK: nilai valid`. Bila `BERHENTI`, jangan lanjut (lebih dari satu root atau tidak ada penyedia `aedoxy`). Periksa juga akun dan penyedia, `[BACA]`:

<!-- blok:s3-show -->
```sh
gwsql -v root_id="$ROOT_ID" -v provider_id="$PROVIDER_ID" <<'SQL'
SELECT id, username, email, role, status FROM users WHERE id = :'root_id';
SELECT id, name, slug, enabled FROM custom_oauth_providers WHERE id = :'provider_id';
SELECT id, user_id, provider_user_id FROM user_oauth_bindings WHERE user_id = :'root_id' OR provider_id = :'provider_id' ORDER BY id DESC LIMIT 5;
SQL
```

Yang diharapkan: root `role` 100 dan `status` 1; penyedia `enabled` = `t`. Tabel binding terakhir memperlihatkan binding pengguna lain dan TIDAK boleh ada baris dengan `user_id` = `ROOT_ID`.

## 4. Buat akun Aedoxy root dan tautkan

**4a. Daftar.** Di `https://aedoxy.com` daftar dengan username `eidoxy` dan email milik root. **JANGAN klik tautan verifikasi di email dulu.** Biarkan email itu tak terbaca sampai langkah 4d selesai.

**4b. Ambil `SUBJECT`** (id user Aedoxy) `[BACA]`:

<!-- blok:s4-subject -->
```sh
ROOT_EMAIL='root@contoh.com'   # GANTI dengan email root yang dipakai mendaftar
SUBJECT=$(websql -At -v email="$ROOT_EMAIL" <<'SQL'
SELECT id FROM "user" WHERE email = lower(:'email');
SQL
)
echo "SUBJECT=$SUBJECT"
case "$SUBJECT" in
  ''|*[!A-Za-z0-9_-]*) echo "BERHENTI: akun tidak ditemukan atau hasil lebih dari satu baris." ;;
  *) echo "OK: subject valid" ;;
esac
```

**4c. Tautkan di database gateway** `[UBAH]`. Membuat satu baris binding (root, penyedia `aedoxy`, subject). Berhenti sendiri bila root salah, penyedia salah, atau binding sudah ada.

<!-- blok:s4-gw-link -->
```sh
gwsql -v root_id="$ROOT_ID" -v provider_id="$PROVIDER_ID" -v subject="$SUBJECT" <<'SQL'
SELECT (SELECT count(*) FROM users WHERE id = :'root_id' AND role = 100 AND deleted_at IS NULL) = 1
   AND (SELECT count(*) FROM custom_oauth_providers WHERE id = :'provider_id' AND slug = 'aedoxy') = 1
   AND NOT EXISTS (SELECT 1 FROM user_oauth_bindings WHERE provider_id = :'provider_id' AND (user_id = :'root_id' OR provider_user_id = :'subject'))
   AS ok \gset
\if :ok
BEGIN;
INSERT INTO user_oauth_bindings (user_id, provider_id, provider_user_id, created_at)
VALUES (:'root_id', :'provider_id', :'subject', now());
SELECT count(*) = 1 AS ok FROM user_oauth_bindings
WHERE user_id = :'root_id' AND provider_id = :'provider_id' AND provider_user_id = :'subject' \gset
\if :ok
COMMIT;
\echo 'OK: binding dibuat'
\else
ROLLBACK;
\echo 'GAGAL: dibatalkan (ROLLBACK), tidak ada perubahan'
\endif
\else
\echo 'DIBATALKAN: root/penyedia tidak cocok, atau root atau subject ini SUDAH punya binding. Tidak ada perubahan.'
\endif
SELECT id, user_id, provider_id, provider_user_id FROM user_oauth_bindings WHERE provider_id = :'provider_id' AND (user_id = :'root_id' OR provider_user_id = :'subject');
SQL
```

Hasil yang diharapkan: `OK: binding dibuat` dan tepat satu baris di akhir dengan `user_id` = `ROOT_ID` dan `provider_user_id` = `SUBJECT`.

**4d. Tautkan di database web** `[UBAH]`. Mengisi `newapi_user_id` pada akun Aedoxy root. Berhenti sendiri bila email sudah terverifikasi (artinya langkah 4a dilanggar; lanjut ke bagian 10), akun tidak ada, atau akun web lain sudah memegang `ROOT_ID`.

<!-- blok:s4-web-link -->
```sh
websql -v subject="$SUBJECT" -v root_id="$ROOT_ID" <<'SQL'
SELECT (SELECT count(*) FROM "user" WHERE id = :'subject' AND email_verified = false AND newapi_user_id IS NULL) = 1
   AND NOT EXISTS (SELECT 1 FROM "user" WHERE newapi_user_id = :'root_id')
   AS ok \gset
\if :ok
BEGIN;
UPDATE "user" SET newapi_user_id = :'root_id' WHERE id = :'subject' AND newapi_user_id IS NULL;
SELECT count(*) = 1 AS ok FROM "user" WHERE id = :'subject' AND newapi_user_id = :'root_id' \gset
\if :ok
COMMIT;
\echo 'OK: newapi_user_id terisi'
\else
ROLLBACK;
\echo 'GAGAL: dibatalkan (ROLLBACK), tidak ada perubahan'
\endif
\else
\echo 'DIBATALKAN: akun tidak ada, email SUDAH terverifikasi, atau akun web lain sudah memegang ROOT_ID. Tidak ada perubahan.'
\endif
SELECT id, email, email_verified, newapi_user_id FROM "user" WHERE id = :'subject' OR newapi_user_id = :'root_id';
SQL
```

Hasil yang diharapkan: `OK: newapi_user_id terisi`, lalu tepat satu baris dengan `email_verified` = `f` dan `newapi_user_id` = `ROOT_ID`. Bila ada dua baris atau pesan `DIBATALKAN`, jangan lanjut.

**4e. Verifikasi email.** Sekarang klik tautan verifikasi di email root. Lalu periksa bahwa tidak ada user console baru `[BACA]`:

<!-- blok:s4-after -->
```sh
echo "sebelum=$USERS_BEFORE"
gwsql <<'SQL'
SELECT count(*) AS sesudah FROM users WHERE deleted_at IS NULL;
SQL
websql -v subject="$SUBJECT" <<'SQL'
SELECT id, email_verified, newapi_user_id FROM "user" WHERE id = :'subject';
SQL
```

Hasil yang diharapkan: `sesudah` sama dengan `sebelum`; di web `email_verified` = `t` dan `newapi_user_id` tetap `ROOT_ID`. Bila `sesudah` lebih besar satu, bridge sempat membuat user duplikat: ikuti bagian 10.

## 5. Uji masuk root lewat Aedoxy (login password MASIH aktif)

1. Buka jendela privat, `https://ai.aedoxy.com/sign-in`.
2. Klik tombol `Continue with Aedoxy` (teks mengikuti nama penyedia di kolom `name` pada langkah 3). Masuk dengan akun Aedoxy `eidoxy` di `aedoxy.com`.
3. Console terbuka sebagai root. Cek: sidebar memuat grup `Admin`, dan menu profil memuat `System Settings`. Bila root punya passkey atau 2FA, console meminta verifikasi itu lebih dulu; selesaikan.
4. Bukti di database `[BACA]`:

<!-- blok:s5-check -->
```sh
gwsql -v root_id="$ROOT_ID" <<'SQL'
SELECT id, username, role, to_timestamp(last_login_at) AS terakhir_masuk FROM users WHERE id = :'root_id';
SQL
```

Hasil yang diharapkan: `role` 100 dan `terakhir_masuk` beberapa menit terakhir. Jika tombol Aedoxy mengarah ke akun BARU (username acak, bukan root), binding salah: tutup jendela, kembali ke langkah 3 dan 4c, dan JANGAN lanjut ke langkah 6.

## 6. Matikan login dan daftar password

Hanya setelah langkah 5 lulus. Login sebagai root (cukup lewat sesi yang sudah ada).

1. `System Settings` > sidebar `System Administration` > `Authentication` > `Basic Authentication` (alamat `/system-settings/auth/basic-auth`).
2. Matikan `Password Login`.
3. Matikan `Password Registration`.
4. Biarkan `Registration Enabled` AKTIF. Alasan: pengguna Aedoxy baru mendapat akun console lewat bridge saat email diverifikasi, dan jalur itu tidak memeriksa `RegisterEnabled`. Tetapi bila bridge gagal atau belum sempat jalan, login pertama lewat Aedoxy membuat akun otomatis; dengan `Registration Enabled` mati login pertama itu ditolak ("New user registration has been disabled by administrator"). Pendaftaran dengan password tetap tertutup oleh `Password Registration`. Root tidak terpengaruh dalam kedua keadaan.
5. Klik `Save Changes`.

Periksa nilai yang tersimpan `[BACA]`:

<!-- blok:s6-state -->
```sh
gwsql <<'SQL'
SELECT "key", value FROM options WHERE "key" IN ('PasswordLoginEnabled', 'PasswordRegisterEnabled', 'RegisterEnabled') ORDER BY "key";
SQL
```

Hasil yang diharapkan: `PasswordLoginEnabled` = `false` dan `PasswordRegisterEnabled` = `false`. `RegisterEnabled` boleh tidak muncul (belum pernah diubah berarti `true`) atau `true`.

**Penyedia login lain (OPSIONAL, langkah terpisah).** GitHub, Discord, OIDC, Telegram, LinuxDO, dan WeChat tetap hidup bila dinyalakan di `System Settings` > `Authentication` > `OAuth Integrations` dan `Custom OAuth`. Mematikan penyedia selain Aedoxy tidak diwajibkan runbook ini. Konsekuensinya bila dibiarkan hidup: akun yang dibuat lewat penyedia itu BUKAN akun Aedoxy (tidak punya `newapi_user_id` di web, tidak ikut sinkron ban/aktivasi, tidak muncul sebagai pembeli di aedoxy.com). Konsekuensi bila dimatikan: pengguna lama yang hanya masuk lewat penyedia itu tidak bisa masuk lagi. Putuskan dulu sebelum mematikan, dan jangan matikan penyedia yang dipakai root.

## 7. Verifikasi setelahnya

**7a. Login password ditolak.** Panggilan palsu dari container web ke gateway (data palsu, tidak mengubah apa pun):

<!-- blok:s7-login -->
```sh
sudo docker compose exec -T web node -e "fetch('http://gateway-aedoxy:3000/api/user/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'tidak-ada',password:'salah-salah-1'})}).then(async r=>console.log(r.status,await r.text()))"
```

Hasil yang diharapkan: JSON dengan `"success":false` dan pesan `Password login has been disabled by administrator` (atau terjemahannya menurut `DEFAULT_LANGUAGE` gateway). Bila pesannya `Username or password is incorrect...`, login password MASIH aktif: ulangi langkah 6.

**7b. Root tetap masuk.** Jendela privat baru, `/sign-in`: tombol `Continue with Aedoxy` harus masuk sebagai root (periksa lagi dengan kueri langkah 5). Form password tidak boleh lagi tersedia. `Sign in with Passkey` juga harus masih berfungsi.

**7c. Akun Aedoxy baru otomatis punya akun console dan bisa masuk.** Daftarkan akun uji di `https://aedoxy.com` (email milik Anda), verifikasi emailnya, lalu `[BACA]`:

<!-- blok:s7-new-user -->
```sh
TEST_EMAIL='uji@contoh.com'   # GANTI dengan email akun uji
TEST_SUBJECT=$(websql -At -v email="$TEST_EMAIL" <<'SQL'
SELECT id FROM "user" WHERE email = lower(:'email');
SQL
)
TEST_CONSOLE_ID=$(websql -At -v email="$TEST_EMAIL" <<'SQL'
SELECT newapi_user_id FROM "user" WHERE email = lower(:'email');
SQL
)
echo "TEST_SUBJECT=$TEST_SUBJECT TEST_CONSOLE_ID=$TEST_CONSOLE_ID"
gwsql -v subject="$TEST_SUBJECT" -v provider_id="$PROVIDER_ID" <<'SQL'
SELECT u.id, u.username, u.role, u.status, b.provider_user_id
FROM user_oauth_bindings b JOIN users u ON u.id = b.user_id
WHERE b.provider_id = :'provider_id' AND b.provider_user_id = :'subject';
SQL
```

Hasil yang diharapkan: `TEST_CONSOLE_ID` berupa angka, dan satu baris dari gateway dengan `id` sama dengan `TEST_CONSOLE_ID`, `role` 1, `status` 1. Bila `TEST_CONSOLE_ID` kosong, tunggu sampai 2 menit (worker `link-console-accounts`, lihat 7d) lalu ulangi. Setelah itu, di jendela privat, masuk ke console dengan `Continue with Aedoxy` memakai akun uji: harus berhasil. Nonaktifkan akun uji bila tidak dipakai lagi: `sudo docker compose run --rm migrate node scripts/ban-user.js uji@contoh.com`.

**7d. Log worker `link-console-accounts`.**

<!-- blok:s7-worker -->
```sh
sudo docker compose logs --since 30m worker | grep "link-console-accounts" | tail -n 5
```

Baris hanya muncul bila ada user terverifikasi yang belum tertaut. Contoh sehat: `[worker] link-console-accounts ok=1 failed=0 codes={}`. Tidak ada baris sama sekali juga normal. `failed` lebih dari 0 dengan kode seperti `http:401` berarti token bridge ditolak (lihat 7e dan bagian 9).

**7e. Token bridge masih diterima.** Panggilan baca ke gateway dengan token bridge dari environment container web. Token tidak dicetak:

<!-- blok:s7-bridge -->
```sh
sudo docker compose exec -T web node -e "fetch(process.env.NEWAPI_INTERNAL_URL+'/api/group/',{headers:{authorization:'Bearer '+process.env.NEWAPI_BRIDGE_TOKEN}}).then(async r=>{const j=await r.json();console.log(r.status,j.success)})"
```

Hasil yang diharapkan: `200 true`. `401` atau `false` berarti token ditolak atau kehilangan scope `group:read`: lihat bagian 9.

## 8. Jalur darurat (aedoxy.com mati atau OIDC rusak)

**(a) Passkey root.** Buka `https://ai.aedoxy.com/sign-in`, klik `Sign in with Passkey`. Ini jalur tercepat dan tidak butuh perubahan apa pun.

**(b) Nyalakan lagi login password lewat SQL.** Bila passkey tidak bisa dipakai. Upsert baris opsi `[UBAH]` (`key` adalah primary key tabel `options`; nama kolom `key` dikutip karena kata cadangan):

<!-- blok:s8-opt-on -->
```sh
gwsql <<'SQL'
INSERT INTO options ("key", value) VALUES ('PasswordLoginEnabled', 'true')
ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value;
SELECT "key", value FROM options WHERE "key" = 'PasswordLoginEnabled';
SQL
```

Hasil yang diharapkan: satu baris `PasswordLoginEnabled | true`. Lalu tunggu paling lama 60 detik (gateway memuat ulang opsi dari database), atau paksa sekarang:

<!-- blok:s8-restart -->
```sh
sudo docker compose restart new-api
```

(Kunci service compose tetap `new-api`; container-nya bernama `gateway-aedoxy`.) Setelah itu root masuk dengan username dan password di form login. Ingat: bila root punya passkey atau 2FA, verifikasinya tetap diminta; lihat (d) bila perangkatnya hilang.

**(c) Cek dan kembalikan.** Nilai opsi sekarang `[BACA]`:

<!-- blok:s8-opt-show -->
```sh
gwsql <<'SQL'
SELECT "key", value FROM options WHERE "key" IN ('PasswordLoginEnabled', 'PasswordRegisterEnabled', 'RegisterEnabled') ORDER BY "key";
SQL
```

Setelah masalah selesai, matikan lagi: lewat UI (langkah 6) atau lewat SQL `[UBAH]`, lalu tunggu 60 detik atau restart seperti di atas:

<!-- blok:s8-opt-off -->
```sh
gwsql <<'SQL'
INSERT INTO options ("key", value) VALUES ('PasswordLoginEnabled', 'false')
ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value;
SELECT "key", value FROM options WHERE "key" = 'PasswordLoginEnabled';
SQL
```

**(d) Perangkat passkey atau 2FA root hilang** (root tetap ditolak walau password benar). Status faktor dibaca dari tabel pada setiap login, jadi penghapusan lewat SQL langsung berlaku. `[UBAH]`, hapus passkey root (daftarkan ulang di `Security & Access` setelah masuk):

<!-- blok:s8-passkey-del -->
```sh
gwsql -v root_id="$ROOT_ID" <<'SQL'
BEGIN;
DELETE FROM passkey_credentials WHERE user_id = (SELECT id FROM users WHERE id = :'root_id' AND role = 100);
SELECT count(*) AS passkey_tersisa FROM passkey_credentials WHERE user_id = :'root_id';
COMMIT;
SQL
```

Hasil yang diharapkan: `passkey_tersisa` = `0`. Untuk 2FA yang hilang (kode cadangan juga hilang), `[UBAH]` nonaktifkan 2FA root (aktifkan lagi dari `Security & Access`):

<!-- blok:s8-2fa-off -->
```sh
gwsql -v root_id="$ROOT_ID" <<'SQL'
BEGIN;
UPDATE two_fas SET is_enabled = false WHERE user_id = (SELECT id FROM users WHERE id = :'root_id' AND role = 100);
SELECT user_id, is_enabled FROM two_fas WHERE user_id = :'root_id';
COMMIT;
SQL
```

Hasil yang diharapkan: `is_enabled` = `f` (atau nol baris bila root memang tidak punya 2FA). Setelah masuk kembali, daftarkan faktor baru dan simpan kode cadangan.

## 9. Rotasi token bridge saat login password mati

Token bridge (`nap_...`) tetap bekerja tanpa login password, tetapi membuat atau merotasi token butuh sesi dasbor akun layanan `aedoxy-bridge`, yang hanya punya login password. Prosedur (jendela login password terbuka singkat; kerjakan tanpa jeda):

1. Login sebagai root. `System Settings` > `Authentication` > `Basic Authentication`: nyalakan `Password Login`, `Save Changes`. (Alternatif tanpa UI: blok `s8-opt-on` di bagian 8, tunggu 60 detik.)
2. Di jendela privat, masuk ke console sebagai `aedoxy-bridge` dengan username dan password.
3. `Personal` > `Security & Access` > kartu `Access tokens` > `Create access token`. Isi `Token name`, pilih `Expiration`, dan di `Permissions` centang lima scope: `user:read`, `user:write`, `billing:read`, `billing:write`, `group:read`. Buat token, lalu `Copy token` (hanya tampil sekali; tutup dialog setelah disalin).
4. Ganti nilai di `.env` tanpa menampilkannya: `nano ~/aedoxy-web/.env`, ubah baris `NEWAPI_BRIDGE_TOKEN=`, simpan. Jangan pakai `echo` atau `cat`.
5. Terapkan: `cd ~/aedoxy-web && sudo docker compose up -d web worker`.
6. Uji token baru dengan blok `s7-bridge` (bagian 7e). Harus `200 true`.
7. Cabut token lama: sebagai `aedoxy-bridge`, di kartu `Access tokens` cari token lama, menu baris > `Revoke`. Ulangi blok `s7-bridge` untuk memastikan token baru tetap diterima.
8. Matikan lagi login password: ulangi langkah 6 (atau blok `s8-opt-off`), lalu uji dengan blok `s7-login`.

## 10. Pemulihan bila duplikat console terbentuk

Gejala: email akun Aedoxy root sudah terlanjur diverifikasi sebelum penautan, lalu bridge membuat user console baru N dengan binding ke subject itu (jumlah user naik satu di 4e, atau tombol Aedoxy membuka akun non-root). Pulihkan dengan mengarahkan binding ke root, menonaktifkan N, dan mengarahkan `newapi_user_id` di web ke root. Isi `SUBJECT`, `ROOT_ID`, dan `PROVIDER_ID` seperti langkah 3 dan 4b, lalu cari N dari binding `[BACA]`:

<!-- blok:s10-dup -->
```sh
DUP_ID=$(gwsql -At -v subject="$SUBJECT" -v provider_id="$PROVIDER_ID" <<'SQL'
SELECT user_id FROM user_oauth_bindings WHERE provider_id = :'provider_id' AND provider_user_id = :'subject';
SQL
)
echo "DUP_ID=$DUP_ID ROOT_ID=$ROOT_ID"
case "$DUP_ID" in
  ''|*[!0-9]*) echo "BERHENTI: binding untuk subject ini tidak ada atau lebih dari satu." ;;
  "$ROOT_ID") echo "SUDAH BENAR: binding sudah menunjuk root, tidak ada yang dipulihkan." ;;
  *) echo "OK: N=$DUP_ID" ;;
esac
```

Periksa bahwa N tidak punya langganan, token API, atau kuota penting sebelum dinonaktifkan `[BACA]`:

<!-- blok:s10-check -->
```sh
gwsql -v dup_id="$DUP_ID" -v root_id="$ROOT_ID" <<'SQL'
SELECT id, username, role, status, quota, used_quota, request_count FROM users WHERE id IN (:'root_id', :'dup_id') ORDER BY id;
SELECT 'langganan_aktif' AS item, count(*) FROM user_subscriptions WHERE user_id = :'dup_id' AND status = 'active'
UNION ALL SELECT 'token_api', count(*) FROM tokens WHERE user_id = :'dup_id'
UNION ALL SELECT 'binding_milik_root', count(*) FROM user_oauth_bindings WHERE user_id = :'root_id';
SQL
```

Hasil yang diharapkan untuk N: `role` 1, `quota` dan `used_quota` bernilai 0 (atau jumlah yang memang boleh hilang), `langganan_aktif` = 0, `token_api` = 0; dan `binding_milik_root` = 0. Bila N punya langganan, token, atau kuota yang berarti, BERHENTI: pindahkan lebih dulu lewat console, jangan nonaktifkan N.

Pemulihan di gateway `[UBAH]`. Berhenti sendiri bila binding, peran root, peran N, langganan aktif N, atau token API N tidak sesuai. Kuota N tidak diperiksa otomatis: nilainya Anda nilai sendiri dari kueri di atas.

<!-- blok:s10-fix-gw -->
```sh
gwsql -v dup_id="$DUP_ID" -v root_id="$ROOT_ID" -v provider_id="$PROVIDER_ID" -v subject="$SUBJECT" <<'SQL'
SELECT (SELECT count(*) FROM user_oauth_bindings WHERE provider_id = :'provider_id' AND provider_user_id = :'subject' AND user_id = :'dup_id') = 1
   AND (SELECT count(*) FROM user_oauth_bindings WHERE provider_id = :'provider_id' AND user_id = :'root_id') = 0
   AND (SELECT count(*) FROM users WHERE id = :'dup_id' AND role = 1) = 1
   AND (SELECT count(*) FROM users WHERE id = :'root_id' AND role = 100 AND deleted_at IS NULL) = 1
   AND (SELECT count(*) FROM user_subscriptions WHERE user_id = :'dup_id' AND status = 'active') = 0
   AND (SELECT count(*) FROM tokens WHERE user_id = :'dup_id') = 0
   AS ok \gset
\if :ok
BEGIN;
UPDATE user_oauth_bindings SET user_id = :'root_id'
WHERE provider_id = :'provider_id' AND provider_user_id = :'subject' AND user_id = :'dup_id';
UPDATE users SET status = 2 WHERE id = :'dup_id' AND role = 1;
SELECT (SELECT user_id FROM user_oauth_bindings WHERE provider_id = :'provider_id' AND provider_user_id = :'subject') = :'root_id'::bigint
   AND (SELECT status FROM users WHERE id = :'dup_id') = 2 AS ok \gset
\if :ok
COMMIT;
\echo 'OK: binding diarahkan ke root, N dinonaktifkan'
\else
ROLLBACK;
\echo 'GAGAL: dibatalkan (ROLLBACK), tidak ada perubahan'
\endif
\else
\echo 'DIBATALKAN: syarat tidak terpenuhi (binding, root, peran N, langganan aktif atau token API N). Tidak ada perubahan.'
\endif
SELECT id, username, role, status FROM users WHERE id IN (:'root_id', :'dup_id') ORDER BY id;
SELECT user_id, provider_user_id FROM user_oauth_bindings WHERE provider_id = :'provider_id' AND provider_user_id = :'subject';
SQL
```

Hasil yang diharapkan: `OK: ...`, N berstatus `2`, root tetap `1`, dan binding untuk `SUBJECT` memiliki `user_id` = `ROOT_ID`. Catatan: perubahan lewat SQL tidak membersihkan cache Redis gateway. Untuk N yang belum pernah dipakai (tanpa token dan sesi) itu tidak berpengaruh.

Pemulihan di web `[UBAH]`. Satu UPDATE yang melepaskan N dan mengisi `ROOT_ID` (kolom `newapi_user_id` bersifat unik):

<!-- blok:s10-fix-web -->
```sh
websql -v subject="$SUBJECT" -v root_id="$ROOT_ID" -v dup_id="$DUP_ID" <<'SQL'
SELECT (SELECT count(*) FROM "user" WHERE id = :'subject' AND newapi_user_id = :'dup_id') = 1
   AND NOT EXISTS (SELECT 1 FROM "user" WHERE newapi_user_id = :'root_id')
   AS ok \gset
\if :ok
BEGIN;
UPDATE "user" SET newapi_user_id = :'root_id' WHERE id = :'subject' AND newapi_user_id = :'dup_id';
SELECT count(*) = 1 AS ok FROM "user" WHERE id = :'subject' AND newapi_user_id = :'root_id' \gset
\if :ok
COMMIT;
\echo 'OK: newapi_user_id diarahkan ke root'
\else
ROLLBACK;
\echo 'GAGAL: dibatalkan (ROLLBACK), tidak ada perubahan'
\endif
\else
\echo 'DIBATALKAN: akun belum menunjuk N, atau akun web lain sudah memegang ROOT_ID. Tidak ada perubahan.'
\endif
SELECT id, email, email_verified, newapi_user_id FROM "user" WHERE id = :'subject' OR newapi_user_id IN (:'root_id', :'dup_id');
SQL
```

Hasil yang diharapkan: `OK: ...` dan satu baris dengan `newapi_user_id` = `ROOT_ID`. Selesai dengan mengulang langkah 5 (uji masuk root lewat Aedoxy).

## 11. Daftar periksa akhir

- [ ] Cadangan `~/backup/gateway-aedoxy-*.dump` dan `~/backup/aedoxy-*.dump` ada, ukuran lebih dari 0, `pg_restore -l` terbaca.
- [ ] Passkey root terdaftar (`passkey` = 1), `Enable Passkey` di System Settings tetap menyala, `Sign in with Passkey` berhasil.
- [ ] Binding root ada di gateway; `newapi_user_id` akun Aedoxy root sama dengan `ROOT_ID`; jumlah user console tidak bertambah setelah verifikasi email.
- [ ] Root masuk lewat `Continue with Aedoxy` dengan peran 100 dan melihat `System Settings`.
- [ ] `PasswordLoginEnabled` dan `PasswordRegisterEnabled` bernilai `false`; `Registration Enabled` aktif.
- [ ] Panggilan login palsu (7a) ditolak dengan pesan login password dinonaktifkan.
- [ ] Akun Aedoxy uji otomatis punya akun console dan bisa masuk lewat Aedoxy.
- [ ] Token bridge menghasilkan `200 true` (7e); log worker tanpa `failed` yang menetap.
- [ ] Catatan darurat disimpan di tempat aman: blok `s8-opt-on` dan `s8-passkey-del`, lokasi perangkat passkey, kode cadangan 2FA.

## Status validasi (apa yang sudah dan belum dibuktikan)

- Terbukti pada PostgreSQL 15.19 dengan salinan skema gateway dev (data palsu) dan database web hasil migrasi drizzle: blok `fn`, `dump`, `dump-verify`, dan semua blok SQL di bagian 2 sampai 6, 7c, 8, dan 10 dijalankan lewat bash dengan teks yang diambil langsung dari berkas ini, termasuk percabangan `DIBATALKAN`, pengulangan (idempotensi), dan tabrakan unik `newapi_user_id`. Hanya `sudo` dan `docker compose exec ... postgres` yang diganti pembungkus uji, dan nama database dipetakan ke salinan uji.
- Tidak dijalankan (container `web`, `worker`, `new-api` tidak ada di lingkungan uji): 7a, 7d, 7e, dan `docker compose restart new-api`. Untuk 7a dan 7e hanya sintaks JavaScript yang diperiksa (`node --check`).
- Terbukti oleh tes gateway (`gateway-aedoxy/controller/aedoxy_bridge_test.go`, `model/aedoxy_bridge_test.go`) pada SQLite dan PostgreSQL: root terikat Aedoxy masuk saat login dan daftar password mati (dengan `RegisterEnabled` true maupun false); login password root ditolak; binding membuat `EnsureAedoxyUser` mengembalikan root tanpa user baru; upsert `options` ala runbook plus pemuatan ulang opsi membuat login password aktif kembali; passkey atau 2FA root menjadi faktor wajib dan penghapusannya lewat SQL membebaskan login. Tes tidak menjalankan timer 60 detik; yang dibuktikan adalah efek pemuatan ulang opsi dari database.
- Dibaca dari kode, TIDAK diuji di browser: semua nama menu, tombol, dan tab di console (`System Settings`, `Basic Authentication`, `Passkey Authentication`, `Security & Access`, `Continue with Aedoxy`, `Access tokens`, dan sebagainya) berasal dari sumber `gateway-aedoxy/web/src`. Teks tombol Aedoxy mengikuti nama penyedia di database.
- Tidak diuji: perilaku di VPS produksi, pesan persis dari panggilan login palsu (7a), alur pendaftaran passkey di perangkat nyata, dan aliran email verifikasi.
