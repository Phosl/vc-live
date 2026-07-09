# Vibe Screen Reader MVP

Mini web app locale per macOS: condividi la finestra di VS Code, selezioni un rettangolo sopra la chat Codex e l'app legge ad alta voce solo il testo nuovo utile.

È un MVP: non controlla Codex, non scrive dentro VS Code e non usa microfono. Il pulsante **Avvia live API** usa OpenAI Realtime via WebRTC: manda il riquadro selezionato come immagine e riceve audio live dal modello. La modalità live può leggere il testo nuovo oppure riassumere cosa sta succedendo. **Leggi una volta** resta disponibile come percorso classico Vision + TTS.

## Requisiti

- macOS.
- Node.js 20 o superiore.
- Chrome o Edge consigliato.
- Una API key OpenAI.

## Installazione

Apri il terminale nella cartella del progetto e lancia:

```bash
npm install
```

Crea il file `.env`:

```bash
cp .env.example .env
```

Apri `.env` e inserisci la tua chiave:

```env
OPENAI_API_KEY=sk-proj_la_tua_chiave_qui
```

## Avvio

```bash
npm run dev
```

Apri:

```text
http://127.0.0.1:5173
```

## Uso

1. Apri VS Code e tieni visibile la chat Codex.
2. Nella web app clicca **Condividi schermo / VS Code**.
3. Scegli la finestra di VS Code oppure lo schermo dove si trova VS Code.
4. Clicca **Disegna rettangolo**.
5. Trascina il mouse sopra la sola area della chat da leggere.
6. Premi **Leggi una volta** per testare.
7. Scegli **Modalità live → Lettura** oppure **Riassunto**.
8. Se funziona, premi **Avvia live API**.

La prima lettura può leggere quello che è già visibile. Dopo, l'app prova a leggere solo il testo nuovo.

## Configurazione `.env`

```env
OPENAI_API_KEY=sk-proj_INSERISCI_LA_TUA_CHIAVE_QUI
PORT=3000
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=coral
VITE_READ_INTERVAL_MS=2500
```

La configurazione usa `coral` per una voce femminile naturale. `amber` e' una voce dell'esperienza ChatGPT, ma al momento non risulta tra le voci documentate per questa API. Per Realtime puoi provare anche `marin` o `cedar`, consigliate per qualita.

Se vuoi consumare meno API, aumenta `VITE_READ_INTERVAL_MS` a `4000` o `5000`.

Dopo ogni modifica a `.env`, ferma e riavvia `npm run dev`.

## Privacy e costi

- La API key resta solo nel backend locale, nel file `.env`.
- Non mettere mai `.env` su GitHub.
- Il browser cattura lo schermo solo dopo il tuo consenso.
- L'app invia a OpenAI solo l'immagine ritagliata del rettangolo selezionato.
- Ogni controllo live invia una nuova immagine: più basso è l'intervallo, più aumentano i consumi.

## Problemi comuni

### Il backend dice API key mancante

Controlla che esista `.env`, non solo `.env.example`, e che dentro ci sia la tua chiave. Poi riavvia `npm run dev`.

### Il browser non condivide lo schermo

Usa Chrome o Edge e apri l'app da `http://127.0.0.1:5173`.
Su macOS controlla anche: **Impostazioni di Sistema → Privacy e Sicurezza → Registrazione schermo** e abilita il browser.

### Non senti audio

Clicca una volta nella pagina, poi premi **Leggi una volta**. Se OpenAI TTS fallisce, l'app usa la voce del browser come fallback se la checkbox è attiva.

### Rilegge sempre lo stesso testo

Seleziona un rettangolo più pulito: solo il corpo della chat, senza header, pulsanti o toolbar. Puoi anche aumentare l'intervallo live.

## Limiti dell'MVP

- Non è realtime puro: controlla ogni pochi secondi.
- Non controlla Codex.
- Non manda messaggi a Codex.
- Non usa microfono.
- La qualità dipende dalla leggibilità dello screenshot.

## Struttura

```text
vibe-screen-reader-mvp/
  README.md
  QUICKSTART.md
  package.json
  .env.example
  vite.config.js
  server.js
  index.html
  src/
    main.js
    styles.css
```
