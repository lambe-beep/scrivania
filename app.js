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
  async sync(interactive) {
    if (this.busy) return; this.busy = true; $("btnSync").disabled = true;
    const msg = m => { $("syncmsg").textContent = m; };
    try {
      const r = await runSync(this.getAdapter(), this.device(), msg, interactive);
      msg(`Sincronizzato ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} — ${r.books} libri, ${r.downloaded} scaricati, ${r.changes} aggiornamenti`);
      await this.render();
    } catch (e) { console.error(e); msg("Sincronizzazione non riuscita: " + e.message); }
    this.busy = false; $("btnSync").disabled = false;
  },
  menu() {
    const cid = localStorage.getItem("client_id") || CFG.CLIENT_ID, folder = localStorage.getItem("folder") || CFG.FOLDER_NAME;
    sheet("Impostazioni", `<div class="set"><label>Nome dispositivo<input id="mDev" type="text" value="${esc(this.device())}"></label>
      <label>Cartella su Drive<input id="mFol" type="text" value="${esc(folder)}"></label>
      <label>ID cliente Google<input id="mCid" type="text" value="${esc(cid)}" style="width:55%"></label>
      <div class="btns"><button id="mSave">Salva</button><button id="mOut">Scollega Google</button></div>
      <p style="color:var(--mut);font-size:13px">I libri e le note sono salvati su questo dispositivo: puoi leggere anche offline. La sincronizzazione richiede la connessione.</p></div>`, b => {
      b.querySelector("#mSave").onclick = () => { localStorage.setItem("device", b.querySelector("#mDev").value.trim().replace(/[^\w-]/g, "") || this.device());
        localStorage.setItem("folder", b.querySelector("#mFol").value.trim()); localStorage.setItem("client_id", b.querySelector("#mCid").value.trim()); closeSheet(); };
      b.querySelector("#mOut").onclick = () => { localStorage.removeItem("gd_ok"); closeSheet(); };
    });
  },
};
App.init();
