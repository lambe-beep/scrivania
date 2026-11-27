"use strict";
// ---------- IndexedDB minimale
const DB = (() => {
  let dbp;
  function open() {
    return dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("scrivania", 1);
      r.onupgradeneeded = () => { const d = r.result; ["kv", "books", "files", "covers"].forEach(s => d.createObjectStore(s)); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }
  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store); const q = fn(s);
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  }
  return {
    get: (s, k) => tx(s, "readonly", o => o.get(k)),
    put: (s, k, v) => tx(s, "readwrite", o => o.put(v, k)),
    del: (s, k) => tx(s, "readwrite", o => o.delete(k)),
    keys: s => tx(s, "readonly", o => o.getAllKeys()),
    all: s => tx(s, "readonly", o => o.getAll()),
  };
})();

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, "0")).join("");

// ---------- stato locale (avanzamento, evidenziazioni, tombstones, sessioni di lettura)
const State = {
  d: { books: {}, hl: {}, tomb: {}, log: {}, ink: {}, hist: {} },
  async load() { const s = await DB.get("kv", "state"); if (s) this.d = s; if (!this.d.ink) this.d.ink = {}; if (!this.d.hist) this.d.hist = {}; return this; },
  save() { clearTimeout(this._t); this._t = setTimeout(() => DB.put("kv", "state", this.d), 300); },
  saveNow() { clearTimeout(this._t); return DB.put("kv", "state", this.d); },
  setProgress(book, pos, pct) { this.d.books[book] = { pos, pct, upd: nowIso() }; this.save(); },
  progress(book) { return this.d.books[book]; },
  hlOf(book) { return Object.values(this.d.hl).filter(h => h.book === book).sort((a, b) => a.ch - b.ch || a.start - b.start); },
  addHl(h) { h.uid = h.uid || uid(); h.created = h.created || nowIso(); h.upd = nowIso(); this.d.hl[h.uid] = h; this.save(); return h; },
  updHl(u, patch) { const h = this.d.hl[u]; if (h) { Object.assign(h, patch); h.upd = nowIso(); this.save(); } return h; },
  delHl(u) { if (this.d.hl[u]) { delete this.d.hl[u]; this.d.tomb[u] = nowIso(); this.save(); } },
  addLog(book, secs, from, to) {
    if (secs < 10) return;
    const id = uid(); this.d.log[id] = { uid: id, book, day: new Date().toISOString().slice(0, 10), secs: Math.round(secs), from, to }; this.save();
  },
  // tratti a mano (pennino): immutabili, si aggiungono e si cancellano (con tombstone)
  _ix: null,
  inkOf(book, page) { if (!this._ix) { const m = {}; for (const k of Object.values(this.d.ink)) (m[k.book + ":" + k.page] = m[k.book + ":" + k.page] || []).push(k); this._ix = m; } return this._ix[book + ":" + page] || []; },
  addInk(k) { k.upd = nowIso(); this.d.ink[k.uid] = k; delete this.d.tomb[k.uid]; this._ix = null; this.save(); return k; },
  delInk(u) { if (this.d.ink[u]) { delete this.d.ink[u]; this.d.tomb[u] = nowIso(); this._ix = null; this.save(); } },
  restoreInk(k) { k = Object.assign({}, k); this.addInk(k); },
  logOf(book) { return Object.values(this.d.log).filter(l => l.book === book); },
  export(device) {
    return { device, updated: nowIso(), books: this.d.books, highlights: Object.values(this.d.hl),
      log: Object.values(this.d.log), ink: Object.values(this.d.ink), hist: this.d.hist, tombstones: Object.entries(this.d.tomb).map(([u, ts]) => ({ uid: u, ts })) };
  },
  // integra lo stato di un altro dispositivo; ritorna il numero di cambiamenti
  merge(r, validBooks) {
    let n = 0;
    for (const [b, p] of Object.entries(r.books || {})) {
      if (validBooks && !validBooks.has(b)) continue;
      const c = this.d.books[b]; if (!c || (c.upd || "") < p.upd) { this.d.books[b] = p; n++; }
    }
    const rt = {}; for (const t of r.tombstones || []) { rt[t.uid] = t.ts; if ((this.d.tomb[t.uid] || "") < t.ts) this.d.tomb[t.uid] = t.ts; }
    for (const h of r.highlights || []) {
      if (validBooks && !validBooks.has(h.book)) continue;
      const c = this.d.hl[h.uid], ts = this.d.tomb[h.uid];
      if (ts && ts >= h.upd) continue;
      if (!c || (c.upd || "") < h.upd) { this.d.hl[h.uid] = h; n++; }
    }
    for (const [b, L] of Object.entries(r.hist || {})) {      // cronologia posizioni: unione, al massimo 30 per libro
      if (validBooks && !validBooks.has(b)) continue;
      const cur = this.d.hist[b] = this.d.hist[b] || [], have = new Set(cur.map(x => x.ts + "|" + x.pct));
      for (const x of L) if (x && x.ts && !have.has(x.ts + "|" + x.pct)) { cur.push(x); n++; }
      cur.sort((a, c) => a.ts.localeCompare(c.ts)); while (cur.length > 30) cur.shift();
    }
    for (const k of r.ink || []) {
      if (validBooks && !validBooks.has(k.book)) continue;
      const ts = this.d.tomb[k.uid]; if (ts && ts >= k.upd) continue;
      if (!this.d.ink[k.uid]) { this.d.ink[k.uid] = k; this._ix = null; n++; }
    }
    for (const [u, ts] of Object.entries(this.d.tomb)) { const c = this.d.hl[u]; if (c && c.upd <= ts) { delete this.d.hl[u]; n++; } const k = this.d.ink[u]; if (k && k.upd <= ts) { delete this.d.ink[u]; this._ix = null; n++; } }
    for (const l of r.log || []) { if (!this.d.log[l.uid]) { this.d.log[l.uid] = l; n++; } }
    return n;
  },
};

