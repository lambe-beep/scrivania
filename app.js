"use strict";
const App = {
  books: [], covers: {}, adapter: null, busy: false,
  device() { let d = localStorage.getItem("device"); if (!d) { d = "tel-" + uid().slice(0, 4); localStorage.setItem("device", d); } return d; },
  getAdapter() {
    const t = localStorage.getItem("test_base");
    if (t) return new HttpAdapter(t);
    return new DriveAdapter(localStorage.getItem("client_id") || CFG.CLIENT_ID, localStorage.getItem("folder") || CFG.FOLDER_NAME);
  },
  async init() {
    await State.load();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
    $("q").oninput = () => this.render();
    $("btnSync").onclick = () => this.sync(true);
    $("btnMenu").onclick = () => this.menu();
    await this.render();
    if (localStorage.getItem("gd_ok") || localStorage.getItem("test_base")) this.sync(false);
    // sincronizzazione periodica (impostabile): solo con l'app in primo piano, per non consumare batteria
    setInterval(() => {
      const m = +(localStorage.getItem("autosync") ?? 30);
      if (!m || document.visibilityState !== "visible" || this.busy || !(localStorage.getItem("gd_ok") || localStorage.getItem("test_base"))) return;
      if (Date.now() - (this.lastSync || 0) >= m * 60000) this.sync(false, true);
    }, 60000);
    document.addEventListener("visibilitychange", () => {
      const m = +(localStorage.getItem("autosync") ?? 30);
      if (m && document.visibilityState === "visible" && !this.busy && Date.now() - (this.lastSync || 0) >= m * 60000 && (localStorage.getItem("gd_ok") || localStorage.getItem("test_base"))) this.sync(false, true);
    });
  },
  async render() {
    this.books = (await DB.all("books")).sort((a, b) => a.title.localeCompare(b.title, "it"));
    for (const u of Object.values(this.covers)) URL.revokeObjectURL(u); this.covers = {};
    const q = $("q").value.toLowerCase().split(/\s+/).filter(Boolean), g = $("grid"); g.innerHTML = "";
    let n = 0;
    for (const b of this.books) {
      if (q.length && !q.every(w => (b.title + " " + b.author).toLowerCase().includes(w))) continue;
      n++; const c = document.createElement("div"); c.className = "card";
      const cov = await DB.get("covers", b.id), p = State.progress(b.id);
      const url = cov ? (this.covers[b.id] = URL.createObjectURL(cov)) : "";
      c.innerHTML = `<div class="cv" style="${url ? `background-image:url(${url})` : ""}">${url ? "" : esc(b.title)}</div><span class="fm">${b.fmt}</span>`
        + `<div class="pg"><i style="width:${p ? Math.min(100, p.pct) : 0}%"></i></div><div class="tt">${esc(b.title)}</div>`;
      c.onclick = () => Reader.open(b); g.appendChild(c);
    }
    $("empty").hidden = this.books.length > 0;
  },
  async sync(interactive, bg) {
    if (this.busy) return; this.busy = true; $("btnSync").disabled = true;
    const msg = m => { $("syncmsg").textContent = m; };
    try {
      const ad = this.getAdapter(); if (bg) ad.noRefresh = true;
      const r = await runSync(ad, this.device(), msg, interactive);
      this.lastSync = Date.now();
      msg(`Sincronizzato ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} — ${r.books} libri, ${r.downloaded} scaricati, ${r.changes} aggiornamenti`);
      await this.render();
    } catch (e) { console.error(e); msg((bg ? "Sincronizzazione automatica non riuscita: " : "Sincronizzazione non riuscita: ") + e.message); }
    this.busy = false; $("btnSync").disabled = false;
  },
  menu() {
    const cid = localStorage.getItem("client_id") || CFG.CLIENT_ID, folder = localStorage.getItem("folder") || CFG.FOLDER_NAME;
    sheet("Impostazioni", `<div class="set"><label>Nome dispositivo<input id="mDev" type="text" value="${esc(this.device())}"></label>
      <label>Cartella su Drive<input id="mFol" type="text" value="${esc(folder)}"></label>
      <label>Sincronizzazione automatica mentre l'app è aperta<select id="mAuto">${[[0, "Mai (solo apertura e chiusura libro)"], [10, "Ogni 10 minuti"], [20, "Ogni 20 minuti"], [30, "Ogni 30 minuti"], [60, "Ogni ora"]].map(([v, l]) => `<option value="${v}" ${v === +(localStorage.getItem("autosync") ?? 30) ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>ID cliente Google<input id="mCid" type="text" value="${esc(cid)}" style="width:55%"></label>
      <div class="btns"><button id="mSave">Salva</button><button id="mOut">Scollega Google</button></div>
      <p style="color:var(--mut);font-size:13px">I libri e le note sono salvati su questo dispositivo: puoi leggere anche offline. La sincronizzazione richiede la connessione.</p></div>`, b => {
      b.querySelector("#mSave").onclick = () => { localStorage.setItem("device", b.querySelector("#mDev").value.trim().replace(/[^\w-]/g, "") || this.device());
        localStorage.setItem("folder", b.querySelector("#mFol").value.trim()); localStorage.setItem("client_id", b.querySelector("#mCid").value.trim()); localStorage.setItem("autosync", b.querySelector("#mAuto").value); closeSheet(); };
      b.querySelector("#mOut").onclick = () => { ["gd_ok","gd_tok","gd_user"].forEach(k => localStorage.removeItem(k)); closeSheet(); };
    });
  },
};
App.init();
