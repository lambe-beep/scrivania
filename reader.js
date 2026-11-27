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
  d: Object.assign({ theme: "Chiaro", fs: 110, zoom: 100, czoom: 100, cbzcont: true, voice: "", rate: 1, pitch: 1, vlang: "it",
    wake: false, follow: true, font: "", lh: 1.5, margin: 0.6, indent: 0, ls: 0, ws: 0, width: 48, book: false, align: "" }, JSON.parse(localStorage.getItem("prefs") || "{}")),
  pc: null,        // impostazioni del minipc (settings.json), aggiornate a ogni sincronizzazione
  set(k, v) { this.d[k] = v; localStorage.setItem("prefs", JSON.stringify(this.d)); },
};
try { Prefs.pc = JSON.parse(localStorage.getItem("pcsettings") || "null"); } catch (e) { }
const THEMES = {
  Chiaro: "html,body{background:#fff!important;color:#111!important}",
  Scuro: "html,body{background:#1e1e1e!important;color:#d4d4d4!important}body *{background-color:transparent!important;color:inherit!important}a,a *{color:#6cb6ff!important}img{opacity:.9}",
  Seppia: "html,body{background:#f4ecd8!important;color:#5b4636!important}body *{background-color:transparent!important;color:inherit!important}a,a *{color:#8a5a2b!important}",
  Nero: "html,body{background:#000!important;color:#c8c8c8!important}body *{background-color:transparent!important;color:inherit!important}a,a *{color:#6cb6ff!important}img{opacity:.85}",
};
const THEME_BG = { Chiaro: "#fff", Scuro: "#1e1e1e", Seppia: "#f4ecd8", Nero: "#000" };
// caratteri incorporati nell'app (funzionano anche offline) + caratteri di sistema
const FONTS = [
  { id: "", label: "Come il libro" },
  { id: "Literata", label: "Literata (serif per lettura)", file: "literata" }, { id: "Merriweather", label: "Merriweather (serif)", file: "merriweather" },
  { id: "Lora", label: "Lora (serif)", file: "lora" }, { id: "Source Serif 4", label: "Source Serif", file: "source-serif-4" },
  { id: "Crimson Pro", label: "Crimson Pro (serif classico)", file: "crimson-pro" },
  { id: "Atkinson Hyperlegible", label: "Atkinson (alta leggibilità)", file: "atkinson-hyperlegible" },
  { id: "Open Sans", label: "Open Sans (sans)", file: "open-sans" }, { id: "OpenDyslexic", label: "OpenDyslexic (dislessia)", file: "opendyslexic" },
  { id: "Georgia,'Noto Serif',serif", label: "Serif di sistema (Georgia)", sys: true },
  { id: "'Segoe UI',Roboto,'Noto Sans',Arial,sans-serif", label: "Sans di sistema", sys: true },
  { id: "'Courier New',monospace", label: "Monospazio", sys: true },
];
function fontFaceCss() {
  const base = new URL("lib/fonts/", location.href).href; let c = "";
  for (const f of FONTS) if (f.file) for (const w of [400, 700]) for (const s of ["normal", "italic"])
    c += `@font-face{font-family:'${f.id}';font-weight:${w};font-style:${s};font-display:swap;src:url(${base}${f.file}-latin-${w}-${s}.woff2) format('woff2')}`;
  return c;
}
// traduce il carattere scelto sul minipc (es. "Georgia", "Segoe UI") in un carattere disponibile sul telefono
function mapFont(fam) {
  if (!fam) return "";
  const n = fam.toLowerCase(), hit = FONTS.find(f => f.file && (n === f.id.toLowerCase() || n.startsWith(f.id.toLowerCase())));
  if (hit) return `'${hit.id}',serif`;
  if (/mono|courier|consolas|lucida console/.test(n)) return "'Courier New',monospace";
  if (/georgia|times|garamond|palatino|book|cambria|serif|minion|baskerville|caslon|constantia|charter/.test(n) && !/sans/.test(n)) return "Georgia,'Noto Serif',serif";
  return "'Segoe UI',Roboto,'Noto Sans',Arial,sans-serif";
}
// impostazioni effettive: se "segui il minipc" e disponibili, tema/carattere/impaginazione sono quelli del minipc
function eff() {
  const d = Prefs.d, pc = Prefs.pc;
  const e = { theme: d.theme, font: d.font, lh: d.lh, margin: d.margin, indent: d.indent, ls: d.ls, ws: d.ws, width: d.width, book: d.book,
    fs: d.fs, align: d.align, following: false };
  if (d.follow && pc) {
    const L = pc.layout || {};
    Object.assign(e, { theme: THEMES[pc.theme] ? pc.theme : "Chiaro", font: mapFont(pc.font), following: true });
    if (L.lh !== undefined) Object.assign(e, { lh: L.lh, margin: L.margin, indent: L.indent, ls: L.ls, ws: L.ws, width: L.width, book: !!L.book });
  }
  return e;
}
function epubCss(e) {
  let c = fontFaceCss() + THEMES[e.theme] || "";
  c += `body{font-size:${e.fs}%!important;margin:0 auto!important;padding:14px 16px 60px!important;max-width:${e.width}em;overflow-wrap:break-word}`;
  c += "img,svg,video{max-width:100%!important;height:auto}";
  if (e.font) c += `body,body *{font-family:${e.font}!important}`;
  if (!e.book) c += `body p{margin-top:0!important;margin-bottom:${e.margin}em!important;text-indent:${e.indent}em!important}`
    + `body,body *{line-height:${e.lh}!important;word-spacing:${e.ws}px!important;letter-spacing:${e.ls}px!important}`;
  if (e.align) c += `body p,body li{text-align:${e.align}!important;${e.align === "justify" ? "hyphens:auto;-webkit-hyphens:auto" : ""}}`;
  return c;
}

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
    this.close(true); TTS.wire(); Aud.wire(); Ink.unbind(); Ink.setOn(false); $("rPen").hidden = true;
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
    clearInterval(R.timer); TTS.stop(); Aud.unbind(); if (R.k && R.k.destroy) R.k.destroy();
    const pct = (State.progress(R.book.id) || {}).pct || 0;
    State.addLog(R.book.id, R.secs, R.pct0, pct); State.saveNow();
    Ink.unbind(); Ink.setOn(false); $("rPen").hidden = true;
    this.cur = null; $("selbar").hidden = true; $("ttsbar").hidden = true; $("rBody").innerHTML = "";
    if (!silent) { $("reader").hidden = true; $("shelf").hidden = false; if (typeof App !== "undefined") { App.render(); setTimeout(() => App.sync(false, true), 400); } }
  },
  save(pos, pct) { const R = this.cur; if (!R) return; State.setProgress(R.book.id, pos, pct); $("rStat").textContent = pct.toFixed(0) + "%"; $("rSlider").value = Math.round(pct * 10); },
};
$("rBack").onclick = () => Reader.close();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") State.saveNow(); else if (typeof Aud !== "undefined") Aud.refresh(); });

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
  try { if (localStorage.getItem("force_fb")) win.__rdFB = true; } catch (e) { }
  const sc = doc.createElement("script"); sc.textContent = await (await fetch("lib/rd.js")).text(); doc.head.appendChild(sc);
  const rd = win.__rd;
  const themeEl = doc.createElement("style"); doc.head.appendChild(themeEl);
  function applyTheme() { const e = eff(); themeEl.textContent = epubCss(e); $("rBody").style.background = THEME_BG[e.theme]; }
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
    sheet(`Note ed evidenziazioni (${hs.length})`, hs.map(h => `<div class="row" data-u="${h.uid}" style="display:flex;align-items:center;gap:6px"><div class="go" style="flex:1;min-width:0"><span class="sw" style="background:${hexOk(h.color)}"></span>${esc(h.text.slice(0, 160))}<small>${esc(labels[h.ch] || "")}${h.note ? " — " + esc(h.note) : ""}</small></div><button class="ed" title="Modifica" style="padding:8px 10px">✎</button><button class="dl" title="Elimina" style="padding:8px 10px">🗑</button></div>`).join("") || "<div class='row'>Nessuna.</div>",
      b => { b.onclick = e => { const r = e.target.closest(".row"); if (!r || !r.dataset.u) return; const u = r.dataset.u;
        if (e.target.closest(".dl")) { if (confirm("Eliminare questa evidenziazione?")) { State.delHl(u); refreshHl(); $("rAnn").onclick(); } return; }
        if (e.target.closest(".ed")) { closeSheet(); editHl(u); return; }
        closeSheet(); gotoHl(State.d.hl[u]); }; });
  };
  function settingsSheet() {
    const e = eff(), fol = e.following, dis = fol ? "disabled" : "";
    const sl = (id, lab, min, max, step, v, unit = "") => `<label>${lab} <span id="v_${id}">${v}${unit}</span></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${v}" ${dis} style="width:100%">`;
    sheet("Aspetto del testo", `<div class="set">
      <label>Segui le impostazioni del minipc<input type="checkbox" id="sFol" ${Prefs.d.follow ? "checked" : ""}></label>
      <p style="color:var(--mut);font-size:13px;margin:0 0 6px">${Prefs.pc ? (fol ? "Tema, carattere e impaginazione arrivano dal minipc (aggiornati a ogni sincronizzazione). Dimensione e allineamento restano per questo dispositivo." : "Impostazioni personalizzate per questo dispositivo.") : "Impostazioni del minipc non ancora ricevute: sincronizza."}</p>
      <label>Tema<select id="sT" ${dis}>${Object.keys(THEMES).map(t => `<option ${t === e.theme ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Carattere<select id="sFont" ${dis}>${FONTS.map(f => `<option value="${esc(f.id)}" ${f.id === (fol ? "__none__" : Prefs.d.font) ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select></label>
      ${sl("sF", "Dimensione testo", 70, 260, 5, e.fs, "%")}
      <label>Allineamento<select id="sAl"><option value="" ${e.align === "" ? "selected" : ""}>Come il libro</option><option value="left" ${e.align === "left" ? "selected" : ""}>A sinistra</option><option value="justify" ${e.align === "justify" ? "selected" : ""}>Giustificato</option></select></label>
      <label>Usa l'impaginazione del libro<input type="checkbox" id="sBook" ${e.book ? "checked" : ""} ${dis}></label>
      ${sl("sLh", "Interlinea", 1, 2.6, 0.1, +(+e.lh).toFixed(1))}
      ${sl("sMg", "Spazio tra i paragrafi (em)", 0, 3, 0.1, +(+e.margin).toFixed(1))}
      ${sl("sIn", "Rientro prima riga (em)", 0, 4, 0.5, +(+e.indent).toFixed(1))}
      ${sl("sLs", "Spaziatura lettere (px)", -1, 5, 0.5, +(+e.ls).toFixed(1))}
      ${sl("sWs", "Spaziatura parole (px)", -2, 10, 0.5, +(+e.ws).toFixed(1))}
      ${sl("sWd", "Larghezza del testo (em)", 20, 90, 2, Math.round(e.width))}
      <div class="btns"><button id="sReset" ${dis}>Ripristina</button></div></div>`, b => {
      const set = (k, v) => { Prefs.set(k, v); applyTheme(); };
      const bind = (id, key, num) => { const el = b.querySelector("#" + id), out = b.querySelector("#v_" + id); el.oninput = ev => { const v = num ? +ev.target.value : ev.target.value; if (out) out.textContent = v + (id === "sF" ? "%" : ""); set(key, v); }; };
      b.querySelector("#sFol").onchange = ev => { Prefs.set("follow", ev.target.checked); if (!ev.target.checked && Prefs.pc) { const x = eff0(); } applyTheme(); settingsSheet(); };
      // passando a "personalizzato" si parte dai valori del minipc
      function eff0() { const pc = Prefs.pc; if (pc) { const L = pc.layout || {}; Prefs.set("theme", THEMES[pc.theme] ? pc.theme : "Chiaro"); Prefs.set("font", FONTS.some(f => f.id === mapFont(pc.font)) ? mapFont(pc.font) : ""); if (L.lh !== undefined) ["lh", "margin", "indent", "ls", "ws", "width"].forEach(k => Prefs.set(k, L[k])); Prefs.set("book", !!L.book); } }
      bind("sT", "theme"); bind("sFont", "font"); bind("sF", "fs", true); bind("sAl", "align"); bind("sLh", "lh", true); bind("sMg", "margin", true);
      bind("sIn", "indent", true); bind("sLs", "ls", true); bind("sWs", "ws", true); bind("sWd", "width", true);
      b.querySelector("#sBook").onchange = ev => set("book", ev.target.checked);
      b.querySelector("#sReset").onclick = () => { Object.entries({ theme: "Chiaro", font: "", fs: 110, lh: 1.5, margin: 0.6, indent: 0, ls: 0, ws: 0, width: 48, book: false, align: "" }).forEach(([k, v]) => Prefs.set(k, v)); applyTheme(); settingsSheet(); };
    });
  }
  $("rSet").onclick = settingsSheet;
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

  Aud.bind(R.book, {
    async start() { return JSON.parse(rd.textFrom(true)); },
    async openCh(ch) { let s = rd.textOf(ch); if (!s) { openAt(ch, 0); await new Promise(r => setTimeout(r, 200)); s = rd.textOf(ch); } return JSON.parse(s); },
    pos() { const s = rd.pos(); return s ? JSON.parse(s) : null; },
    mark(s, e, ch) { rd.ttsSet(s, e, ch); }, clear() { rd.ttsClear(); },
  });

  refreshHl();
  const sv = R.saved && R.saved.type === "epub" ? R.saved : { idx: 0, frac: 0 };
  openAt(sv.idx || 0, sv.frac || 0);
  return { destroy() { clearInterval(poll); Object.values(urls).forEach(u => URL.revokeObjectURL(u)); }, N };
}

// ===================================================================== lettura vocale
// --- lettura in background: audio silenzioso + controlli nella schermata di blocco (Media Session) + schermo acceso opzionale
const Keep = {
  a: null, wl: null,
  wav() {
    const n = 8000, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = (o, x) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
    s(0, "RIFF"); v.setUint32(4, 36 + n, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, "data"); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) b[44 + i] = 127 + (i & 1);   // quasi silenzio (non completamente zero, cosi' il sistema lo considera audio in riproduzione)
    return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
  },
  start() {
    try {
      if (!this.a) { this.a = new Audio(this.wav()); this.a.loop = true; this.a.volume = 0.02; }
      const p = this.a.play(); if (p && p.catch) p.catch(() => { });
      const ms = navigator.mediaSession;
      if (ms) {
        const R = Reader.cur; ms.metadata = new MediaMetadata({ title: R ? R.book.title : "Lettura", artist: "Ebook Scrivania" }); ms.playbackState = "playing";
        const h = (n, f) => { try { ms.setActionHandler(n, f); } catch (e) { } };
        h("play", () => $("tPlay").click()); h("pause", () => $("tPlay").click()); h("stop", () => $("tStop").click());
        h("previoustrack", () => $("tPrev").click()); h("nexttrack", () => $("tNext").click());
      }
    } catch (e) { }
    this.wake(true);
  },
  stop(paused) {
    try { if (this.a) this.a.pause(); if (navigator.mediaSession) navigator.mediaSession.playbackState = paused ? "paused" : "none"; } catch (e) { }
    this.wake(false);
  },
  async wake(on) {
    try {
      if (on && Prefs.d.wake && navigator.wakeLock && !this.wl) { this.wl = await navigator.wakeLock.request("screen"); this.wl.addEventListener("release", () => { this.wl = null; }); }
      if (!on && this.wl) { await this.wl.release(); this.wl = null; }
    } catch (e) { }
  },
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !TTS.on || TTS.paused) return;
  Keep.wake(true);
  if (window.speechSynthesis && !speechSynthesis.speaking) TTS.restart();   // se il sistema ha fermato la voce a schermo spento, riparte dalla frase corrente
});