// ---------- adattatore HTTP (per i test e per cartelle servite via web)
class HttpAdapter {
  constructor(base) { this.base = base.replace(/\/$/, ""); }
  async ready() { return true; }
  async list(sub) { const r = await fetch(`${this.base}/ls/${sub}`); return r.ok ? r.json() : []; }
  async readJson(sub, name) { const r = await fetch(`${this.base}/${sub ? sub + "/" : ""}${name}`, { cache: "no-store" }); if (!r.ok) return null; return r.json(); }
  async readBlob(sub, name) { const r = await fetch(`${this.base}/${sub}/${name}`); if (!r.ok) throw new Error("download " + name); return r.blob(); }
  async writeJson(sub, name, obj) { await fetch(`${this.base}/${sub}/${name}`, { method: "PUT", body: JSON.stringify(obj) }); }
}

// ---------- adattatore Google Drive (API v3, token da Google Identity Services)
class DriveAdapter {
  constructor(clientId, folderName) { this.cid = clientId; this.fname = folderName; this.token = null; this.exp = 0; this.ids = {}; }
  async _gis() {
    if (window.google && google.accounts && google.accounts.oauth2) return;
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = res; s.onerror = () => rej(new Error("Impossibile caricare Google (sei offline?)")); document.head.appendChild(s); });
  }
  async ready(interactive) {
    if (!this.token) { try { const j = JSON.parse(localStorage.getItem("gd_tok") || "null"); if (j) { this.token = j.t; this.exp = j.e; } } catch (e) { } }
    if (this.token && Date.now() < this.exp - 60000) return true;
    if (this.noRefresh) throw new Error("sessione Google scaduta: premi ⟳ per rinnovarla");
    if (!this.cid) throw new Error("ID cliente Google non configurato (config.js)");
    await this._gis();
    const hint = localStorage.getItem("gd_user") || "";
    await new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({ client_id: this.cid, scope: "https://www.googleapis.com/auth/drive", ...(hint ? { hint } : {}),
        callback: r => { if (r.error) return rej(new Error(r.error)); this.token = r.access_token; this.exp = Date.now() + r.expires_in * 1000; localStorage.setItem("gd_ok", "1"); localStorage.setItem("gd_tok", JSON.stringify({ t: this.token, e: this.exp })); res(true); },
        error_callback: e => rej(new Error(e.type || "autorizzazione negata")) });
      tc.requestAccessToken({ prompt: localStorage.getItem("gd_ok") ? "" : "consent" });
    });
    if (!hint) { try { const j = await (await this._api("/drive/v3/about?fields=user(emailAddress)")).json(); if (j.user) localStorage.setItem("gd_user", j.user.emailAddress); } catch (e) { } }
    return true;
  }
  async _api(path, opt = {}) {
    const r = await fetch("https://www.googleapis.com" + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + this.token } });
    if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return r;
  }
  async _children(parent) {
    const out = []; let tok = "";
    do {
      const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
      const j = await (await this._api(`/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)&pageSize=1000&spaces=drive${tok ? "&pageToken=" + tok : ""}`)).json();
      out.push(...j.files); tok = j.nextPageToken || "";
    } while (tok);
    return out;
  }
  async _root() {
    if (this.ids[""]) return this.ids[""];
    const q = encodeURIComponent(`name='${this.fname}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const j = await (await this._api(`/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`)).json();
    if (!j.files.length) throw new Error(`Cartella "${this.fname}" non trovata su Google Drive`);
    return (this.ids[""] = j.files[0].id);
  }
  async _sub(sub) {
    if (this.ids[sub] !== undefined) return this.ids[sub];
    let parent = await this._root(); if (!sub) return parent;
    let path = "";
    for (const p of sub.split("/")) {            // sottocartelle annidate (es. audio/<id>)
      path = path ? path + "/" + p : p;
      if (this.ids[path] !== undefined) { parent = this.ids[path]; continue; }
      const ch = await this._children(parent); const f = ch.find(x => x.name === p && x.mimeType.endsWith("folder"));
      if (f) { parent = this.ids[path] = f.id; continue; }
      if (path !== "state" && path !== "devices" && path !== "cmd") throw new Error(`Sottocartella ${path} mancante`);
      const j = await (await this._api("/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p, mimeType: "application/vnd.google-apps.folder", parents: [parent] }) })).json();
      parent = this.ids[path] = j.id;
    }
    return parent;
  }
  async list(sub) { const id = await this._sub(sub); this._cache = this._cache || {}; const ch = (await this._children(id)).filter(x => !x.mimeType.endsWith("folder")); this._cache[sub] = ch; return ch.map(x => ({ name: x.name, size: +x.size || 0, id: x.id })); }
  async _file(sub, name) { const ls = await this.list(sub); return ls.filter(x => x.name === name).pop(); }
  async readJson(sub, name) { const f = await this._file(sub, name); if (!f) return null; return (await this._api(`/drive/v3/files/${f.id}?alt=media`)).json(); }
  async readBlob(sub, name) { const f = await this._file(sub, name); if (!f) throw new Error("manca " + name); return (await this._api(`/drive/v3/files/${f.id}?alt=media`)).blob(); }
  async writeJson(sub, name, obj) {
    const f = await this._file(sub, name), body = JSON.stringify(obj);
    if (f) { await this._api(`/upload/drive/v3/files/${f.id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body }); return; }
    const parent = await this._sub(sub), bd = "xxbd" + uid();
    const mp = `--${bd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${bd}--`;
    await this._api("/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + bd }, body: mp });
  }
}

