/*!
 * Mock REST API "Kampus" — Pemrograman Web ET234305 (Minggu 6)
 * ------------------------------------------------------------------
 * Mencegat fetch() ke URL berawalan /api/ (atau https://api.kampus.dev/api/)
 * dan menjawab seperti server sungguhan: ada delay jaringan, status code,
 * header, dan body JSON. Tidak butuh internet, tidak ada masalah CORS.
 *
 * Cara pakai di proyek kalian (muat SEBELUM app.js):
 *   <script src="https://fuaddary.github.io/Pemrograman-Web/assets/mock-api-kampus.js"></script>
 *   <script src="app.js" defer></script>
 *
 * Endpoint:
 *   GET    /api/mahasiswa[?q=&angkatan=]   GET /api/mahasiswa/:nrp
 *   POST   /api/mahasiswa                  PUT|PATCH|DELETE /api/mahasiswa/:nrp
 *   GET    /api/matkul                     GET /api/matkul/:kode
 *   GET    /api/nilai/:nrp                 GET /api/pengumuman
 *   GET    /api/tugas                      POST /api/tugas
 *   PATCH  /api/tugas/:id                  DELETE /api/tugas/:id
 *   GET    /api/lambat?ms=2000             GET /api/rusak   (selalu 500)
 *
 * Simulasi kondisi jaringan (ketik di Console):
 *   __API.setMode("normal" | "lambat" | "tidakstabil" | "offline" | "error500")
 *   __API.gagalkan("/api/pengumuman")   → endpoint tsb. selalu 500
 *   __API.pulihkan()                    → normal kembali
 *   __API.reset()                       → data kembali ke kondisi awal
 *   __API.simpan(true)                  → data disimpan di localStorage
 */
