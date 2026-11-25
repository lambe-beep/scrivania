# Ebook Scrivania (app per Android) — installazione

L'app è una PWA: si apre da Chrome e si installa come un'app normale (icona, schermo intero, funziona offline).
Sincronizza con il minipc tramite una cartella di Google Drive.

## 1. Sul minipc
1. Installa "Google Drive per desktop" (se non c'è) e crea dentro Il mio Drive una cartella chiamata **EbookScrivania**.
2. Nel programma: menu **Sincronizzazione → Imposta la cartella…** e scegli quella cartella (es. `G:\Il mio Drive\EbookScrivania`).
3. Il programma copia lì i libri della Scrivania (i CBR vengono convertiti in CBZ), le copertine e un file `state/pc.json`
   con avanzamento, note ed evidenziazioni. Si aggiorna da solo all'avvio, ogni 10 minuti e alla chiusura (Ctrl+Maiusc+S per forzare).

## 2. Credenziali Google (una volta sola, gratis)
1. Vai su https://console.cloud.google.com → crea un progetto "Ebook Scrivania".
2. **API e servizi → Libreria** → abilita **Google Drive API**.
3. **Schermata consenso OAuth** → tipo *Esterno*; aggiungi il tuo indirizzo Gmail come utente di prova **oppure** premi "Pubblica app" (resta "non verificata": basta confermare l'avviso la prima volta).
4. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**.
   In *Origini JavaScript autorizzate* metti l'indirizzo dove pubblichi l'app (passo 3, es. `https://TUONOME.github.io`).
5. Copia l'**ID client** (finisce con `.apps.googleusercontent.com`).

## 3. Pubblicare l'app (serve un indirizzo https)
Opzione semplice: GitHub Pages — crea un repository pubblico, carica tutti i file di questa cartella,
Settings → Pages → Branch main. L'indirizzo sarà `https://TUONOME.github.io/NOMEREPO/`.
(Alternative equivalenti: Netlify Drop, Cloudflare Pages.)
Apri `config.js` e scrivi l'ID client in `CLIENT_ID` prima di caricare (oppure inseriscilo dopo dal menu ⋮ dell'app).

## 4. Sul telefono / tablet
1. Apri l'indirizzo in Chrome → menu ⋮ → **Installa app** (o "Aggiungi a schermata Home").
2. Tocca **⟳**: la prima volta Google chiede l'autorizzazione all'accesso a Drive. Poi scarica i libri.
3. Da qui in poi si può leggere anche senza rete. Tocca ⟳ per sincronizzare (note e avanzamento viaggiano in entrambe le direzioni).

## Come funziona la sincronizzazione
- Ogni dispositivo scrive solo il proprio file `state/<nome>.json`; il minipc li unisce al suo database e rimette il risultato in `pc.json`.
- Avanzamento: vince l'ultimo aggiornamento. Evidenziazioni/note: unione; la modifica più recente vince, le cancellazioni si propagano.
- Gli originali sul NAS non vengono mai toccati.

## Funzioni del lettore
EPUB (lettura continua, evidenziazioni a 5 colori, parole chiave violette, note, consultazione Treccani/Traduttore/Wikizionario,
indice, temi chiaro/scuro/seppia, dimensione testo, lettura vocale), PDF (pagine, zoom, lettura vocale), CBZ/CBR (tocco sui lati, doppio tocco per adattare).
Il tempo di lettura viene registrato e arriva nelle statistiche del minipc. Le evidenziazioni dei PDF non esistono ancora (nemmeno sul minipc).
