"use strict";
// ---------- Audiolibro: riproduce i file generati dal minipc (audio/<id>/cNNN.mp3 + audio.json) e li allinea al testo dell'EPUB
const Aud = {
  a: null, b: null, bookId: null, meta: null, ci: -1, map: null, si: -1, idx: {}, dl: false, sleepT: null, sleepEnd: 0, sleepChap: false, lastPos: null, url: null, seeking: false,

  async loadIdx() { try { this.idx = (await DB.get("kv", "audioidx")) || {}; } catch (e) { this.idx = {}; } return this.idx; },
  has(id) { return !!this.idx[id]; },
  fmt(t) { t = Math.max(0, Math.round(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); },

  // --- collegamento con il lettore EPUB aperto
  bind(book, b) {
    this.unbind(); this.bookId = book.id; this.b = b;
    $("rAud").hidden = !this.has(book.id);
    if (!this.a) {
      const a = this.a = new Audio(); a.preload = "auto";
      a.addEventListener("timeupdate", () => this.tick());
      a.addEventListener("ended", () => this.ended());
      a.addEventListener("play", () => this.ui()); a.addEventListener("pause", () => this.ui());
      a.addEventListener("error", () => this.msg("Errore di riproduzione"));
    }
  },
  unbind() { this.stop(); this.b = null; this.bookId = null; this.meta = null; this.ci = -1; this.map = null; if ($("rAud")) $("rAud").hidden = true; if ($("audbar")) $("audbar").hidden = true; },
  msg(t) { const e = $("aMsg"); if (e) e.textContent = t || ""; },

  // --- dati
  async adapter() { const ad = App.getAdapter(); await ad.ready(true); return ad; },
  async loadMeta() {
    if (this.meta && this.meta.book === this.bookId) return this.meta;
    let m = await DB.get("kv", "aud:" + this.bookId);
    const ix = this.idx[this.bookId];
    if (!m || (ix && m.upd !== ix.upd)) {
      this.msg("Scarico l'indice audio…");
      const ad = await this.adapter(); m = await ad.readJson("audio/" + this.bookId, "audio.json");
      if (!m) throw new Error("audio.json non trovato su Drive");
      m.upd = ix ? ix.upd : ""; await DB.put("kv", "aud:" + this.bookId, m);
    }
    m.book = this.bookId; this.meta = m; return m;
  },
  async blobOf(entry, quiet) {
    const key = "aud:" + this.bookId + ":" + entry.file + ":" + (this.idx[this.bookId] || {}).upd;
    let bl = await DB.get("files", key);
    if (bl) return bl;
    if (!quiet) this.msg("Scarico il capitolo…");
    const ad = await this.adapter(); bl = await ad.readBlob("audio/" + this.bookId, entry.file);
    for (const k of await DB.keys("files")) if (typeof k === "string" && k.startsWith("aud:" + this.bookId + ":" + entry.file + ":") && k !== key) await DB.del("files", k);
    await DB.put("files", key, bl); return bl;
  },
  async cacheInfo() {   // capitoli scaricati sul telefono per questo libro
    let n = 0, sz = 0; const pre = "aud:" + this.bookId + ":";
    for (const k of await DB.keys("files")) if (typeof k === "string" && k.startsWith(pre)) { n++; const b = await DB.get("files", k); sz += (b && b.size) || 0; }
    return { n, mb: sz / 1048576 };
  },
  async showCache() { const c = await this.cacheInfo(); this.msg(c.n ? `Sul telefono: ${c.n} capitoli (${c.mb.toFixed(0)} MB)` : "Nessun audio salvato sul telefono: si scarica mentre ascolti"); },
  async clearCache(onlyBefore) {   // onlyBefore = indice del capitolo audio: elimina solo quelli precedenti
    const pre = "aud:" + this.bookId + ":"; let n = 0;
    const keep = new Set(); if (onlyBefore != null && this.meta) this.meta.chapters.forEach((c, i) => { if (i >= onlyBefore) keep.add(c.file); });
    for (const k of await DB.keys("files")) if (typeof k === "string" && k.startsWith(pre)) {
      const f = k.slice(pre.length).split(":")[0]; if (keep.has(f) || (onlyBefore == null && this.a && !this.a.paused && this.meta && this.ci >= 0 && f === this.meta.chapters[this.ci].file)) continue;
      await DB.del("files", k); n++;
    }
    return n;
  },
  async cached(entry) { return !!(await DB.get("files", "aud:" + this.bookId + ":" + entry.file + ":" + (this.idx[this.bookId] || {}).upd)); },

  // --- allineamento frasi audio <-> testo del capitolo
  buildMap(entry, T) {
    // testo normalizzato (spazi compressi) con indice verso il testo originale
    let N = "", ix = [], sp = true;
    for (let i = 0; i < T.length; i++) { const c = T[i]; if (/\s/.test(c)) { if (!sp) { N += " "; ix.push(i); sp = true; } } else { N += c.toLowerCase(); ix.push(i); sp = false; } }
    const norm = s => s.replace(/\s+/g, " ").trim().toLowerCase();
    let cur = 0; const out = [];
    for (const s of entry.sents) {
      const t = norm(s.txt), pre = t.slice(0, 24); let k = pre ? N.indexOf(pre, cur) : -1;
      if (k < 0 || k - cur > 4000) k = -1;
      if (k < 0) { out.push(null); continue; }
      const e = Math.min(N.length - 1, k + t.length - 1);
      out.push([ix[k], ix[e] + 1]); cur = k + Math.max(1, Math.min(t.length, 30));
    }
    // frasi non trovate: stessa posizione della precedente
    let last = [0, 0]; for (let i = 0; i < out.length; i++) { if (out[i]) last = out[i]; else out[i] = last; }
    return out;
  },
  sentAt(t) { const S = this.meta.chapters[this.ci].sents; let lo = 0, hi = S.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= t) lo = m; else hi = m - 1; } return lo; },
  chOf(entry) { return entry.idx; },

  // --- caricamento di un capitolo audio (e del relativo testo)
  async loadChapter(ci, t0, noText) {
    const ent = this.meta.chapters[ci]; this.ci = ci; this.si = -1;
    if (!noText) { const tx = await this.b.openCh(ent.idx); this.map = this.buildMap(ent, tx.text); }
    const bl = await this.blobOf(ent);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(bl); this.a.src = this.url; this.a.playbackRate = this.rate(); this.a.preservesPitch = true; this.a.webkitPreservesPitch = true;
    await new Promise(r => { const f = () => { this.a.removeEventListener("loadedmetadata", f); r(); }; this.a.addEventListener("loadedmetadata", f); setTimeout(r, 4000); });
    this.a.currentTime = t0 || 0; this.msg("");
    this.prefetch(ci + 1);
    this.ui();
  },
  async prefetch(ci) { try { const e = this.meta.chapters[ci]; if (e && !(await this.cached(e))) await this.blobOf(e, true); } catch (e) { } },
  rate() { return +(Prefs.d.arate || 1); },

  // --- punto di partenza: la posizione di lettura sullo schermo
  async startFromText() {
    const s = await this.b.start(); if (!s) return false;
    let ci = this.meta.chapters.findIndex(c => c.idx >= s.ch); if (ci < 0) ci = this.meta.chapters.length - 1;
    const ent = this.meta.chapters[ci];
    let t0 = 0;
    if (ent.idx === s.ch) {
      const map = this.buildMap(ent, s.text); let i = map.findIndex(m => m[1] > s.start); if (i < 0) i = 0; t0 = ent.sents[i].t0;
    }
    await this.loadChapter(ci, t0); return true;
  },

  async play() {
    try {
      if (!this.b) return;
      if (typeof TTS !== "undefined" && TTS.on) TTS.stop();
      this.msg("");
      await this.loadMeta();
      const pos = this.b.pos();
      const moved = !this.a.src || !this.lastPos || !pos || pos.ch !== this.lastPos.ch || Math.abs(pos.frac - this.lastPos.frac) > 0.03;
      if (moved) { if (!(await this.startFromText())) return; }
      this.mediaSession(); await this.a.play(); Keep.wake(true);
    } catch (e) { this.msg("Audio non disponibile: " + e.message); this.ui(); }
  },
  pause() { if (this.a) this.a.pause(); },
  stop() { if (this.a) { this.a.pause(); } clearTimeout(this.sleepT); this.sleepEnd = 0; if (this.b && this.b.clear) try { this.b.clear(); } catch (e) { } if (navigator.mediaSession) try { navigator.mediaSession.playbackState = "none"; } catch (e) { } this.ui(); },
  toggle() { if (this.a && !this.a.paused) this.pause(); else this.play(); },
  seekBy(d) { if (!this.a || !this.meta || this.ci < 0) return; this.a.currentTime = Math.max(0, Math.min((this.a.duration || 1e9) - 0.1, this.a.currentTime + d)); },
  async chap(d) {
    if (!this.meta) { await this.play(); return; }
    const n = this.ci + d; if (n < 0 || n >= this.meta.chapters.length) return;
    const was = !this.a.paused; try { await this.loadChapter(n, 0); if (was) await this.a.play(); } catch (e) { this.msg("Audio non disponibile: " + e.message); }
  },
  async ended() {
    if (this.sleepChap) { this.sleepChap = false; this.ui(); return; }
    const n = this.ci + 1;
    if (!this.meta || n >= this.meta.chapters.length) { this.ui(); if (Prefs.d.audel) this.clearCache(); return; }
    try { await this.loadChapter(n, 0); await this.a.play(); if (Prefs.d.audel) this.clearCache(n); } catch (e) { this.msg("Capitolo successivo non scaricato: " + e.message); }
  },
  tick() {
    const a = this.a; if (!a || !this.meta || this.ci < 0) return;
    const ent = this.meta.chapters[this.ci], i = this.sentAt(a.currentTime);
    if (i !== this.si && this.map) {
      this.si = i; const m = this.map[i];
      if (m && this.b) { this.b.mark(m[0], m[1], ent.idx); setTimeout(() => { try { this.lastPos = this.b.pos(); } catch (e) { } }, 400); }
    }
    if (!this.seeking) { $("aSeek").max = Math.round(a.duration || ent.dur); $("aSeek").value = Math.round(a.currentTime); }
    $("aTime").textContent = this.fmt(a.currentTime) + " / " + this.fmt(a.duration || ent.dur);
    if (navigator.mediaSession && navigator.mediaSession.setPositionState && isFinite(a.duration) && a.duration > 0) { try { navigator.mediaSession.setPositionState({ duration: a.duration, playbackRate: a.playbackRate, position: Math.min(a.currentTime, a.duration) }); } catch (e) { } }
  },

  // --- sistema: lock screen, cuffie
  mediaSession() {
    const ms = navigator.mediaSession; if (!ms) return;
    const R = Reader.cur, ent = this.meta && this.meta.chapters[this.ci];
    try { ms.metadata = new MediaMetadata({ title: ent ? ent.title : (R ? R.book.title : "Audiolibro"), artist: R ? R.book.title : "", album: "Ebook Scrivania" }); } catch (e) { }
    const h = (n, f) => { try { ms.setActionHandler(n, f); } catch (e) { } };
    h("play", () => this.play()); h("pause", () => this.pause()); h("stop", () => this.stop());
    h("seekbackward", () => this.seekBy(-15)); h("seekforward", () => this.seekBy(30));
    h("previoustrack", () => this.chap(-1)); h("nexttrack", () => this.chap(1));
    h("seekto", e => { if (e.seekTime != null) this.a.currentTime = e.seekTime; });
  },

  // --- timer di spegnimento
  setSleep(v) {
    clearTimeout(this.sleepT); this.sleepChap = false; this.sleepEnd = 0;
    if (v === "c") this.sleepChap = true;
    else if (+v > 0) { this.sleepEnd = Date.now() + v * 60000; this.sleepT = setTimeout(() => { this.pause(); this.sleepEnd = 0; $("aSleep").value = "0"; }, v * 60000); }
  },

  // --- scarica tutto per ascoltare offline
  async downloadAll() {
    if (this.dl) return; this.dl = true;
    try {
      await this.loadMeta(); const L = this.meta.chapters;
      for (let i = 0; i < L.length; i++) { this.msg(`Scarico ${i + 1}/${L.length}…`); await this.blobOf(L[i], true); }
      this.msg("Tutto scaricato: puoi ascoltare offline.");
    } catch (e) { this.msg("Download interrotto: " + e.message); }
    this.dl = false;
  },

  ui() {
    const pl = this.a && !this.a.paused;
    if ($("aPlay")) $("aPlay").textContent = pl ? "⏸" : "▶";
    if ($("rAud")) $("rAud").style.outline = pl ? "2px solid var(--acc)" : "";
    if (navigator.mediaSession) { try { navigator.mediaSession.playbackState = pl ? "playing" : (this.ci >= 0 ? "paused" : "none"); } catch (e) { } }
    if ($("aChap") && this.meta && this.ci >= 0) $("aChap").textContent = this.meta.chapters[this.ci].title;
  },

  wire() {
    if (this._w) return; this._w = true;
    $("rAud").onclick = () => { const bar = $("audbar"); bar.hidden = !bar.hidden; if (!bar.hidden) { $("ttsbar").hidden = true; $("aRate").value = String(this.rate()); this.showCache(); } };
    $("aPlay").onclick = () => this.toggle();
    $("aBack").onclick = () => this.seekBy(-15); $("aFwd").onclick = () => this.seekBy(30);
    $("aPrev").onclick = () => this.chap(-1); $("aNext").onclick = () => this.chap(1);
    $("aStop").onclick = () => { this.stop(); $("audbar").hidden = true; };
    $("aRate").onchange = e => { Prefs.set("arate", +e.target.value); if (this.a) { this.a.playbackRate = this.rate(); } };
    $("aSleep").onchange = e => this.setSleep(e.target.value);
    $("aDl").onclick = () => this.downloadAll();
    $("aDel").onclick = async () => { if (!this.bookId) return; const c = await this.cacheInfo(); if (!c.n) { this.msg("Niente da eliminare"); return; }
      if (!confirm(`Eliminare dal telefono l'audio scaricato di questo libro (${c.n} capitoli, ${c.mb.toFixed(0)} MB)? Resta su Drive e si può riscaricare.`)) return;
      const n = await this.clearCache(); this.msg(`Eliminati ${n} capitoli dal telefono`); };
    $("aAutoDel").checked = !!Prefs.d.audel; $("aAutoDel").onchange = e => Prefs.set("audel", e.target.checked);
    $("aSeek").oninput = () => { this.seeking = true; $("aTime").textContent = this.fmt($("aSeek").value); };
    $("aSeek").onchange = () => { this.seeking = false; if (this.a && this.ci >= 0) this.a.currentTime = +$("aSeek").value; };
  },
};
