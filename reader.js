"use strict";
const COLORS = { yellow: "#ffe066", green: "#a8e6a1", blue: "#9fd3ff", pink: "#ffb3d1", violet: "#d2b4f5" };
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", css: "text/css",
  ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2", mp3: "audio/mpeg", mp4: "video/mp4" };
const IMG = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const natkey = s => s.toLowerCase().split(/(\d+)/).map(x => (/^\d+$/.test(x) ? x.padStart(12, "0") : x)).join("");
const dec = new TextDecoder("utf-8");
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function posixJoin(base, rel) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel)) return rel;
  const parts = (rel.startsWith("/") ? rel : base + "/" + rel).split("/"), out = [];
  for (const p of parts) { if (!p || p === ".") continue; if (p === "..") out.pop(); else out.push(p); }
  return out.join("/");
}
const dirOf = p => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const dc = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };

function ttsChunks(text, start = 0, maxLen = 400, minLen = 80) {
  const re = /.+?(?:[.!?…]+["»”’)\]]*(?=\s|$)|\n+|$)/gys, out = []; re.lastIndex = start;
  let bs = null, be = null, m;
  while ((m = re.exec(text)) && m[0].length) {
    const s = m.index, e = s + m[0].length; if (!text.slice(s, e).trim()) continue;
    if (bs === null) { bs = s; be = e; } else be = e;
    if (be - bs >= minLen) { out.push([bs, be]); bs = null; }
    if (re.lastIndex >= text.length) break;
  }
  if (bs !== null) out.push([bs, be]);
  const res = [];
  for (let [s, e] of out) {
    while (e - s > maxLen * 1.5) { let cut = text.lastIndexOf(" ", s + maxLen); if (cut <= s) cut = s + maxLen; res.push([s, cut]); s = cut; }
    res.push([s, e]);
  }
  return res;
}

const Prefs = {
  d: Object.assign({ theme: "Chiaro", fs: 110, zoom: 100, cbzcont: true, voice: "", rate: 1 }, JSON.parse(localStorage.getItem("prefs") || "{}")),
  set(k, v) { this.d[k] = v; localStorage.setItem("prefs", JSON.stringify(this.d)); },
};
const THEMES = {
  Chiaro: "background:#fff!important;color:#111!important", Scuro: "background:#1e1e1e!important;color:#d4d4d4!important",
  Seppia: "background:#f4ecd8!important;color:#3b2f1e!important",
};

function sheet(title, html, onReady) {
  $("sheetTitle").textContent = title; $("sheetBody").innerHTML = html; $("sheet").hidden = false;
  if (onReady) onReady($("sheetBody"));
}
function closeSheet() { $("sheet").hidden = true; }
$("sheetX").onclick = closeSheet; $("sheet").onclick = e => { if (e.target.id === "sheet") closeSheet(); };

// ===================================================================== lettore
const Reader = {
  cur: null,
  async open(book) {
    const blob = await DB.get("files", book.id);
    if (!blob) { alert("File non scaricato: sincronizza."); return; }
    this.close(true); TTS.wire();
    $("shelf").hidden = true; $("reader").hidden = false; $("rTitle").textContent = book.title; $("rBody").innerHTML = "";
    const saved = State.progress(book.id);
    const R = this.cur = { book, saved: saved && saved.pos, pct0: saved ? saved.pct : 0, secs: 0, last: Date.now(), tts: null };
    R.timer = setInterval(() => this.tick(), 1000);
    ["touchstart", "scroll", "click"].forEach(ev => document.addEventListener(ev, () => { R.last = Date.now(); }, { passive: true, capture: true }));
    try {
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (book.fmt === "EPUB") R.k = await openEpub(R, buf);
      else if (book.fmt === "PDF") R.k = await openPdf(R, buf);
      else R.k = await openCbz(R, buf);
    } catch (e) { console.error(e); alert("Impossibile aprire il libro: " + e.message); this.close(); }
  },
  tick() {
    const R = this.cur; if (!R) return;
    if (document.visibilityState === "visible" && (Date.now() - R.last < 90000 || R.tts)) R.secs++;
  },
  close(silent) {
    const R = this.cur; if (!R) return;
    clearInterval(R.timer); TTS.stop(); if (R.k && R.k.destroy) R.k.destroy();
    const pct = (State.progress(R.book.id) || {}).pct || 0;
    State.addLog(R.book.id, R.secs, R.pct0, pct); State.saveNow();
    this.cur = null; $("selbar").hidden = true; $("ttsbar").hidden = true; $("rBody").innerHTML = "";
    if (!silent) { $("reader").hidden = true; $("shelf").hidden = false; if (window.App) App.render(); }
  },
  save(pos, pct) { const R = this.cur; if (!R) return; State.setProgress(R.book.id, pos, pct); $("rStat").textContent = pct.toFixed(0) + "%"; $("rSlider").value = Math.round(pct * 10); },
};
$("rBack").onclick = () => Reader.close();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") State.saveNow(); });

// ===================================================================== EPUB
async function openEpub(R, buf) {
  const files = fflate.unzipSync(buf);
  const lower = {}; for (const k of Object.keys(files)) lower[k.toLowerCase()] = k;
  const get = p => { p = dc(p); return files[p] || files[lower[p.toLowerCase()]]; };
  const text = p => { const f = get(p); return f ? dec.decode(f) : null; };
  const xml = s => new DOMParser().parseFromString(s, "application/xml");
  const cont = xml(text("META-INF/container.xml"));
  const opfPath = cont.querySelector("rootfile").getAttribute("full-path");
  const opf = xml(text(opfPath)), base = dirOf(opfPath);
  const man = {}; for (const it of opf.getElementsByTagName("item")) man[it.getAttribute("id")] = { href: it.getAttribute("href"), mt: it.getAttribute("media-type") || "", pr: it.getAttribute("properties") || "" };
  const spine = []; for (const ir of opf.getElementsByTagName("itemref")) { const m = man[ir.getAttribute("idref")]; if (m) spine.push(posixJoin(base, dc(m.href.split("#")[0]))); }
  const titles = {};
  const clean = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  for (const m of Object.values(man)) {
    try {
      const p = posixJoin(base, dc(m.href.split("#")[0]));
      if (m.pr.split(" ").includes("nav")) { const t = text(p) || ""; for (const a of t.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs)) { const k = posixJoin(dirOf(p), dc(a[1].split("#")[0])); if (!titles[k]) titles[k] = clean(a[2]); } }
      else if (m.mt === "application/x-dtbncx+xml") { const t = text(p) || ""; for (const a of t.matchAll(/<navLabel>\s*<text>(.*?)<\/text>.*?<content[^>]+src="([^"]+)"/gs)) { const k = posixJoin(dirOf(p), dc(a[2].split("#")[0])); if (!titles[k]) titles[k] = clean(a[1]); } }
    } catch (e) { }
  }
  const labels = spine.map((f, i) => `${i + 1}. ` + (titles[f] || f.split("/").pop().replace(/\.[^.]+$/, "")));
  const N = spine.length, urls = {};
  const resUrl = p => { p = dc(p); const f = get(p); if (!f) return null; const key = lower[p.toLowerCase()] || p;
    return urls[key] || (urls[key] = URL.createObjectURL(new Blob([f], { type: MIME[(key.split(".").pop() || "").toLowerCase()] || "application/octet-stream" }))); };
  const cssFix = (css, dir) => css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => /^(data:|#|[a-z]+:)/i.test(u) ? m : `url("${resUrl(posixJoin(dir, u)) || u}")`);

  const frame = document.createElement("iframe"); $("rBody").appendChild(frame);
  frame.srcdoc = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body></body></html>";
  await new Promise(r => frame.onload = r);
  const win = frame.contentWindow, doc = frame.contentDocument;
  const sc = doc.createElement("script"); sc.textContent = await (await fetch("lib/rd.js")).text(); doc.head.appendChild(sc);
  const rd = win.__rd;
  const themeEl = doc.createElement("style"); doc.head.appendChild(themeEl);
  function applyTheme() {
    themeEl.textContent = `html,body{${THEMES[Prefs.d.theme]}}body{font-size:${Prefs.d.fs}%!important;line-height:1.5;margin:0 auto!important;padding:14px 16px 60px!important;max-width:46em;overflow-wrap:break-word}`
      + `img,svg,video{max-width:100%!important;height:auto}a{color:inherit}`
      + (Prefs.d.theme === "Scuro" ? "body *{color:inherit!important;background-color:transparent!important}" : "");
  }
  applyTheme();
  let HL = [];
  const hlList = () => State.hlOf(R.book.id).map(h => ({ id: h.uid, ch: h.ch, start: h.start, end: h.end, color: h.color }));
  function refreshHl() { HL = hlList(); rd.setHighlights(HL); }

  function addChapter(i, where) {
    if (i < 0 || i >= N || doc.querySelector(`.__chap[data-ch="${i}"]`)) return false;
    const path = spine[i], src = text(path) || "", dir = dirOf(path);
    let d = new DOMParser().parseFromString(src, "application/xhtml+xml");
    if (d.getElementsByTagName("parsererror").length) d = new DOMParser().parseFromString(src, "text/html");
    const body = d.body || d.getElementsByTagName("body")[0]; if (!body) return false;
    for (const l of d.querySelectorAll("link[rel~=stylesheet],link[rel=Stylesheet]")) {
      const hp = posixJoin(dir, dc((l.getAttribute("href") || "").split("#")[0])), css = text(hp);
      if (css && !doc.querySelector(`style[data-src="${CSS.escape(hp)}"]`)) { const s = doc.createElement("style"); s.setAttribute("data-src", hp); s.textContent = cssFix(css, dirOf(hp)); doc.head.insertBefore(s, themeEl); }
    }
    for (const st of d.getElementsByTagName("style")) { const s = doc.createElement("style"); s.textContent = cssFix(st.textContent, dir); doc.head.insertBefore(s, themeEl); }
    for (const el of body.querySelectorAll("*")) {
      for (const a of ["src", "poster", "xlink:href"]) { const v = el.getAttribute(a); if (v && !/^(#|[a-z][a-z0-9+.-]*:)/i.test(v)) { const u = resUrl(posixJoin(dir, v)); if (u) el.setAttribute(a, u); } }
      if (el.localName === "image" || (el.localName === "img" && !el.getAttribute("src"))) { const v = el.getAttribute("href"); if (v && !/^[a-z]+:/i.test(v)) { const u = resUrl(posixJoin(dir, v)); if (u) el.setAttribute("href", u); } }
      if (el.localName === "a") { const v = el.getAttribute("href");
        if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) { const [pp, fr] = v.split("#"); el.setAttribute("href", "#__lk:" + (pp ? posixJoin(dir, dc(pp)) : path) + "|" + (fr || "")); }
        else if (v) el.setAttribute("target", "_blank"); }
    }
    const dv = doc.createElement("div"); dv.className = "__chap"; dv.setAttribute("data-ch", i);
    for (const n of body.childNodes) dv.appendChild(doc.importNode(n, true));
    if (where === "start") { const first = doc.querySelector(".__chap"), h0 = doc.documentElement.scrollHeight; doc.body.insertBefore(dv, first); win.scrollBy(0, doc.documentElement.scrollHeight - h0); }
    else doc.body.appendChild(dv);
    rd.setHighlights(HL); return true;
  }
  function openAt(idx, frac) {
    idx = Math.max(0, Math.min(N - 1, idx)); rd.clear(); win.scrollTo(0, 0); addChapter(idx, "end");
    if (idx + 1 < N) addChapter(idx + 1, "end");
    setTimeout(() => { rd.setFrac(idx, frac || 0); }, 60);
  }
  function gotoPath(p, frag) {
    const i = spine.indexOf(p); if (i < 0) return; openAt(i, 0);
    if (frag) setTimeout(() => { const e = doc.getElementById(frag) || doc.querySelector(`[name="${CSS.escape(frag)}"]`); if (e) win.scrollTo(0, win.scrollY + e.getBoundingClientRect().top - 20); }, 120);
  }
  function gotoHl(h) {
    openAt(h.ch, 0); setTimeout(() => rd.scrollToRange(h.start, h.end, h.ch), 160);
  }

  // --- selezione / tocchi
  let selTimer;
  doc.addEventListener("selectionchange", () => {
    clearTimeout(selTimer); selTimer = setTimeout(() => {
      const s = rd.selection(); if (!s) { if (!R.noteEdit) $("selbar").hidden = true; return; }
      showSelBar(JSON.parse(s));
    }, 280);
  });
  doc.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href^='#__lk:']");
    if (a) { e.preventDefault(); const [p, f] = a.getAttribute("href").slice(6).split("|"); gotoPath(p, f); return; }
    const s = win.getSelection(); if (s && !s.isCollapsed) return;
    const id = rd.hlAt(e.clientX, e.clientY); if (id) { e.preventDefault(); editHl(id); }
  });
  function hexOk(c) { return COLORS[c] || c; }
  function showSelBar(sel) {
    const bar = $("selbar"); bar.hidden = false;
    bar.innerHTML = Object.keys(COLORS).filter(c => c !== "violet").map(c => `<button class="dot" data-c="${c}" style="background:${COLORS[c]}"></button>`).join("")
      + `<button data-a="kw">★ Parola chiave</button><button data-a="note">✎ Nota</button><button data-a="look">Cerca</button><button data-a="x">✕</button>`;
    bar.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.c) { createHl(sel, b.dataset.c); }
      else if (b.dataset.a === "kw") createHl(sel, "violet", "consultazione");
      else if (b.dataset.a === "note") { const h = createHl(sel, "yellow"); editHl(h.uid); }
      else if (b.dataset.a === "look") lookup(sel.text, sel);
      win.getSelection().removeAllRanges(); bar.hidden = true;
    };
  }
  function createHl(sel, color, kind) {
    const h = State.addHl({ book: R.book.id, ch: sel.ch, start: sel.start, end: sel.end, text: sel.text, color, note: "", kind: kind || "", url: "", ctx: sel.ctx || "" });
    refreshHl(); return h;
  }
  function lookup(t, sel) {
    const q = encodeURIComponent(t.trim().slice(0, 200)), w = t.trim().split(/\s+/);
    const links = [["Google Traduttore", `https://translate.google.com/?sl=auto&tl=it&text=${q}&op=translate`, "google"],
      ["Wikizionario", `https://it.wiktionary.org/wiki/${encodeURIComponent(w[0].toLowerCase())}`, "wikt"],
      ["Google", `https://www.google.com/search?q=${q}`, "google"]];
    if (w.length === 1) links.splice(1, 0, ["Treccani", `https://www.treccani.it/vocabolario/ricerca/${encodeURIComponent(w[0].toLowerCase())}/`, "treccani"]);
    sheet("Consulta: " + t.trim().slice(0, 40), links.map((l, i) => `<div class="row" data-i="${i}">${esc(l[0])}</div>`).join("") + `<div class="row" data-i="k">★ Salva come parola chiave</div>`, body => {
      body.onclick = e => { const r = e.target.closest(".row"); if (!r) return; const i = r.dataset.i;
        if (i === "k") { createHl(sel, "violet", "consultazione"); closeSheet(); return; }
        window.open(links[i][1], "_blank"); createHl(sel, "violet", links[i][2]).url = links[i][1]; State.save(); refreshHl(); };
    });
  }
  function editHl(id) {
    const h = State.d.hl[id]; if (!h) return; R.noteEdit = true;
    sheet(h.color === "violet" ? "Parola chiave" : "Evidenziazione", `<div class="row">“${esc(h.text.slice(0, 300))}”</div><div class="set">
      <textarea id="hlNote" placeholder="Nota…">${esc(h.note || "")}</textarea><div class="btns" id="hlCols">`
      + Object.keys(COLORS).map(c => `<button class="dot" data-c="${c}" style="background:${COLORS[c]};${h.color === c ? "outline:3px solid #fff" : ""}"></button>`).join("")
      + `</div><div class="btns"><button id="hlSave">Salva</button><button id="hlDel">Elimina</button>${h.url ? '<button id="hlUrl">Apri consultazione</button>' : ""}</div></div>`, body => {
      body.querySelector("#hlCols").onclick = e => { const b = e.target.closest("button"); if (b) { State.updHl(id, { color: b.dataset.c }); refreshHl(); editHl(id); } };
      body.querySelector("#hlSave").onclick = () => { State.updHl(id, { note: body.querySelector("#hlNote").value }); R.noteEdit = false; closeSheet(); refreshHl(); };
      body.querySelector("#hlDel").onclick = () => { State.delHl(id); R.noteEdit = false; closeSheet(); refreshHl(); };
      const u = body.querySelector("#hlUrl"); if (u) u.onclick = () => window.open(h.url, "_blank");
    });
  }
  $("sheetX").addEventListener("click", () => { R.noteEdit = false; });

  // --- barre
  $("rToc").onclick = () => sheet("Indice", labels.map((l, i) => `<div class="row" data-i="${i}">${esc(l)}</div>`).join(""), b => { b.onclick = e => { const r = e.target.closest(".row"); if (r) { closeSheet(); openAt(+r.dataset.i, 0); } }; });
  $("rAnn").onclick = () => {
    const hs = State.hlOf(R.book.id);
    sheet(`Note ed evidenziazioni (${hs.length})`, hs.map(h => `<div class="row" data-u="${h.uid}"><span class="sw" style="background:${hexOk(h.color)}"></span>${esc(h.text.slice(0, 160))}<small>${esc(labels[h.ch] || "")}${h.note ? " — " + esc(h.note) : ""}</small></div>`).join("") || "<div class='row'>Nessuna.</div>",
      b => { b.onclick = e => { const r = e.target.closest(".row"); if (!r || !r.dataset.u) return; closeSheet(); gotoHl(State.d.hl[r.dataset.u]); }; });
  };
  $("rSet").onclick = () => {
    sheet("Aspetto", `<div class="set"><label>Tema<select id="sT">${Object.keys(THEMES).map(t => `<option ${t === Prefs.d.theme ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Dimensione testo<input id="sF" type="range" min="70" max="220" step="5" value="${Prefs.d.fs}"></label></div>`, b => {
      b.querySelector("#sT").onchange = e => { Prefs.set("theme", e.target.value); applyTheme(); };
      b.querySelector("#sF").oninput = e => { Prefs.set("fs", +e.target.value); applyTheme(); };
    });
  };
  $("rPrev").onclick = () => openAt((R.idx || 0) - 1, 0); $("rNext").onclick = () => openAt((R.idx || 0) + 1, 0);
  $("rSlider").oninput = e => { const p = e.target.value / 10 / 100 * N, i = Math.floor(p); clearTimeout(R.sl); R.sl = setTimeout(() => openAt(Math.min(N - 1, i), p - i), 250); };

  // --- posizione e salvataggio
  let last = "", lo = 0, hi = 0;
  const poll = setInterval(() => {
    const s = rd.pos(); if (!s) return; const p = JSON.parse(s);
    if (p.bot && p.hi + 1 < N) addChapter(p.hi + 1, "end");
    if (p.top && p.lo > 0) addChapter(p.lo - 1, "start");
    const pct = (p.ch + p.frac) / N * 100, key = p.ch + ":" + p.frac.toFixed(3);
    R.idx = p.ch; if (key !== last) { last = key; Reader.save({ type: "epub", idx: p.ch, frac: +p.frac.toFixed(4) }, pct); }
  }, 500);

  // --- lettura vocale
  R.tts = null;
  TTS.bind({
    async start() { const s = JSON.parse(rd.textFrom(true)); return { text: s.text, start: s.start, ch: s.ch }; },
    async next(ch) { if (ch + 1 >= N) return null; addChapter(ch + 1, "end"); const s = rd.textOf(ch + 1); return s ? { ...JSON.parse(s), ch: ch + 1 } : null; },
    mark(s, e, ch) { rd.ttsSet(s, e, ch); }, clear() { rd.ttsClear(); },
  });

  refreshHl();
  const sv = R.saved && R.saved.type === "epub" ? R.saved : { idx: 0, frac: 0 };
  openAt(sv.idx || 0, sv.frac || 0);
  return { destroy() { clearInterval(poll); Object.values(urls).forEach(u => URL.revokeObjectURL(u)); }, N };
}

// ===================================================================== lettura vocale
const TTS = {
  b: null, on: false, paused: false, voices: [],
  bind(b) { this.b = b; },
  init() {
    const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^(it|en)/i.test(v.lang)).sort((a, b) => (/^it/i.test(b.lang) - /^it/i.test(a.lang)) || a.name.localeCompare(b.name));
      $("tVoice").innerHTML = this.voices.map(v => `<option ${v.voiceURI === Prefs.d.voice ? "selected" : ""} value="${esc(v.voiceURI)}">${esc(v.name)} (${v.lang})</option>`).join(""); };
    if (window.speechSynthesis) { load(); speechSynthesis.onvoiceschanged = load; }
    $("tVoice").onchange = e => { Prefs.set("voice", e.target.value); if (this.on) this.restart(); };
    $("tRate").value = Prefs.d.rate; $("tRate").onchange = e => { Prefs.set("rate", +e.target.value); if (this.on) this.restart(); };
    this.wire();
    $("tPlay").onclick = () => { if (!this.on) this.play(); else if (this.paused) { this.paused = false; this.restart(); } else { this.paused = true; speechSynthesis.cancel(); this.gen++; } };
    $("tStop").onclick = () => { this.stop(); $("ttsbar").hidden = true; };
    $("tPrev").onclick = () => { if (this.on) { this.i = Math.max(0, this.i - 1); this.restart(true); } };
  },
  gen: 0,
  wire() { $("rTts").onclick = () => { if (!$("ttsbar").hidden && !this.on) { $("ttsbar").hidden = true; return; } $("ttsbar").hidden = false; if (!this.on) this.play(); }; },
  async play() {
    if (!window.speechSynthesis || !this.b) return alert("Lettura vocale non disponibile su questo browser.");
    const s = await this.b.start(); if (!s) return;
    this.on = true; this.paused = false; this.set(s.text, s.start, s.ch);
  },
  set(text, start, ch) { this.text = text; this.ch = ch; this.ch_chunks = ttsChunks(text, start); this.i = 0; this.restart(true); },
  restart(keepIdx) { this.gen++; speechSynthesis.cancel(); const g = this.gen; setTimeout(() => this.speak(g), 80); },
  speak(g) {
    if (g !== this.gen || !this.on || this.paused) return;
    const c = this.ch_chunks[this.i];
    if (!c) { this.b.next(this.ch).then(n => { if (g !== this.gen) return; if (!n) return this.stop(); this.set(n.text, 0, n.ch); }); return; }
    const u = new SpeechSynthesisUtterance(this.text.slice(c[0], c[1]).replace(/\s+/g, " ")); u.rate = Prefs.d.rate;
    const v = this.voices.find(x => x.voiceURI === Prefs.d.voice) || this.voices[0]; if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "it-IT";
    u.onend = () => { if (g !== this.gen) return; this.i++; this.speak(g); };
    u.onerror = () => { if (g === this.gen) { this.i++; this.speak(g); } };
    this.b.mark(c[0], c[1], this.ch); speechSynthesis.speak(u);
  },
  stop() { this.on = false; this.paused = false; this.gen++; if (window.speechSynthesis) speechSynthesis.cancel(); if (this.b && this.b.clear) try { this.b.clear(); } catch (e) { } },
};

// ===================================================================== PDF (scorrimento continuo)
async function openPdf(R, buf) {
  const pdfjs = await import("./lib/pdf.min.mjs"); pdfjs.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: buf }).promise, N = pdf.numPages;
  const wrap = document.createElement("div"); wrap.className = "pdfwrap"; $("rBody").appendChild(wrap);
  const p1 = await pdf.getPage(1), vp1 = p1.getViewport({ scale: 1 });
  let pages = [], page = Math.min(N - 1, Math.max(0, (R.saved && R.saved.page) || 0)), io = null, lastSaved = -1;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = () => Math.max(200, wrap.clientWidth * Prefs.d.zoom / 100);
  async function render(i) {
    const P = pages[i]; if (!P || P.busy || P.done === width()) return; P.busy = true;
    try {
      const pg = await pdf.getPage(i + 1), vp0 = pg.getViewport({ scale: 1 }), w = width(), vp = pg.getViewport({ scale: w / vp0.width * dpr });
      const cv = P.cv; cv.width = vp.width; cv.height = vp.height; cv.style.width = w + "px"; cv.style.height = (w * vp0.height / vp0.width) + "px";
      P.div.style.height = (w * vp0.height / vp0.width) + "px";
      await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise; P.done = w;
    } catch (e) { } P.busy = false;
  }
  function release(i) { const P = pages[i]; if (P && P.done && !P.busy) { P.cv.width = 1; P.cv.height = 1; P.done = 0; } }
  function build() {
    if (io) io.disconnect(); wrap.innerHTML = ""; pages = [];
    const w = width(), h = w * vp1.height / vp1.width;
    for (let i = 0; i < N; i++) {
      const d = document.createElement("div"); d.className = "pgdiv"; d.style.cssText = `width:${w}px;height:${h}px`; const cv = document.createElement("canvas"); cv.style.width = w + "px"; d.appendChild(cv); wrap.appendChild(d);
      pages.push({ div: d, cv, done: 0, busy: false }); d._i = i;
    }
    io = new IntersectionObserver(es => { for (const e of es) { const i = e.target._i; if (e.isIntersecting) render(i); else release(i); } }, { root: wrap, rootMargin: "1500px 0px" });
    pages.forEach(p => io.observe(p.div));
  }
  function cur() {
    const y = wrap.scrollTop + wrap.clientHeight * 0.25; let lo = 0, hi = N - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pages[m].div.offsetTop <= y) lo = m; else hi = m - 1; } return lo;
  }
  function go(p) { page = Math.max(0, Math.min(N - 1, p)); wrap.scrollTop = pages[page].div.offsetTop; }
  let st; wrap.addEventListener("scroll", () => { clearTimeout(st); st = setTimeout(() => { const p = cur(); if (p !== lastSaved) { lastSaved = p; page = p; Reader.save({ type: "pdf", page: p }, (p + 1) / N * 100); } }, 150); }, { passive: true });
  build(); go(page); setTimeout(() => go(page), 300);
  Reader.save({ type: "pdf", page }, (page + 1) / N * 100);
  $("rPrev").onclick = () => go(cur() - 1); $("rNext").onclick = () => go(cur() + 1);
  $("rSlider").oninput = e => { clearTimeout(R.sl); R.sl = setTimeout(() => go(Math.round(e.target.value / 1000 * (N - 1))), 200); };
  $("rToc").onclick = () => sheet("Vai a pagina", `<div class="set"><label>Pagina (1-${N})<input id="pg" type="text" inputmode="numeric" value="${cur() + 1}"></label><div class="btns"><button id="go">Vai</button></div></div>`, b => { b.querySelector("#go").onclick = () => { closeSheet(); go(+b.querySelector("#pg").value - 1); }; });
  $("rAnn").onclick = () => sheet("Evidenziazioni", "<div class='row'>Le evidenziazioni dei PDF non sono ancora disponibili (come sul minipc).</div>");
  $("rSet").onclick = () => sheet("Aspetto", `<div class="set"><label>Zoom<input id="z" type="range" min="60" max="300" step="10" value="${Prefs.d.zoom}"></label></div>`, b => { b.querySelector("#z").onchange = e => { Prefs.set("zoom", +e.target.value); const p = cur(); build(); go(p); }; });
  async function pageText(p) { const pg = await pdf.getPage(p + 1), tcn = await pg.getTextContent(); return tcn.items.map(i => i.str).join(" "); }
  TTS.bind({ async start() { return { text: await pageText(cur()), start: 0, ch: cur() }; },
    async next(ch) { if (ch + 1 >= N) return null; go(ch + 1); return { text: await pageText(ch + 1), ch: ch + 1 }; }, mark() { }, clear() { } });
  return { destroy() { if (io) io.disconnect(); pdf.destroy(); } };
}

// ===================================================================== CBZ (continuo o pagina singola)
async function openCbz(R, buf) {
  const files = fflate.unzipSync(buf, { filter: f => IMG.test(f.name) });
  const names = Object.keys(files).sort((a, b) => (natkey(a) < natkey(b) ? -1 : 1)), N = names.length;
  if (!N) throw new Error("nessuna immagine");
  const url = i => { const n = names[i], e = n.split(".").pop().toLowerCase(); return URL.createObjectURL(new Blob([files[n]], { type: MIME[e] || "image/jpeg" })); };
  const wrap = document.createElement("div"); wrap.className = "cbzwrap"; $("rBody").appendChild(wrap);
  let page = Math.min(N - 1, Math.max(0, (R.saved && R.saved.page) || 0));
  const toggleMode = () => { Prefs.set("cbzcont", !Prefs.d.cbzcont); Reader.open(R.book); };
  $("rToc").onclick = () => sheet("Vai a pagina", `<div class="set"><label>Pagina (1-${N})<input id="pg" type="text" inputmode="numeric" value="${page + 1}"></label><div class="btns"><button id="go">Vai</button></div></div>`, b => { b.querySelector("#go").onclick = () => { closeSheet(); go(+b.querySelector("#pg").value - 1); }; });
  $("rAnn").onclick = () => sheet("Fumetto", "<div class='row'>Pulsanti ◀ ▶ in basso per cambiare pagina. Nell'impostazione Aa puoi scegliere tra scorrimento continuo e pagina singola.</div>");
  $("rTts").onclick = () => alert("La lettura vocale non è disponibile per i fumetti.");
  $("rSet").onclick = () => sheet("Aspetto", `<div class="set"><label>Scorrimento continuo<input type="checkbox" id="mc" ${Prefs.d.cbzcont ? "checked" : ""}></label></div>`, b => { b.querySelector("#mc").onchange = () => { closeSheet(); toggleMode(); }; });
  let go, destroy;
  if (Prefs.d.cbzcont) {
    const imgs = [], urls = {}; let lastSaved = -1;
    for (let i = 0; i < N; i++) { const im = document.createElement("img"); im._i = i; im.style.cssText = "display:block;width:100%;height:auto;min-height:70vh;margin:0 auto;background:#222"; wrap.appendChild(im); imgs.push(im); }
    const io = new IntersectionObserver(es => { for (const e of es) { const im = e.target, i = im._i;
      if (e.isIntersecting) { if (!urls[i]) { urls[i] = url(i); im.onload = () => { im.style.minHeight = "0"; im.style.height = "auto"; }; im.src = urls[i]; } }
      else if (urls[i] && im.complete) { im.style.height = im.clientHeight + "px"; im.style.minHeight = "0"; URL.revokeObjectURL(urls[i]); delete urls[i]; im.removeAttribute("src"); } } }, { root: wrap, rootMargin: "2500px 0px" });
    imgs.forEach(im => io.observe(im));
    const cur = () => { const y = wrap.scrollTop + wrap.clientHeight * 0.25; let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (imgs[m].offsetTop <= y) lo = m; else hi = m - 1; } return lo; };
    go = p => { page = Math.max(0, Math.min(N - 1, p)); wrap.scrollTop = imgs[page].offsetTop; };
    let st; wrap.addEventListener("scroll", () => { clearTimeout(st); st = setTimeout(() => { const p = cur(); if (p !== lastSaved) { lastSaved = p; page = p; Reader.save({ page: p }, (p + 1) / N * 100); } }, 150); }, { passive: true });
    $("rPrev").onclick = () => go(cur() - 1); $("rNext").onclick = () => go(cur() + 1);
    $("rSlider").oninput = e => { clearTimeout(R.sl); R.sl = setTimeout(() => go(Math.round(e.target.value / 1000 * (N - 1))), 200); };
    setTimeout(() => go(page), 80); setTimeout(() => go(page), 500); Reader.save({ page }, (page + 1) / N * 100);
    destroy = () => { io.disconnect(); Object.values(urls).forEach(u => URL.revokeObjectURL(u)); };
  } else {
    const img = document.createElement("img"); wrap.appendChild(img); let fit = "w", cu = null;
    const apply = () => { if (fit === "w") { img.style.cssText = "width:100%;height:auto;max-width:100%"; } else { img.style.cssText = "height:100%;width:auto;max-width:100%"; } };
    go = p => { page = Math.max(0, Math.min(N - 1, p)); const old = cu; cu = url(page); img.src = cu; apply(); wrap.scrollTo(0, 0); if (old) setTimeout(() => URL.revokeObjectURL(old), 3000); Reader.save({ page }, (page + 1) / N * 100); };
    let lt = 0; wrap.addEventListener("click", e => {
      const t = Date.now(); if (t - lt < 280) { fit = fit === "w" ? "h" : "w"; apply(); lt = 0; return; } lt = t;
      const x = e.clientX / window.innerWidth; setTimeout(() => { if (lt !== t) return; if (x < .3) go(page - 1); else if (x > .7) go(page + 1); }, 290); });
    let sx = 0; wrap.addEventListener("touchstart", e => { sx = e.changedTouches[0].clientX; }, { passive: true });
    wrap.addEventListener("touchend", e => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 90 && fit === "h") go(page + (d < 0 ? 1 : -1)); }, { passive: true });
    $("rPrev").onclick = () => go(page - 1); $("rNext").onclick = () => go(page + 1);
    $("rSlider").oninput = e => { clearTimeout(R.sl); R.sl = setTimeout(() => go(Math.round(e.target.value / 1000 * (N - 1))), 150); };
    go(page); destroy = () => { if (cu) URL.revokeObjectURL(cu); };
  }
  return { destroy };
}
TTS.init();
