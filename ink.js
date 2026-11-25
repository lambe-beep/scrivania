"use strict";
// ===================================================================== scrittura a mano con il pennino (PDF e fumetti)
// Ogni tratto: { uid, book, page, k:'p'|'h', c:'#rrggbb', w:spessore (in diecimillesimi della larghezza pagina), pts:[x,y,x,y...] (0..10000), upd }
// Le coordinate sono relative alla pagina (0-1), quindi il tratto resta al suo posto su qualsiasi dispositivo.
const Ink = {
  on: false, wrap: null, book: null, items: () => [], cv: new Map(), cur: null, undo: [], raf: 0,
  prefs: Object.assign({ tool: "p", color: "#111111", w: 3 }, (() => { try { return JSON.parse(localStorage.getItem("inkprefs") || "{}"); } catch (e) { return {}; } })()),
  save() { localStorage.setItem("inkprefs", JSON.stringify(this.prefs)); },

  // collega il livello di scrittura a una vista (wrap scorrevole) con l'elenco delle pagine visibili [{el,page}]
  bind(wrap, book, items) {
    this.unbind(); this.wrap = wrap; this.book = book; this.items = items; this.undo = [];
    this.ro = new ResizeObserver(() => this.refresh()); this.ro.observe(wrap);
    // il pennino non deve far scorrere la pagina; il dito sì
    const stylus = e => { const t = e.touches && e.touches[0]; return t && (t.touchType === "stylus" || (t.radiusX === 0 && t.force > 0 && t.touchType !== "direct")); };
    this._ts = e => { if (this.on && stylus(e)) e.preventDefault(); };
    wrap.addEventListener("touchstart", this._ts, { passive: false }); wrap.addEventListener("touchmove", this._ts, { passive: false });
    this._pd = e => this.down(e); this._pm = e => this.move(e); this._pu = e => this.up(e);
    wrap.addEventListener("pointerdown", this._pd); wrap.addEventListener("pointermove", this._pm);
    wrap.addEventListener("pointerup", this._pu); wrap.addEventListener("pointercancel", this._pu);
    this.refresh();
  },
  unbind() { if (this.ro) this.ro.disconnect(); this.cv.forEach(c => c.remove()); this.cv.clear(); this.wrap = null; this.cur = null; },
  setOn(v) {
    this.on = !!v; $("inkbar").hidden = !this.on; $("rPen").classList.toggle("act", this.on);
    if (this.wrap) this.wrap.style.cursor = this.on ? "crosshair" : "";
  },
  strokes(page) { return State.inkOf(this.book, page); },
  find(x, y) { for (const it of this.items()) { const r = it.el.getBoundingClientRect(); if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { it, r }; } return null; },

  // canvas sovrapposto alla pagina (creato solo se ci sono tratti o si sta scrivendo)
  canvasFor(it) {
    let c = this.cv.get(it.page);
    if (c && c.parentNode !== this.wrap) this.wrap.appendChild(c);
    if (!c) { c = document.createElement("canvas"); c.className = "inkc"; this.wrap.appendChild(c); this.cv.set(it.page, c); }
    const w = it.el.offsetWidth, h = it.el.offsetHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.style.left = it.el.offsetLeft + "px"; c.style.top = it.el.offsetTop + "px"; c.style.width = w + "px"; c.style.height = h + "px";
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    return c;
  },
  refresh() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      if (!this.wrap) return; const seen = new Set();
      for (const it of this.items()) {
        const list = this.strokes(it.page);
        if (!list.length && !(this.cur && this.cur.page === it.page)) continue;
        const c = this.canvasFor(it); seen.add(it.page); this.draw(c, list);
      }
      this.cv.forEach((c, p) => { if (!seen.has(p)) { c.remove(); this.cv.delete(p); } });
    });
  },
  draw(c, list, extra) {
    const g = c.getContext("2d"), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    for (const s of list.concat(extra ? [extra] : [])) this.path(g, s, W, H);
  },
  path(g, s, W, H) {
    const p = s.pts; if (!p || p.length < 2) return;
    g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = s.c; g.globalAlpha = s.k === "h" ? 0.35 : 1;
    g.lineWidth = Math.max(1, s.w / 10000 * W * (s.k === "h" ? 5 : 1)); g.beginPath();
    g.moveTo(p[0] / 10000 * W, p[1] / 10000 * H);
    if (p.length === 2) g.lineTo(p[0] / 10000 * W + 0.1, p[1] / 10000 * H);
    for (let i = 2; i < p.length - 2; i += 2) { const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2; g.quadraticCurveTo(p[i] / 10000 * W, p[i + 1] / 10000 * H, mx / 10000 * W, my / 10000 * H); }
    if (p.length > 2) g.lineTo(p[p.length - 2] / 10000 * W, p[p.length - 1] / 10000 * H);
    g.stroke(); g.restore();
  },

  down(e) {
    if (!this.on || e.pointerType === "touch" || e.button > 0) return;
    const f = this.find(e.clientX, e.clientY); if (!f) return;
    e.preventDefault(); try { this.wrap.setPointerCapture(e.pointerId); } catch (x) { }
    const pt = this.norm(e, f.r);
    if (this.prefs.tool === "e") { this.cur = { erase: true, page: f.it.page, it: f.it, hit: [] }; this.erase(pt); return; }
    this.cur = { uid: uid(), book: this.book, page: f.it.page, k: this.prefs.tool, c: this.prefs.color, w: this.prefs.w * (this.prefs.tool === "h" ? 2 : 1), pts: pt, it: f.it, rect: f.r };
    this.refresh();
  },
  norm(e, r) { return [Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 10000), Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 10000)]; },
  move(e) {
    const s = this.cur; if (!s) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const r = s.it.el.getBoundingClientRect(), pt = this.norm(ev, r);
      if (s.erase) { this.erase(pt); continue; }
      const n = s.pts.length; if (Math.abs(pt[0] - s.pts[n - 2]) + Math.abs(pt[1] - s.pts[n - 1]) < 8) continue; s.pts.push(pt[0], pt[1]);
    }
    if (!s.erase) { const c = this.canvasFor(s.it); this.draw(c, this.strokes(s.page), s); }
  },
  up(e) {
    const s = this.cur; if (!s) return; this.cur = null;
    try { this.wrap.releasePointerCapture(e.pointerId); } catch (x) { }
    if (s.erase) { if (s.hit.length) this.undo.push({ del: s.hit }); this.refresh(); return; }
    if (s.pts.length < 2) return;
    const st = { uid: s.uid, book: s.book, page: s.page, k: s.k, c: s.c, w: s.w, pts: s.pts };
    State.addInk(st); this.undo.push({ add: st.uid }); this.refresh();
  },
  // gomma: elimina i tratti vicini al punto
  erase(pt) {
    const s = this.cur, list = this.strokes(s.page), r = s.it.el.getBoundingClientRect(), thr = 280;
    for (const k of list) {
      if (s.hit.some(h => h.uid === k.uid)) continue; let hit = false;
      for (let i = 0; i < k.pts.length && !hit; i += 2) { const dx = (k.pts[i] - pt[0]) * r.width / 10000, dy = (k.pts[i + 1] - pt[1]) * r.height / 10000; if (Math.hypot(dx, dy) < thr * r.width / 10000 * 1.2 + 6) hit = true; }
      if (hit) { s.hit.push(k); State.delInk(k.uid); }
    }
    if (s.hit.length) { const c = this.canvasFor(s.it); this.draw(c, this.strokes(s.page)); }
  },
  undoLast() {
    const a = this.undo.pop(); if (!a) return;
    if (a.add) State.delInk(a.add); else if (a.del) a.del.forEach(k => State.restoreInk(k));
    this.refresh();
  },
  clearPage() { const it = this.items().find(i => { const r = i.el.getBoundingClientRect(); return r.bottom > innerHeight * 0.3 && r.top < innerHeight * 0.7; }); if (!it) return; const l = this.strokes(it.page); if (!l.length || !confirm("Cancellare tutti i tratti di questa pagina?")) return; l.forEach(k => State.delInk(k.uid)); this.undo.push({ del: l }); this.refresh(); },

  initUi() {
    const bar = $("inkbar"), P = this.prefs;
    const sync = () => { bar.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("act", b.dataset.tool === P.tool)); bar.querySelectorAll("[data-c]").forEach(b => b.classList.toggle("act", b.dataset.c === P.color)); $("inkW").value = P.w; };
    bar.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => { P.tool = b.dataset.tool; if (P.tool === "h" && P.color === "#111111") P.color = "#ffd400"; this.save(); sync(); });
    bar.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { P.color = b.dataset.c; if (P.tool === "e") P.tool = "p"; this.save(); sync(); });
    $("inkW").oninput = e => { P.w = +e.target.value; this.save(); };
    $("inkUndo").onclick = () => this.undoLast(); $("inkClear").onclick = () => this.clearPage(); $("inkX").onclick = () => this.setOn(false);
    $("rPen").onclick = () => this.setOn(!this.on); sync();
  },
};
