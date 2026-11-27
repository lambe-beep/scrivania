"use strict";
// ---------- Comfort di lettura: cronologia delle posizioni ("Dove ero"), ritorno dopo un salto, barre nascoste con tap al centro,
// pannello luminosita' / filtro luce blu. Si innesta su Reader senza toccarne la logica.
Object.assign(Prefs.d, Object.assign({ imm: false, lumBr: 100, lumCt: 100, lumBlue: false, lumBa: 30 }, JSON.parse(localStorage.getItem("prefs") || "{}")));

const Hist = {
  MAX: 30, JUMP: 8,
  list(book) { return ((State.d.hist || {})[book] || []).slice().sort((a, b) => b.ts.localeCompare(a.ts)); },
  add(book, cp, why) {
    if (!cp || !cp.pos) return;
    const h = State.d.hist = State.d.hist || {}, L = h[book] = h[book] || [];
    const last = L.slice().sort((a, b) => a.ts.localeCompare(b.ts)).pop();
    if (last && Math.abs(last.pct - cp.pct) < 0.3 && why !== "salto") return;
    if (why === "lettura" && last && last.why === "lettura" && Date.now() - Date.parse(last.ts) < 90000) return;
    L.push({ ts: nowIso(), pos: cp.pos, pct: +cp.pct.toFixed(2), lab: cp.lab || "", t: cp.snip || "", why, dev: (typeof App !== "undefined" && App.device) ? App.device() : "" });
    L.sort((a, b) => a.ts.localeCompare(b.ts)); while (L.length > this.MAX) L.shift();
    State.save();
  },
  when(ts) {
    const d = new Date(ts), n = new Date(), hm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === n.toDateString()) return "oggi " + hm;
    const y = new Date(n - 864e5); if (d.toDateString() === y.toDateString()) return "ieri " + hm;
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) + " " + hm;
  },
  WHY: { salto: "prima di un salto", lettura: "lettura", chiusura: "alla chiusura", ritorno: "prima di tornare indietro", manuale: "segnalato da te" },

  // chiamato a ogni aggiornamento della posizione (da Reader.save)
  onSave(R, pos, pct) {
    if (!R) return;
    const now = Date.now(), key = JSON.stringify(pos);
    if (R.cp && R.cp.key === key) return;
    const prev = R.cp;
    if (prev && now - (R.t0 || 0) > 3000 && !R.noJump) {
      const d = Math.abs(pct - prev.pct), marked = R.jmpUntil > now && d > 0.4;
      if (marked || d > this.JUMP) this.jumped(R, prev, { pos, pct }, now);
    }
    R.cp = { pos, pct, key, lab: R.lab ? R.lab(pos) : "", snip: "" }; R.mv = now;
  },
  jumped(R, from, to, now) {
    if (!R.jo || now - R.jo.t > 20000) { R.jo = { cp: from, t: now }; this.add(R.book.id, from, "salto"); }   // origine del salto: si conserva anche se si salta piu' volte di seguito
    R.jo.t = now; R.jo.to = to;
    const t = $("jumpToast"); t.innerHTML = `Saltato dal ${R.jo.cp.pct.toFixed(0)}% al ${to.pct.toFixed(0)}% <button id="jtBack">Torna indietro</button><button id="jtX">✕</button>`;
    t.hidden = false; clearTimeout(this._jt); this._jt = setTimeout(() => { t.hidden = true; }, 12000);
    $("jtX").onclick = () => { t.hidden = true; };
    $("jtBack").onclick = () => { t.hidden = true; this.goto(R, R.jo.cp, to, "ritorno"); };
  },
  goto(R, cp, here, why) {
    if (!R || !R.goPos) return;
    if (here) this.add(R.book.id, { pos: here.pos, pct: here.pct, lab: here.lab || (R.lab ? R.lab(here.pos) : ""), snip: here.snip || "" }, why || "ritorno");
    R.noJump = true; setTimeout(() => { R.noJump = false; }, 2500); R.jo = null;
    R.goPos(cp.pos);
  },
  tick(R) {
    if (!R || !R.cp) return; const now = Date.now();
    if (!R.cp.snip && R.snip && now - R.mv > 1200) { try { R.cp.snip = R.snip(); } catch (e) { } }
    if (!R.cp.saved && now - R.mv > 25000) { R.cp.saved = true; this.add(R.book.id, R.cp, "lettura"); }
  },
  show() {
    const R = Reader.cur; if (!R) return;
    const L = this.list(R.book.id);
    const here = R.cp ? `<div class="row" data-h="-1"><b>Segna questo punto</b><br><small>Salva la posizione attuale (${R.cp.pct.toFixed(0)}%) per ritrovarla</small></div>` : "";
    const rows = L.length ? L.map((h, i) => `<div class="row" data-h="${i}"><b>${h.pct.toFixed(0)}%</b> · ${this.when(h.ts)} · ${esc(h.lab || "")}<br><small>${esc(this.WHY[h.why] || h.why)}${h.dev ? " · " + esc(h.dev) : ""}${h.t ? " — «" + esc(h.t) + "…»" : ""}</small></div>`).join("")
      : "<div class='row'>Ancora nessuna posizione salvata: si salvano da sole mentre leggi, e prima di ogni salto.</div>";
    sheet("Dove ero", here + rows, b => {
      b.onclick = e => {
        const r = e.target.closest(".row"); if (!r || r.dataset.h === undefined) return; const i = +r.dataset.h; closeSheet();
        if (i < 0) { this.add(R.book.id, R.cp, "manuale"); return; }
        const h = L[i]; this.goto(R, h, R.cp, "ritorno");
      };
    });
  },
};