const TTS = {
  b: null, on: false, paused: false, voices: [], gen: 0,
  bind(b) { this.b = b; },
  ui() { if (this.on && !this.paused) Keep.start(); else Keep.stop(this.on); $("tPlay").textContent = this.on && !this.paused ? "⏸" : "▶"; $("tPlay").title = this.on && !this.paused ? "Pausa" : "Avvia"; $("rTts").style.outline = this.on ? "2px solid var(--acc)" : ""; },
  init() {
    const load = () => {
      const all = (window.speechSynthesis ? speechSynthesis.getVoices() : []).slice();
      this.voices = all;
      const sel = $("tLang"), langs = [...new Set(all.map(v => v.lang.slice(0, 2).toLowerCase()))].sort();
      const names = { it: "Italiano", en: "Inglese", fr: "Francese", es: "Spagnolo", de: "Tedesco", pt: "Portoghese", ru: "Russo", ja: "Giapponese", zh: "Cinese", nl: "Olandese" };
      sel.innerHTML = `<option value="*">Tutte le lingue (${all.length})</option>` + langs.map(l => `<option value="${l}">${names[l] || l.toUpperCase()}</option>`).join("");
      if (Prefs.d.vlang !== "*" && !langs.includes(Prefs.d.vlang)) Prefs.set("vlang", langs.includes("it") ? "it" : "*");
      sel.value = Prefs.d.vlang; fill();
    };
    const fill = () => {
      const L = Prefs.d.vlang, list = this.voices.filter(v => L === "*" || v.lang.slice(0, 2).toLowerCase() === L).sort((a, b) => a.name.localeCompare(b.name));
      $("tVoice").innerHTML = list.map(v => `<option ${v.voiceURI === Prefs.d.voice ? "selected" : ""} value="${esc(v.voiceURI)}">${esc(v.name)} (${v.lang})${v.localService ? "" : " ☁"}</option>`).join("") || "<option>Nessuna voce</option>";
      if (list.length && !list.some(v => v.voiceURI === Prefs.d.voice)) Prefs.set("voice", list[0].voiceURI);
    };
    if (window.speechSynthesis) { load(); speechSynthesis.onvoiceschanged = load; }
    $("tLang").onchange = e => { Prefs.set("vlang", e.target.value); fill(); if (this.on) this.restart(); };
    $("tVoice").onchange = e => { Prefs.set("voice", e.target.value); if (this.on) this.restart(); };
    $("tRate").value = Prefs.d.rate; $("tRate").onchange = e => { Prefs.set("rate", +e.target.value); if (this.on) this.restart(); };
    $("tWake").checked = !!Prefs.d.wake; $("tWake").onchange = e => { Prefs.set("wake", e.target.checked); if (this.on && !this.paused) Keep.wake(e.target.checked); };
    $("tPitch").value = Prefs.d.pitch; $("tPitch").onchange = e => { Prefs.set("pitch", +e.target.value); if (this.on) this.restart(); };
    this.wire();
    $("tPlay").onclick = () => { if (!this.on || this.paused) Keep.start(); if (!this.on) this.play(); else if (this.paused) { this.paused = false; this.ui(); this.restart(); } else { this.paused = true; this.gen++; speechSynthesis.cancel(); this.ui(); } };
    $("tStop").onclick = () => { this.stop(); $("ttsbar").hidden = true; };
    $("tPrev").onclick = () => { if (this.on) { this.i = Math.max(0, this.i - 1); this.paused = false; this.ui(); this.restart(); } };
    $("tNext").onclick = () => { if (this.on) { this.i++; this.paused = false; this.ui(); this.restart(); } };
    this.ui();
  },
  wire() { $("rTts").onclick = () => { if (!$("ttsbar").hidden && !this.on) { $("ttsbar").hidden = true; return; } $("ttsbar").hidden = false; if (!this.on) { Keep.start(); this.play(); } }; },
  async play() {
    if (typeof Aud !== "undefined" && Aud.a && !Aud.a.paused) Aud.pause();
    if (!window.speechSynthesis || !this.b) return alert("Lettura vocale non disponibile su questo browser.");
    const s = await this.b.start(); if (!s) return;
    this.on = true; this.paused = false; this.ui(); this.set(s.text, s.start, s.ch);
  },
  set(text, start, ch) { this.text = text; this.ch = ch; this.ch_chunks = ttsChunks(text, start); this.i = 0; this.restart(); },
  restart() { this.gen++; speechSynthesis.cancel(); const g = this.gen; setTimeout(() => this.speak(g), 80); },
  speak(g) {
    if (g !== this.gen || !this.on || this.paused) return;
    const c = this.ch_chunks[this.i];
    if (!c) { this.b.next(this.ch).then(n => { if (g !== this.gen) return; if (!n) return this.stop(); this.set(n.text, 0, n.ch); }); return; }
    const u = new SpeechSynthesisUtterance(this.text.slice(c[0], c[1]).replace(/\s+/g, " ")); u.rate = Prefs.d.rate; u.pitch = Prefs.d.pitch || 1;
    const v = this.voices.find(x => x.voiceURI === Prefs.d.voice); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "it-IT";
    u.onend = () => { if (g !== this.gen) return; this.i++; this.speak(g); };
    u.onerror = () => { if (g === this.gen) { this.i++; this.speak(g); } };
    this.b.mark(c[0], c[1], this.ch); speechSynthesis.speak(u);
  },
  stop() { this.on = false; this.paused = false; this.gen++; if (window.speechSynthesis) speechSynthesis.cancel(); if (this.b && this.b.clear) try { this.b.clear(); } catch (e) { } this.ui(); },
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
    Ink.refresh();
  }
  function cur() {
    const y = wrap.scrollTop + wrap.clientHeight * 0.25; let lo = 0, hi = N - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pages[m].div.offsetTop <= y) lo = m; else hi = m - 1; } return lo;
  }
  function go(p) { page = Math.max(0, Math.min(N - 1, p)); wrap.scrollTop = pages[page].div.offsetTop; }
  let st; wrap.addEventListener("scroll", () => { clearTimeout(st); st = setTimeout(() => { const p = cur(); if (p !== lastSaved) { lastSaved = p; page = p; Reader.save({ type: "pdf", page: p }, (p + 1) / N * 100); } }, 150); }, { passive: true });
  build(); go(page); setTimeout(() => go(page), 300);
  $("rPen").hidden = false; Ink.bind(wrap, R.book.id, () => pages.map((p, i) => ({ el: p.div, page: i })));
  Reader.save({ type: "pdf", page }, (page + 1) / N * 100);
  $("rPrev").onclick = () => go(cur() - 1); $("rNext").onclick = () => go(cur() + 1);
  $("rSlider").oninput = e => { clearTimeout(R.sl); R.sl = setTimeout(() => go(Math.round(e.target.value / 1000 * (N - 1))), 200); };
  $("rToc").onclick = () => sheet("Vai a pagina", `<div class="set"><label>Pagina (1-${N})<input id="pg" type="text" inputmode="numeric" value="${cur() + 1}"></label><div class="btns"><button id="go">Vai</button></div></div>`, b => { b.querySelector("#go").onclick = () => { closeSheet(); go(+b.querySelector("#pg").value - 1); }; });
  $("rAnn").onclick = () => sheet("Evidenziazioni", "<div class='row'>Le evidenziazioni dei PDF non sono ancora disponibili (come sul minipc).</div>");
  $("rSet").onclick = () => sheet("Aspetto", `<div class="set"><label>Larghezza pagina <span id="zv">${Prefs.d.zoom}%</span></label><input id="z" type="range" min="30" max="300" step="5" value="${Prefs.d.zoom}" style="width:100%"><p style="color:var(--mut);font-size:13px">Sopra il 100% scorri lateralmente per vedere tutta la pagina.</p></div>`, b => { b.querySelector("#z").oninput = e => { b.querySelector("#zv").textContent = e.target.value + "%"; }; b.querySelector("#z").onchange = e => { Prefs.set("zoom", +e.target.value); const p = cur(); build(); go(p); }; });
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
  $("rSet").onclick = () => sheet("Aspetto", `<div class="set"><label>Larghezza pagina <span id="zv">${Prefs.d.czoom}%</span></label><input id="cz" type="range" min="30" max="300" step="5" value="${Prefs.d.czoom}" style="width:100%">
    <label>Scorrimento continuo<input type="checkbox" id="mc" ${Prefs.d.cbzcont ? "checked" : ""}></label></div>`, b => {
    b.querySelector("#cz").oninput = e => { b.querySelector("#zv").textContent = e.target.value + "%"; Prefs.set("czoom", +e.target.value); applyW(); };
    b.querySelector("#mc").onchange = () => { closeSheet(); toggleMode(); }; });
  let go, destroy, applyW = () => { };
  if (Prefs.d.cbzcont) {
    const imgs = [], urls = {}; let lastSaved = -1;
    for (let i = 0; i < N; i++) { const im = document.createElement("img"); im._i = i; im.style.cssText = `display:block;width:${Prefs.d.czoom}%;height:auto;min-height:70vh;margin:0 auto;background:#222`; wrap.appendChild(im); imgs.push(im); }
    applyW = () => { const p = cur(); imgs.forEach(im => { im.style.width = Prefs.d.czoom + "%"; if (im.getAttribute("src") || im.complete) im.style.height = "auto"; }); go(p); };
    const io = new IntersectionObserver(es => { for (const e of es) { const im = e.target, i = im._i;
      if (e.isIntersecting) { if (!urls[i]) { urls[i] = url(i); im.onload = () => { im.style.minHeight = "0"; im.style.height = "auto"; }; im.src = urls[i]; } }
      else if (urls[i] && im.complete) { im.style.height = im.clientHeight + "px"; im.style.minHeight = "0"; URL.revokeObjectURL(urls[i]); delete urls[i]; im.removeAttribute("src"); } } }, { root: wrap, rootMargin: "2500px 0px" });
    imgs.forEach(im => io.observe(im));
    $("rPen").hidden = false; Ink.bind(wrap, R.book.id, () => imgs.map((im, i) => ({ el: im, page: i }))); imgs.forEach(im => Ink.ro.observe(im));
    const cur = () => { const y = wrap.scrollTop + wrap.clientHeight * 0.25; let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (imgs[m].offsetTop <= y) lo = m; else hi = m - 1; } return lo; };
    go = p => { page = Math.max(0, Math.min(N - 1, p)); wrap.scrollTop = imgs[page].offsetTop; };
    let st; wrap.addEventListener("scroll", () => { clearTimeout(st); st = setTimeout(() => { const p = cur(); if (p !== lastSaved) { lastSaved = p; page = p; Reader.save({ page: p }, (p + 1) / N * 100); } }, 150); }, { passive: true });
    $("rPrev").onclick = () => go(cur() - 1); $("rNext").onclick = () => go(cur() + 1);
    $("rSlider").oninput = e => { clearTimeout(R.sl); R.sl = setTimeout(() => go(Math.round(e.target.value / 1000 * (N - 1))), 200); };
    setTimeout(() => go(page), 80); setTimeout(() => go(page), 500); Reader.save({ page }, (page + 1) / N * 100);
    destroy = () => { io.disconnect(); Object.values(urls).forEach(u => URL.revokeObjectURL(u)); };
  } else {
    const img = document.createElement("img"); wrap.appendChild(img); let fit = "w", cu = null;
    $("rPen").hidden = false; Ink.bind(wrap, R.book.id, () => [{ el: img, page }]); Ink.ro.observe(img); img.addEventListener("load", () => Ink.refresh());
    const apply = () => { if (fit === "w") { img.style.cssText = `width:${Prefs.d.czoom}%;height:auto;max-width:none;display:block;margin:0 auto`; } else { img.style.cssText = "height:100%;width:auto;max-width:100%"; } };
    applyW = () => apply();
    go = p => { page = Math.max(0, Math.min(N - 1, p)); const old = cu; cu = url(page); img.src = cu; apply(); wrap.scrollTo(0, 0); Ink.refresh(); if (old) setTimeout(() => URL.revokeObjectURL(old), 3000); Reader.save({ page }, (page + 1) / N * 100); };
    let lt = 0; wrap.addEventListener("click", e => {
      if (Ink.on) return;
      const t = Date.now(); if (t - lt < 280) { fit = fit === "w" ? "h" : "w"; apply(); lt = 0; return; } lt = t;
      const x = e.clientX / window.innerWidth; setTimeout(() => { if (lt !== t) return; if (x < .3) go(page - 1); else if (x > .7) go(page + 1); }, 290); });
    let sx = 0; wrap.addEventListener("touchstart", e => { sx = e.changedTouches[0].clientX; }, { passive: true });
    wrap.addEventListener("touchend", e => { if (Ink.on && e.changedTouches[0].touchType === "stylus") return; const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 90 && fit === "h") go(page + (d < 0 ? 1 : -1)); }, { passive: true });
    $("rPrev").onclick = () => go(page - 1); $("rNext").onclick = () => go(page + 1);
    $("rSlider").oninput = e => { clearTimeout(R.sl); R.sl = setTimeout(() => go(Math.round(e.target.value / 1000 * (N - 1))), 150); };
    go(page); destroy = () => { if (cu) URL.revokeObjectURL(cu); };
  }
  return { destroy };
}
TTS.init(); Ink.initUi();