// ---------- ciclo di sincronizzazione
// ---------- comandi dal minipc (cancellare audio/libri su questo telefono) e rapporto sullo spazio occupato
async function runCommands(adapter, device) {
  let cmds = []; try { const f = await adapter.readJson("cmd", device + ".json"); cmds = (f && f.cmds) || []; } catch (e) { return 0; }
  const done = new Set((await DB.get("kv", "cmddone")) || []), nodl = new Set((await DB.get("kv", "nodl")) || []); let n = 0;
  const delAud = async id => { for (const k of await DB.keys("files")) if (typeof k === "string" && k.startsWith("aud:" + id + ":")) await DB.del("files", k); };
  for (const c of cmds) {
    if (!c || !c.id || done.has(c.id)) continue;
    try {
      if (c.op === "del_audio") await delAud(c.book);
      else if (c.op === "del_book") { nodl.add(c.book); await delAud(c.book); await DB.del("books", c.book); await DB.del("files", c.book); await DB.del("covers", c.book); }
      else if (c.op === "restore_book") nodl.delete(c.book);
      else continue;
      done.add(c.id); n++;
    } catch (e) { console.error(e); }
  }
  if (n) { await DB.put("kv", "cmddone", [...done].slice(-200)); await DB.put("kv", "nodl", [...nodl]); }
  return n;
}
async function writeReport(adapter, device) {
  try {
    const books = new Map((await DB.all("books")).map(b => [b.id, b])), bk = [], au = {};
    for (const k of await DB.keys("files")) {
      const blob = await DB.get("files", k), sz = (blob && blob.size) || 0;
      if (typeof k === "string" && k.startsWith("aud:")) { const id = k.split(":")[1]; (au[id] = au[id] || { id, n: 0, size: 0 }); au[id].n++; au[id].size += sz; }
      else bk.push({ id: k, title: (books.get(k) || {}).title || "", size: sz });
    }
    let usage = 0, quota = 0; try { const e = await navigator.storage.estimate(); usage = e.usage || 0; quota = e.quota || 0; } catch (e) { }
    await adapter.writeJson("devices", device + ".json", { device, updated: nowIso(), usage, quota, books: bk,
      audio: Object.values(au).map(a => ({ ...a, title: (books.get(a.id) || {}).title || "" })), nodl: (await DB.get("kv", "nodl")) || [],
      done: ((await DB.get("kv", "cmddone")) || []) });
  } catch (e) { console.error("report", e); }
}