(function () {
  "use strict";
  if (window.__API) return;

  var cfg = Object.assign({ mode: "normal", latency: null, log: true, persist: false }, window.__API_CONFIG || {});
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  var KEY = "mock-api-kampus:v1";

  var SEED = {
    mahasiswa: [
      { nrp: "5027241001", nama: "Rani Kusuma", angkatan: 2024, ipk: 3.71 },
      { nrp: "5027241002", nama: "Budi Santoso", angkatan: 2024, ipk: 3.12 },
      { nrp: "5027241003", nama: "Citra Lestari", angkatan: 2024, ipk: 3.85 },
      { nrp: "5027231004", nama: "Dimas Pratama", angkatan: 2023, ipk: 2.94 },
      { nrp: "5027231005", nama: "Eka Wulandari", angkatan: 2023, ipk: 3.47 },
      { nrp: "5027221006", nama: "Fajar Nugroho", angkatan: 2022, ipk: 3.3 }
    ],
    matkul: [
      { kode: "ET234305", nama: "Pemrograman Web", sks: 4, semester: 3 },
      { kode: "ET234302", nama: "Basis Data", sks: 3, semester: 3 },
      { kode: "ET234303", nama: "Struktur Data", sks: 3, semester: 3 },
      { kode: "ET234304", nama: "Jaringan Komputer", sks: 3, semester: 3 },
      { kode: "ET234301", nama: "Statistika", sks: 2, semester: 3 }
    ],
    nilai: {
      "5027241001": [{ kode: "ET234305", nilai: 88 }, { kode: "ET234302", nilai: 79 }, { kode: "ET234303", nilai: 91 }],
      "5027241002": [{ kode: "ET234305", nilai: 72 }, { kode: "ET234302", nilai: 65 }, { kode: "ET234301", nilai: 80 }],
      "5027241003": [{ kode: "ET234305", nilai: 95 }, { kode: "ET234304", nilai: 89 }],
      "5027231004": [{ kode: "ET234305", nilai: 58 }, { kode: "ET234303", nilai: 70 }],
      "5027231005": [{ kode: "ET234302", nilai: 84 }],
      "5027221006": []
    },
    pengumuman: [
      { id: 1, judul: "Asistensi Modul 2 dipindah ke Lab KCKS", tanggal: "2026-10-05" },
      { id: 2, judul: "Batas pengumpulan Tugas 1: Jumat 23.59", tanggal: "2026-10-09" },
      { id: 3, judul: "Evaluasi 1 dilaksanakan Minggu 8", tanggal: "2026-10-12" }
    ],
    tugas: [
      { id: 1, judul: "Lab 10 event delegation", matkul: "Pemrograman Web", deadline: "2026-10-08", selesai: false },
      { id: 2, judul: "ERD sistem perpustakaan", matkul: "Basis Data", deadline: "2026-10-12", selesai: true },
      { id: 3, judul: "Ringkasan materi async/await", matkul: "Pemrograman Web", deadline: "2026-10-10", selesai: false }
    ],
    nextTugasId: 4
  };

  var db;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function load() {
    db = clone(SEED);
    if (cfg.persist) {
      try { var s = localStorage.getItem(KEY); if (s) db = JSON.parse(s); } catch (e) { /* abaikan */ }
    }
  }
  function save() {
    if (!cfg.persist) return;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* abaikan */ }
  }
  load();

  var failPaths = [];
  var calls = [];
  var seq = 0;

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function latency(path, query) {
    if (path === "/api/lambat") return Math.min(10000, Math.max(0, Number(query.get("ms")) || 2000));
    if (cfg.latency != null) return cfg.latency;
    if (cfg.mode === "lambat") return 1800 + Math.random() * 700;
    if (cfg.mode === "tidakstabil") return 150 + Math.random() * 1450;
    return 250 + Math.random() * 450;
  }
  function err(status, pesan) { return { status: status, data: { error: pesan } }; }
  function ok(data, status) { return { status: status || 200, data: data }; }

  function validMhs(b, partial) {
    if (!partial || "nama" in b) {
      if (typeof b.nama !== "string" || !b.nama.trim()) return "Nama wajib diisi";
      if (b.nama.trim().length > 60) return "Nama maksimal 60 karakter";
    }
    if (!partial) {
      if (!/^\d{10}$/.test(String(b.nrp || ""))) return "NRP harus 10 digit angka";
    }
    if ("ipk" in b && b.ipk !== null && (typeof b.ipk !== "number" || b.ipk < 0 || b.ipk > 4)) return "IPK harus angka 0–4";
    return null;
  }
  function validTugas(b, partial) {
    if (!partial || "judul" in b) {
      if (typeof b.judul !== "string" || b.judul.trim().length < 3) return "Judul minimal 3 karakter";
    }
    if (!partial && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.deadline || ""))) return "Deadline wajib berformat YYYY-MM-DD";
    if ("selesai" in b && typeof b.selesai !== "boolean") return "selesai harus boolean";
    return null;
  }

  function route(method, path, query, body) {
    var m, x, e;
    if (path === "/api/rusak") return err(500, "Internal Server Error (endpoint ini memang selalu gagal)");
    if (path === "/api/lambat") return ok({ pesan: "Akhirnya sampai!", ms: Number(query.get("ms")) || 2000 });

    // ---------- mahasiswa ----------
    if (path === "/api/mahasiswa") {
      if (method === "GET") {
        var q = (query.get("q") || "").trim().toLowerCase();
        var ang = query.get("angkatan");
        return ok(db.mahasiswa.filter(function (s) {
          return (!q || s.nama.toLowerCase().indexOf(q) !== -1 || s.nrp.indexOf(q) === 0) && (!ang || String(s.angkatan) === ang);
        }));
      }
      if (method === "POST") {
        if ((e = validMhs(body, false))) return err(400, e);
        if (db.mahasiswa.some(function (s) { return s.nrp === String(body.nrp); })) return err(409, "NRP " + body.nrp + " sudah terdaftar");
        var baru = { nrp: String(body.nrp), nama: body.nama.trim(), angkatan: 2000 + Number(String(body.nrp).slice(4, 6)), ipk: typeof body.ipk === "number" ? body.ipk : null };
        db.mahasiswa.push(baru); save();
        return ok(baru, 201);
      }
      return err(405, "Method " + method + " tidak didukung di " + path);
    }
    if ((m = path.match(/^\/api\/mahasiswa\/([^/]+)$/))) {
      var i = db.mahasiswa.findIndex(function (s) { return s.nrp === m[1]; });
      if (i === -1) return err(404, "Mahasiswa dengan NRP " + m[1] + " tidak ditemukan");
      if (method === "GET") return ok(db.mahasiswa[i]);
      if (method === "PUT" || method === "PATCH") {
        if ((e = validMhs(body, method === "PATCH"))) return err(400, e);
        if ("nama" in body) db.mahasiswa[i].nama = body.nama.trim();
        if ("ipk" in body) db.mahasiswa[i].ipk = body.ipk;
        save(); return ok(db.mahasiswa[i]);
      }
      if (method === "DELETE") { db.mahasiswa.splice(i, 1); save(); return { status: 204, data: undefined }; }
      return err(405, "Method " + method + " tidak didukung di " + path);
    }

    // ---------- matkul ----------
    if (path === "/api/matkul" && method === "GET") return ok(db.matkul);
    if ((m = path.match(/^\/api\/matkul\/([^/]+)$/)) && method === "GET") {
      x = db.matkul.find(function (k) { return k.kode === m[1]; });
      return x ? ok(x) : err(404, "Mata kuliah " + m[1] + " tidak ditemukan");
    }

    // ---------- nilai ----------
    if ((m = path.match(/^\/api\/nilai\/([^/]+)$/)) && method === "GET") {
      if (!db.mahasiswa.some(function (s) { return s.nrp === m[1]; })) return err(404, "Mahasiswa dengan NRP " + m[1] + " tidak ditemukan");
      return ok((db.nilai[m[1]] || []).map(function (n) {
        var mk = db.matkul.find(function (k) { return k.kode === n.kode; });
        return { kode: n.kode, matkul: mk ? mk.nama : n.kode, nilai: n.nilai };
      }));
    }

    // ---------- pengumuman ----------
    if (path === "/api/pengumuman" && method === "GET") return ok(db.pengumuman);

    // ---------- tugas ----------
    if (path === "/api/tugas") {
      if (method === "GET") return ok(db.tugas);
      if (method === "POST") {
        if ((e = validTugas(body, false))) return err(400, e);
        var t = { id: db.nextTugasId++, judul: body.judul.trim(), matkul: String(body.matkul || "Umum"), deadline: body.deadline, selesai: false };
        db.tugas.push(t); save();
        return ok(t, 201);
      }
      return err(405, "Method " + method + " tidak didukung di " + path);
    }
    if ((m = path.match(/^\/api\/tugas\/(\d+)$/))) {
      var j = db.tugas.findIndex(function (t) { return t.id === Number(m[1]); });
      if (j === -1) return err(404, "Tugas dengan id " + m[1] + " tidak ditemukan");
      if (method === "GET") return ok(db.tugas[j]);
      if (method === "PATCH" || method === "PUT") {
        if ((e = validTugas(body, true))) return err(400, e);
        ["judul", "matkul", "deadline", "selesai"].forEach(function (k) { if (k in body) db.tugas[j][k] = body[k]; });
        save(); return ok(db.tugas[j]);
      }
      if (method === "DELETE") { db.tugas.splice(j, 1); save(); return { status: 204, data: undefined }; }
      return err(405, "Method " + method + " tidak didukung di " + path);
    }

    return err(404, "Endpoint " + method + " " + path + " tidak ditemukan");
  }

  var STATUS_TEXT = { 200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 500: "Internal Server Error" };

  function notify(ev) {
    if (typeof window.__API_ONNET === "function") { try { window.__API_ONNET(ev); } catch (e) { /* abaikan */ } }
    else if (cfg.log && ev.phase !== "start" && window.console) {
      var label = ev.phase === "end" ? ev.status : ev.phase === "abort" ? "dibatalkan" : "GAGAL (offline)";
      console.info("[mock-api] " + ev.method + " " + ev.url + " → " + label + " (" + Math.round(ev.ms) + " ms)");
    }
  }

  function headerValue(headers, name) {
    if (!headers) return "";
    if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) || "";
    if (Array.isArray(headers)) {
      for (var k = 0; k < headers.length; k++) if (String(headers[k][0]).toLowerCase() === name) return headers[k][1];
      return "";
    }
    for (var key in headers) if (key.toLowerCase() === name) return headers[key];
    return "";
  }

  function mockFetch(input, init) {
    init = init || {};
    var rawUrl = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
    var method = String(init.method || (input && input.method) || "GET").toUpperCase();
    var mm = rawUrl.match(/^(?:https?:\/\/api\.kampus\.dev)?(\/api\/[^?#]*)(\?[^#]*)?/);
    if (!mm) {
      if (realFetch) return realFetch(input, init);
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    var path = mm[1].replace(/\/+$/, "") || "/api";
    var query = new URLSearchParams(mm[2] || "");
    var display = path + (mm[2] || "");
    var ct = String(headerValue(init.headers, "content-type") || "");
    var id = ++seq;
    var call = { id: id, method: method, path: path, url: display, contentType: ct, body: init.body, start: now(), end: null, status: null };
    calls.push(call);
    notify({ id: id, phase: "start", method: method, url: display, t: call.start });

    return new Promise(function (resolve, reject) {
      var signal = init.signal;
      var done = false;
      function finishAbort() {
        if (done) return; done = true;
        call.end = now(); call.status = "abort";
        notify({ id: id, phase: "abort", method: method, url: display, t: call.end, ms: call.end - call.start });
        var e; try { e = new DOMException("The user aborted a request.", "AbortError"); } catch (x) { e = new Error("The user aborted a request."); e.name = "AbortError"; }
        reject(e);
      }
      if (signal && signal.aborted) return finishAbort();
      if (signal && signal.addEventListener) signal.addEventListener("abort", finishAbort);

      var offline = cfg.mode === "offline";
      setTimeout(function () {
        if (done) return; done = true;
        if (signal && signal.removeEventListener) signal.removeEventListener("abort", finishAbort);
        call.end = now();
        if (offline || cfg.mode === "offline") {
          call.status = "offline";
          notify({ id: id, phase: "fail", method: method, url: display, t: call.end, ms: call.end - call.start });
          reject(new TypeError("Failed to fetch"));
          return;
        }
        var res;
        if (cfg.mode === "error500" || failPaths.indexOf(path) !== -1) {
          res = err(500, "Internal Server Error");
        } else {
          var body = {};
          if (method !== "GET" && method !== "DELETE" && init.body != null) {
            var text = typeof init.body === "string" ? init.body : String(init.body); // objek → "[object Object]" seperti browser asli
            if (/application\/json/i.test(ct)) {
              try { body = JSON.parse(text); } catch (e) { res = err(400, "Body bukan JSON valid: " + text.slice(0, 40)); }
              if (!res && (body === null || typeof body !== "object" || Array.isArray(body))) res = err(400, "Body JSON harus berupa objek");
            } else {
              body = {}; // seperti express.json(): tanpa header JSON, body diabaikan
            }
          }
          if (!res) {
            try { res = route(method, path, query, body); } catch (e) { res = err(500, "Internal Server Error: " + e.message); }
          }
        }
        call.status = res.status;
        var payload = (res.status === 204 || res.data === undefined) ? null : JSON.stringify(res.data);
        var response = new Response(payload, {
          status: res.status,
          statusText: STATUS_TEXT[res.status] || "",
          headers: payload === null ? {} : { "Content-Type": "application/json; charset=utf-8" }
        });
        notify({ id: id, phase: "end", method: method, url: display, status: res.status, t: call.end, ms: call.end - call.start });
        resolve(response);
      }, offline ? Math.min(400, latency(path, query)) : latency(path, query));
    });
  }

  window.fetch = mockFetch;
  window.__API = {
    get mode() { return cfg.mode; },
    setMode: function (m) { cfg.mode = m; return m; },
    setLatency: function (ms) { cfg.latency = ms; },
    gagalkan: function (p) { if (failPaths.indexOf(p) === -1) failPaths.push(p); },
    pulihkan: function () { failPaths.length = 0; cfg.mode = "normal"; },
    reset: function () { db = clone(SEED); save(); calls.length = 0; },
    simpan: function (on) { cfg.persist = !!on; save(); },
    get db() { return db; },
    calls: calls
  };
})();