const Comfort = {
  imm() { return !!Prefs.d.imm; },
  setHidden(h) { $("reader").classList.toggle("hid", !!h); if (h) $("lumbar").hidden = true; },
  applyImm() { const on = this.imm(); $("reader").classList.toggle("imm", on); if (!on) $("reader").classList.remove("hid"); },
  toggle() { if (!this.imm()) return; this.setHidden(!$("reader").classList.contains("hid")); },
  // tap al centro dello schermo (x, y relativi 0..1); ritorna true se l'ha usato
  tapAt(x, y) { if (!this.imm() || x < .25 || x > .75 || y < .18 || y > .82) return false; this.toggle(); return true; },
  tap(e, win) { return this.tapAt(e.clientX / win.innerWidth, e.clientY / win.innerHeight); },
  applyLum() {
    const b = +Prefs.d.lumBr, c = +Prefs.d.lumCt;
    $("rBody").style.filter = (b === 100 && c === 100) ? "" : `brightness(${b}%) contrast(${c}%)`;
    const t = $("rTint"); t.hidden = !Prefs.d.lumBlue; t.style.background = `rgba(255,140,30,${(+Prefs.d.lumBa / 100).toFixed(2)})`;
  },
  panel() {
    const p = $("lumbar"); p.hidden = !p.hidden; if (p.hidden) return;
    const set = (id, k, f) => { const el = $(id); el.value = Prefs.d[k]; el.oninput = () => { Prefs.set(k, +el.value); this.applyLum(); }; };
    set("lmBr", "lumBr"); set("lmBa", "lumBa"); set("lmCt", "lumCt");
    p.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { const [id, k, d] = b.dataset.st.split(","), el = $(id); el.value = +el.value + +d; el.oninput(); });
    $("lmBlue").checked = !!Prefs.d.lumBlue; $("lmBlue").onchange = e => { Prefs.set("lumBlue", e.target.checked); this.applyLum(); };
    $("lmImm").checked = this.imm(); $("lmImm").onchange = e => { Prefs.set("imm", e.target.checked); this.applyImm(); };
    $("lmReset").onclick = () => { Prefs.set("lumBr", 100); Prefs.set("lumCt", 100); Prefs.set("lumBlue", false); Prefs.set("lumBa", 30); this.applyLum(); p.hidden = true; this.panel(); };
    $("lmX").onclick = () => { p.hidden = true; };
  },
};

// innesto su Reader
(function () {
  const open = Reader.open, close = Reader.close, save = Reader.save, tick = Reader.tick;
  Reader.open = async function (book) {
    await open.call(this, book); const R = this.cur; if (!R) return;
    R.t0 = Date.now(); Comfort.applyImm(); Comfort.setHidden(Comfort.imm()); Comfort.applyLum(); $("lumbar").hidden = true; $("jumpToast").hidden = true;
    if (Comfort.imm() && !localStorage.getItem("immHint")) { localStorage.setItem("immHint", "1"); const t = $("jumpToast"); t.innerHTML = "Tocca al centro dello schermo per mostrare i pulsanti"; t.hidden = false; setTimeout(() => { t.hidden = true; }, 4000); }
  };
  Reader.save = function (pos, pct) { Hist.onSave(this.cur, pos, pct); return save.call(this, pos, pct); };
  Reader.tick = function () { Hist.tick(this.cur); return tick.call(this); };
  Reader.close = function (silent) { const R = this.cur; if (R && R.cp) Hist.add(R.book.id, R.cp, "chiusura"); $("lumbar").hidden = true; $("jumpToast").hidden = true; $("reader").classList.remove("hid"); return close.call(this, silent); };
  Reader.markJump = function () { const R = this.cur; if (R) R.jmpUntil = Date.now() + 4000; };
  $("rHist").onclick = () => Hist.show();
  $("rLum").onclick = () => Comfort.panel();
  // tap al centro per PDF e fumetti (l'EPUB e' dentro un iframe e lo gestisce reader.js)
  $("rBody").addEventListener("click", e => {
    if (!Reader.cur || (typeof Ink !== "undefined" && Ink.on)) return;
    if (e.target.closest && e.target.closest("iframe")) return;
    Comfort.tapAt(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
  });
})();