async function runSync(adapter, device, onMsg, interactive) {
  onMsg("Connessione…");
  await adapter.ready(interactive);
  const man = await adapter.readJson("", "manifest.json");
  if (!man) throw new Error("manifest.json non trovato: sincronizza prima dal minipc");
  try { await runCommands(adapter, device); } catch (e) { console.error(e); }
  const nodl = new Set((await DB.get("kv", "nodl")) || []);
  const local = await DB.all("books"), have = new Map(local.map(b => [b.id, b]));
  const wanted = new Set(man.books.map(b => b.id));
  let dl = 0;
  const fl = new Set((await adapter.list("books")).map(x => x.name));
  for (const b of man.books) {
    if (nodl.has(b.id)) continue;           // libro tolto da questo telefono su richiesta del minipc
    const cur = have.get(b.id), ok = (await DB.get("files", b.id));
    if (!cur || cur.rev !== b.rev || !ok) {
      if (!fl.has(b.file)) continue;
      onMsg(`Scarico ${b.title}…`);
      const blob = await adapter.readBlob("books", b.file);
      await DB.put("files", b.id, blob); dl++;
    }
    if (b.cover && (!cur || cur.cover !== b.cover || !(await DB.get("covers", b.id)))) {
      try { await DB.put("covers", b.id, await adapter.readBlob("covers", b.cover)); } catch (e) { }
    }
    await DB.put("books", b.id, b);
  }
  for (const id of have.keys()) if (!wanted.has(id)) { await DB.del("books", id); await DB.del("files", id); await DB.del("covers", id); }
  try { const st = await adapter.readJson("", "settings.json"); if (st) { localStorage.setItem("pcsettings", JSON.stringify(st)); if (typeof Prefs !== "undefined") Prefs.pc = st; } } catch (e) { }
  try { const ix = await adapter.readJson("audio", "index.json"); await DB.put("kv", "audioidx", ix && ix.books ? ix.books : {}); } catch (e) { }
  onMsg("Unisco note e avanzamento…");
  let ch = 0;
  const mine = device + ".json";
  for (const f of await adapter.list("state")) {
    if (!f.name.endsWith(".json") || f.name === mine) continue;
    const r = await adapter.readJson("state", f.name); if (r) ch += State.merge(r, wanted);
  }
  await State.saveNow();
  await adapter.writeJson("state", mine, State.export(device));
  await writeReport(adapter, device);
  return { books: man.books.length, downloaded: dl, changes: ch };
}