// ===================================================================== tasto Indietro del telefono
// Chrome salta le voci di cronologia aggiunte senza un tocco dell'utente: la voce "sentinella" viene quindi
// (ri)creata anche al primo tocco successivo. Indietro due volte entro 3 secondi = uscita.
(function () {
  let armed = false, last = 0;
  const sentinel = () => { if (armed) return; try { history.pushState({ scr: 1 }, ""); armed = true; } catch (e) { } };
  history.replaceState({ scr: 0 }, ""); sentinel();
  addEventListener("pointerdown", sentinel, true); addEventListener("keydown", sentinel, true);
  const toast = t => {
    const d = document.createElement("div"); d.textContent = t;
    d.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#000d;color:#fff;padding:10px 16px;border-radius:20px;z-index:99;font-size:14px";
    document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
  };
  addEventListener("popstate", () => {
    armed = false;
    if (!$("sheet").hidden) { closeSheet(); return sentinel(); }
    if (!$("selbar").hidden) { $("selbar").hidden = true; return sentinel(); }
    if (!$("ttsbar").hidden && !TTS.on) { $("ttsbar").hidden = true; return sentinel(); }
    if (!$("reader").hidden) { Reader.close(); return sentinel(); }
    const now = Date.now();
    if (now - last < 3000) { try { window.close(); } catch (e) { } return; }   // secondo Indietro: lascia uscire
    last = now; toast("Premi ancora Indietro per uscire"); sentinel();
  });
})();
