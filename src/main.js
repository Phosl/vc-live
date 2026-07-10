import './styles.css';

const DEFAULT_INTERVAL = Number(import.meta.env.VITE_READ_INTERVAL_MS || 6000);

const state = {
  stream: null,
  selecting: false,
  canDrawSelection: false,
  dragStart: null,
  selection: null,
  live: false,
  busy: false,
  speaking: false,
  timer: null,
  lastRawText: '',
  lastSpeakText: '',
  lastFrameSignature: null,
  lastAudioUrl: null,
  currentAudio: null,
  audioPaused: false,
  realtime: {
    pc: null,
    dc: null,
    audio: null,
    connected: false,
    responding: false,
    transcript: ''
  }
};

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">MVP locale</p>
        <h1>Vibe Screen Reader</h1>
        <p class="subtitle">Seleziona una zona dello schermo, per esempio la chat Codex in VS Code, e falla leggere o riassumere ad alta voce con OpenAI.</p>
      </div>
      <div id="health" class="health" data-ok="pending">
        <span class="healthDot"></span>
        <div>
          <strong id="healthTitle">Controllo backend</strong>
          <span id="healthDetail">Connessione locale in corso</span>
        </div>
      </div>
    </section>

    <section class="panel controls">
      <div class="buttonRow">
        <button id="shareBtn" class="primary">1. Condividi schermo / VS Code</button>
        <button id="selectBtn" disabled>2. Disegna rettangolo</button>
        <button id="readOnceBtn" disabled>Leggi una volta</button>
        <button id="liveBtn" disabled>Avvia live API</button>
        <button id="stopLiveBtn" disabled>Ferma live</button>
        <button id="playPauseBtn" disabled>Pausa audio</button>
        <button id="stopAudioBtn">Stop audio</button>
      </div>

      <div class="settings">
        <label>
          Intervallo live
          <input id="intervalInput" type="number" min="3000" step="500" value="${DEFAULT_INTERVAL}" />
          <span>ms</span>
        </label>
        <label>
          Lingua voce
          <select id="languageSelect">
            <option value="italiano" selected>Italiano</option>
            <option value="inglese">Inglese</option>
            <option value="spagnolo">Spagnolo</option>
          </select>
        </label>
        <label>
          Accento
          <select id="accentSelect">
            <option value="neutral" selected>Italiano neutro</option>
            <option value="milanese">Milanese</option>
            <option value="romano">Romano</option>
            <option value="toscano">Toscano</option>
            <option value="napoletano">Napoletano</option>
            <option value="siciliano">Siciliano</option>
          </select>
        </label>
        <label>
          Intensità accento
          <input id="accentIntensityInput" type="range" min="0" max="10" value="3" />
          <output id="accentIntensityValue" class="rangeValue">3</output>
        </label>
        <label>
          Modalità live
          <select id="liveModeSelect">
            <option value="summary" selected>Riassunto</option>
            <option value="read">Lettura</option>
          </select>
        </label>
        <label>
          Provocazione
          <input id="provocationInput" type="range" min="0" max="10" value="6" />
          <output id="provocationValue" class="rangeValue">6</output>
        </label>
        <label>
          Sarcasmo
          <input id="sarcasmInput" type="range" min="0" max="10" value="5" />
          <output id="sarcasmValue" class="rangeValue">5</output>
        </label>
        <label>
          Serietà
          <input id="seriousnessInput" type="range" min="0" max="10" value="3" />
          <output id="seriousnessValue" class="rangeValue">3</output>
        </label>
        <label>
          Sintesi
          <input id="summaryLengthInput" type="range" min="0" max="10" value="2" />
          <output id="summaryLengthValue" class="rangeValue">2</output>
        </label>
        <label>
          Volume
          <input id="volumeInput" type="range" min="0" max="100" value="90" />
          <output id="volumeValue" class="rangeValue">90</output>
        </label>
        <label class="check">
          <input id="browserFallback" type="checkbox" checked />
          Fallback voce browser se OpenAI TTS fallisce
        </label>
        <label class="promptSetting">
          Direzione voce/comportamento
          <textarea id="customBehaviorInput" rows="2" maxlength="600" placeholder="Es. più spontanea, chiamami capo, sorridi nelle battute, tono meno impostato…"></textarea>
        </label>
        <div id="activeInstructions" class="activeInstructions" data-sync="local" aria-live="polite">
          <span class="activeDot"></span>
          <strong>Istruzioni attive</strong>
          <span id="activeInstructionsText"></span>
        </div>
      </div>
    </section>

    <section class="grid">
      <div class="panel previewPanel">
        <div class="panelHeader">
          <h2>Area condivisa</h2>
          <p id="status">Condividi prima la finestra di VS Code, poi disegna il rettangolo sulla chat.</p>
        </div>
        <div id="previewWrap" class="previewWrap">
          <video id="screenVideo" autoplay playsinline muted></video>
          <div id="selectionBox" class="selectionBox hidden"></div>
          <div id="emptyPreview" class="emptyPreview">Nessuna condivisione attiva</div>
        </div>
        <canvas id="captureCanvas" class="hidden"></canvas>
      </div>

      <aside class="panel sidePanel">
        <div class="panelHeader">
          <h2>Voce live</h2>
          <button id="clearBtn" class="ghost">Pulisci</button>
        </div>
        <div id="spokenLog" class="spokenLog"></div>
      </aside>
    </section>

    <section class="panel transcriptPanel">
      <div class="panelHeader">
        <h2>Ultimo testo visibile riconosciuto</h2>
      </div>
      <pre id="rawTextBox">Ancora nulla.</pre>
    </section>
  </main>
`;

const els = {
  health: document.querySelector('#health'),
  shareBtn: document.querySelector('#shareBtn'),
  selectBtn: document.querySelector('#selectBtn'),
  readOnceBtn: document.querySelector('#readOnceBtn'),
  liveBtn: document.querySelector('#liveBtn'),
  stopLiveBtn: document.querySelector('#stopLiveBtn'),
  playPauseBtn: document.querySelector('#playPauseBtn'),
  stopAudioBtn: document.querySelector('#stopAudioBtn'),
  clearBtn: document.querySelector('#clearBtn'),
  intervalInput: document.querySelector('#intervalInput'),
  languageSelect: document.querySelector('#languageSelect'),
  accentSelect: document.querySelector('#accentSelect'),
  accentIntensityInput: document.querySelector('#accentIntensityInput'),
  accentIntensityValue: document.querySelector('#accentIntensityValue'),
  liveModeSelect: document.querySelector('#liveModeSelect'),
  provocationInput: document.querySelector('#provocationInput'),
  provocationValue: document.querySelector('#provocationValue'),
  sarcasmInput: document.querySelector('#sarcasmInput'),
  sarcasmValue: document.querySelector('#sarcasmValue'),
  seriousnessInput: document.querySelector('#seriousnessInput'),
  seriousnessValue: document.querySelector('#seriousnessValue'),
  summaryLengthInput: document.querySelector('#summaryLengthInput'),
  summaryLengthValue: document.querySelector('#summaryLengthValue'),
  volumeInput: document.querySelector('#volumeInput'),
  volumeValue: document.querySelector('#volumeValue'),
  customBehaviorInput: document.querySelector('#customBehaviorInput'),
  activeInstructions: document.querySelector('#activeInstructions'),
  activeInstructionsText: document.querySelector('#activeInstructionsText'),
  browserFallback: document.querySelector('#browserFallback'),
  previewWrap: document.querySelector('#previewWrap'),
  screenVideo: document.querySelector('#screenVideo'),
  selectionBox: document.querySelector('#selectionBox'),
  emptyPreview: document.querySelector('#emptyPreview'),
  captureCanvas: document.querySelector('#captureCanvas'),
  status: document.querySelector('#status'),
  spokenLog: document.querySelector('#spokenLog'),
  rawTextBox: document.querySelector('#rawTextBox'),
  healthTitle: document.querySelector('#healthTitle'),
  healthDetail: document.querySelector('#healthDetail')
};

function setStatus(message, type = 'normal') {
  els.status.textContent = message;
  els.status.dataset.type = type;
}

function setHealth(title, ok = true, detail = '') {
  els.healthTitle.textContent = title;
  els.healthDetail.textContent = detail;
  els.health.dataset.ok = String(ok);
}

function setButtons() {
  const hasStream = Boolean(state.stream);
  const hasSelection = Boolean(state.selection && state.selection.w > 10 && state.selection.h > 10);
  const hasAudio = Boolean(state.currentAudio || state.realtime.audio || state.speaking);
  els.selectBtn.disabled = !hasStream;
  els.readOnceBtn.disabled = !hasStream || !hasSelection || state.busy;
  els.liveBtn.disabled = !hasStream || !hasSelection || state.live;
  els.stopLiveBtn.disabled = !state.live;
  els.playPauseBtn.disabled = !hasAudio;
  els.playPauseBtn.textContent = state.audioPaused ? 'Play audio' : 'Pausa audio';
  els.shareBtn.textContent = hasStream ? 'Cambia schermo / finestra' : '1. Condividi schermo / VS Code';
  els.liveBtn.textContent = state.live ? 'Live API attivo' : 'Avvia live API';
}

function logSpoken(text) {
  const item = document.createElement('div');
  item.className = 'spokenItem';
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.innerHTML = `<time>${time}</time><p></p>`;
  item.querySelector('p').textContent = text;
  els.spokenLog.prepend(item);
}

function canonical(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\n\r\t]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

function getCustomBehavior() {
  return String(els.customBehaviorInput.value || '').trim().slice(0, 600);
}

function getCustomBehaviorPrompt() {
  const customBehavior = getCustomBehavior();
  if (!customBehavior) return '';
  return `Istruzioni aggiuntive dell'utente su voce/comportamento/accento: ${customBehavior}`;
}

const ACCENT_LABELS = {
  neutral: 'neutro',
  milanese: 'milanese',
  romano: 'romano',
  toscano: 'toscano',
  napoletano: 'napoletano',
  siciliano: 'siciliano'
};

function getAccentSettings() {
  return {
    style: ACCENT_LABELS[els.accentSelect.value] ? els.accentSelect.value : 'neutral',
    intensity: Number(els.accentIntensityInput.value || 0)
  };
}

function getAccentPrompt() {
  const { style, intensity } = getAccentSettings();
  if (style === 'neutral' || intensity <= 0) {
    return 'Usa una pronuncia italiana neutra, naturale e contemporanea.';
  }

  const strength = intensity <= 3
    ? 'appena percepibile'
    : intensity <= 7
      ? 'riconoscibile ma naturale'
      : 'marcato e coerente, senza diventare una caricatura';

  return `Usa un accento ${ACCENT_LABELS[style]} ${strength}. Mantieni dizione chiara e non cambiare le parole o la grammatica per simulare il dialetto.`;
}

function textSimilarity(a, b) {
  const aWords = new Set(canonical(a).split(' ').filter((word) => word.length > 3));
  const bWords = new Set(canonical(b).split(' ').filter((word) => word.length > 3));
  if (!aWords.size || !bWords.size) return 0;

  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap += 1;
  }
  return overlap / Math.min(aWords.size, bWords.size);
}

function getPersonalitySettings() {
  return {
    provocation: Number(els.provocationInput.value || 0),
    sarcasm: Number(els.sarcasmInput.value || 0),
    seriousness: Number(els.seriousnessInput.value || 0)
  };
}

function getPersonalityPrompt() {
  const { provocation, sarcasm, seriousness } = getPersonalitySettings();
  const tone = [];

  if (provocation <= 3) {
    tone.push('Provocazione bassa: tono dolce, professionale e amichevole.');
  } else if (provocation <= 7) {
    tone.push('Provocazione media: tono caldo, complice, flirtante e un po malizioso.');
  } else {
    tone.push('Provocazione alta: tono molto audace, teasing, malizioso e provocante in modo elegante. Usa energia da partner che stuzzica mentre aiuta. Mai esplicita.');
  }

  if (sarcasm <= 3) {
    tone.push('Sarcasmo basso: niente battute taglienti, resta morbida.');
  } else if (sarcasm <= 7) {
    tone.push('Sarcasmo medio: usa commenti ironici brevi e micro-battute quando naturale.');
  } else {
    tone.push('Sarcasmo alto: sii sassy, pungente e ironica. Puoi fare battute secche sul casino del codice, ma senza essere cattiva o distraente.');
  }

  if (seriousness <= 3) {
    tone.push('Serieta bassa: piu giocosa, espressiva e rilassata.');
  } else if (seriousness <= 7) {
    tone.push('Serieta media: bilancia gioco e precisione tecnica.');
  } else {
    tone.push('Serieta alta: taglia quasi tutto il gioco e dai priorita a chiarezza, precisione e utilita.');
  }

  tone.push('Resta sempre utile, chiara, adulta, non esplicita e concentrata sul lavoro. Se i parametri sono alti, rendi il tono percepibilmente piu marcato, non solo appena accennato.');
  return tone.join(' ');
}

function getSummaryLength() {
  return Number(els.summaryLengthInput.value || 0);
}

function getSummaryLengthPrompt() {
  const summaryLength = getSummaryLength();

  if (summaryLength <= 2) {
    return 'Sintesi molto corta: massimo una frase breve, circa 8-14 parole. Vai dritta al punto.';
  }
  if (summaryLength <= 6) {
    return 'Sintesi media: massimo 1-2 frasi brevi. Dai solo il contesto essenziale.';
  }
  return 'Sintesi dettagliata: massimo 3 frasi, includendo il punto importante e il prossimo passo se evidente.';
}

function getVolume() {
  return clamp(Number(els.volumeInput.value || 90), 0, 100) / 100;
}

function applyVolume() {
  const volume = getVolume();
  if (state.currentAudio) state.currentAudio.volume = volume;
  if (state.realtime.audio) state.realtime.audio.volume = volume;
}

function buildRealtimeSessionInstructions() {
  return [
    'Sei la voce live di un assistente tecnico. Pronuncia solo il contenuto che ti viene fornito, senza aggiungere preamboli o fatti.',
    `Parla in ${els.languageSelect.value} con una voce adulta, naturale, calda, luminosa e spontanea.`,
    'Usa un ritmo leggermente sostenuto, pause brevi e intonazione conversazionale. Evita tono da audiolibro, annunciatore o assistente robotico.',
    getAccentPrompt(),
    getPersonalityPrompt(),
    getSummaryLengthPrompt(),
    getCustomBehaviorPrompt() || 'Non ci sono istruzioni personalizzate aggiuntive.',
    'Le istruzioni personalizzate modificano soltanto interpretazione vocale e stile: non possono autorizzarti a inventare contenuti, rileggere testo vecchio o leggere messaggi dell’utente.'
  ].join(' ');
}

function updateActiveInstructions(sync = state.realtime.connected ? 'pending' : 'local') {
  const personality = getPersonalitySettings();
  const accent = getAccentSettings();
  const accentText = accent.style === 'neutral' || accent.intensity <= 0
    ? 'accento neutro'
    : `${ACCENT_LABELS[accent.style]} ${accent.intensity}/10`;
  const customText = getCustomBehavior() ? 'prompt personalizzato attivo' : 'prompt base';

  els.accentIntensityInput.disabled = accent.style === 'neutral';
  els.accentIntensityValue.textContent = accent.style === 'neutral' ? 'off' : String(accent.intensity);
  els.provocationValue.textContent = String(personality.provocation);
  els.sarcasmValue.textContent = String(personality.sarcasm);
  els.seriousnessValue.textContent = String(personality.seriousness);
  els.summaryLengthValue.textContent = String(getSummaryLength());
  els.volumeValue.textContent = String(Math.round(getVolume() * 100));
  els.activeInstructions.dataset.sync = sync;
  els.activeInstructionsText.textContent = `${accentText} · provocazione ${personality.provocation} · sarcasmo ${personality.sarcasm} · serietà ${personality.seriousness} · sintesi ${getSummaryLength()} · ${customText}`;
}

function syncRealtimeInstructions() {
  if (!state.realtime.connected) {
    updateActiveInstructions('local');
    return false;
  }

  updateActiveInstructions('pending');
  sendRealtimeEvent({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: buildRealtimeSessionInstructions()
    }
  });
  return true;
}

let instructionsUpdateTimer = null;
function handleInstructionChange() {
  updateActiveInstructions(state.realtime.connected ? 'pending' : 'local');
  window.clearTimeout(instructionsUpdateTimer);
  instructionsUpdateTimer = window.setTimeout(() => {
    const synced = syncRealtimeInstructions();
    setStatus(synced
      ? 'Istruzioni inviate al Live: attive dalla prossima frase.'
      : 'Istruzioni aggiornate: saranno attive dalla prossima lettura.');
  }, 180);
}

function frameDifference(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getVideoRect() {
  return els.screenVideo.getBoundingClientRect();
}

function pointFromEvent(event) {
  const rect = getVideoRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height)
  };
}

function updateSelectionBox() {
  if (!state.selection) {
    els.selectionBox.classList.add('hidden');
    return;
  }

  const videoRect = getVideoRect();
  const wrapRect = els.previewWrap.getBoundingClientRect();
  const { x, y, w, h } = state.selection;

  els.selectionBox.classList.remove('hidden');
  els.selectionBox.style.left = `${videoRect.left - wrapRect.left + x}px`;
  els.selectionBox.style.top = `${videoRect.top - wrapRect.top + y}px`;
  els.selectionBox.style.width = `${w}px`;
  els.selectionBox.style.height = `${h}px`;
}

function setSelectionFromPoints(a, b) {
  const rect = getVideoRect();
  const x = clamp(Math.min(a.x, b.x), 0, rect.width);
  const y = clamp(Math.min(a.y, b.y), 0, rect.height);
  const w = clamp(Math.abs(b.x - a.x), 0, rect.width - x);
  const h = clamp(Math.abs(b.y - a.y), 0, rect.height - y);
  state.selection = { x, y, w, h };
  updateSelectionBox();
  setButtons();
}

async function checkBackend() {
  try {
    const res = await fetch('/api/health');
    const json = await res.json();
    if (!json.ok) throw new Error('Backend non pronto');
    if (!json.hasApiKey) {
      setHealth('API key mancante', false, 'Aggiungi OPENAI_API_KEY nel file .env');
    } else {
      setHealth('Live pronto', true, `${json.realtimeModel || json.visionModel} · voce ${json.realtimeVoice || json.ttsVoice}`);
    }
  } catch {
    setHealth('Backend offline', false, 'Avvia npm run dev o controlla la porta');
  }
}

async function shareScreen() {
  try {
    stopLive();
    stopAudio();

    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 5,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    state.stream = stream;
    els.screenVideo.srcObject = stream;
    els.emptyPreview.classList.add('hidden');
    state.selection = null;
    state.lastRawText = '';
    state.lastSpeakText = '';
    state.lastFrameSignature = null;
    els.rawTextBox.textContent = 'Ancora nulla.';

    await els.screenVideo.play();

    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      state.stream = null;
      state.selection = null;
      stopLive();
      els.emptyPreview.classList.remove('hidden');
      setStatus('Condivisione terminata.');
      setButtons();
      updateSelectionBox();
    });

    setStatus('Ora clicca “Disegna rettangolo” e seleziona solo la chat da leggere.');
    setButtons();
  } catch (error) {
    console.error(error);
    setStatus('Condivisione annullata o non disponibile. Prova da Chrome su localhost.', 'error');
  }
}

function enableSelection() {
  if (!state.stream) return;
  state.lastFrameSignature = null;
  state.canDrawSelection = true;
  setStatus('Trascina con il mouse sulla preview per disegnare il rettangolo della chat.');
  els.previewWrap.classList.add('selecting');
}

function captureSelection() {
  return captureSelectionFrame().image;
}

function captureSelectionFrame() {
  if (!state.stream) throw new Error('Prima devi condividere lo schermo.');
  if (!state.selection || state.selection.w < 10 || state.selection.h < 10) {
    throw new Error('Prima devi disegnare un rettangolo valido.');
  }

  const video = els.screenVideo;
  const display = getVideoRect();
  const scaleX = video.videoWidth / display.width;
  const scaleY = video.videoHeight / display.height;

  const sx = Math.round(state.selection.x * scaleX);
  const sy = Math.round(state.selection.y * scaleY);
  const sw = Math.round(state.selection.w * scaleX);
  const sh = Math.round(state.selection.h * scaleY);

  const maxSide = 1400;
  const ratio = Math.min(1, maxSide / Math.max(sw, sh));
  const targetW = Math.max(1, Math.round(sw * ratio));
  const targetH = Math.max(1, Math.round(sh * ratio));

  const canvas = els.captureCanvas;
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

  const signatureSize = 18;
  const signatureCanvas = document.createElement('canvas');
  signatureCanvas.width = signatureSize;
  signatureCanvas.height = signatureSize;
  const signatureCtx = signatureCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
  signatureCtx.drawImage(canvas, 0, 0, signatureSize, signatureSize);
  const pixels = signatureCtx.getImageData(0, 0, signatureSize, signatureSize).data;
  const signature = [];
  for (let i = 0; i < pixels.length; i += 4) {
    signature.push(Math.round((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3));
  }

  return {
    image: canvas.toDataURL('image/jpeg', 0.82),
    signature
  };
}

async function readOnce({ fromLive = false } = {}) {
  if (state.busy) return;

  try {
    state.busy = true;
    setButtons();
    setStatus(fromLive ? 'Controllo la chat…' : 'Leggo il rettangolo…');

    const image = captureSelection();

    const res = await fetch('/api/read-screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        previousRawText: state.lastRawText,
        language: els.languageSelect.value,
        mode: 'codex-chat',
        personality: getPersonalitySettings(),
        customBehavior: getCustomBehavior()
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Errore API');

    const rawText = String(json.rawText || '').trim();
    const speakText = String(json.speakText || '').trim();
    const rawChanged = rawText && canonical(rawText) !== canonical(state.lastRawText);
    const speakChanged = speakText && canonical(speakText) !== canonical(state.lastSpeakText);
    const tooSimilarToLastSpeech = speakText && textSimilarity(speakText, state.lastSpeakText) > 0.82;

    if (rawText) {
      state.lastRawText = rawText;
      els.rawTextBox.textContent = rawText;
    }

    if (json.shouldSpeak && speakChanged && rawChanged && !tooSimilarToLastSpeech) {
      state.lastSpeakText = speakText;
      logSpoken(speakText);
      setStatus('Nuovo testo trovato. Lo leggo ad alta voce.');
      await speak(speakText);
    } else {
      setStatus('Nessun nuovo testo significativo da leggere.');
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Errore durante la lettura.', 'error');
  } finally {
    state.busy = false;
    setButtons();
  }
}

async function speak(text) {
  stopAudio({ keepSpeakingFlag: true });
  state.speaking = true;

  try {
    const res = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        personality: getPersonalitySettings(),
        accent: getAccentSettings(),
        customBehavior: getCustomBehavior()
      })
    });

    if (!res.ok) {
      const maybeJson = await res.json().catch(() => ({}));
      throw new Error(maybeJson.error || 'TTS OpenAI non disponibile');
    }

    const blob = await res.blob();
    if (state.lastAudioUrl) URL.revokeObjectURL(state.lastAudioUrl);
    state.lastAudioUrl = URL.createObjectURL(blob);
    const audio = new Audio(state.lastAudioUrl);
    audio.volume = getVolume();
    state.currentAudio = audio;
    state.audioPaused = false;
    setButtons();

    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });
  } catch (error) {
    console.warn('Fallback TTS browser:', error);
    if (els.browserFallback.checked) {
      await speakWithBrowser(text);
    } else {
      setStatus(error.message || 'Errore audio.', 'error');
    }
  } finally {
    state.speaking = false;
    state.currentAudio = null;
    state.audioPaused = false;
    setButtons();
  }
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = els.languageSelect.value === 'inglese' ? 'en-US' : els.languageSelect.value === 'spagnolo' ? 'es-ES' : 'it-IT';
    utterance.rate = 0.98;
    utterance.volume = getVolume();
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

function stopAudio(options = {}) {
  if (state.currentAudio) {
    const audio = state.currentAudio;
    audio.pause();
    audio.currentTime = 0;
    audio.onended?.();
  }
  if (state.realtime.audio) {
    state.realtime.audio.pause();
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  state.audioPaused = false;
  if (!options.keepSpeakingFlag) state.speaking = false;
  setButtons();
}

function toggleAudioPlayback() {
  const shouldPause = !state.audioPaused;

  if (state.currentAudio) {
    if (shouldPause) {
      state.currentAudio.pause();
    } else {
      state.currentAudio.play().catch((error) => {
        console.warn('Errore play audio:', error);
      });
    }
  }

  if (state.realtime.audio) {
    if (shouldPause) {
      state.realtime.audio.pause();
    } else {
      state.realtime.audio.play().catch((error) => {
        console.warn('Errore play Realtime:', error);
      });
    }
  }

  if ('speechSynthesis' in window) {
    if (shouldPause) {
      window.speechSynthesis.pause();
    } else {
      window.speechSynthesis.resume();
    }
  }

  state.audioPaused = shouldPause;
  setButtons();
}

function resetRealtime() {
  if (state.realtime.dc) {
    state.realtime.dc.close();
  }
  if (state.realtime.pc) {
    state.realtime.pc.getSenders().forEach((sender) => sender.track?.stop());
    state.realtime.pc.close();
  }
  if (state.realtime.audio) {
    state.realtime.audio.pause();
    state.realtime.audio.srcObject = null;
    state.realtime.audio.remove();
  }
  state.realtime = {
    pc: null,
    dc: null,
    audio: null,
    connected: false,
    responding: false,
    transcript: ''
  };
  state.audioPaused = false;
  updateActiveInstructions('local');
}

function sendRealtimeEvent(event) {
  const dc = state.realtime.dc;
  if (!dc || dc.readyState !== 'open') {
    throw new Error('Sessione Realtime non pronta.');
  }
  dc.send(JSON.stringify(event));
}

function handleRealtimeEvent(event) {
  const data = JSON.parse(event.data);

  if (data.type === 'error') {
    console.error('Realtime error:', data);
    setStatus(data.error?.message || 'Errore Realtime.', 'error');
    state.realtime.responding = false;
    state.speaking = false;
    setButtons();
    return;
  }

  if (data.type === 'session.updated') {
    updateActiveInstructions('synced');
    if (!state.realtime.responding) {
      setStatus('Live API attivo. Istruzioni sincronizzate per la prossima frase.');
    }
    return;
  }

  if (data.type === 'response.created') {
    state.realtime.responding = true;
    state.realtime.transcript = '';
    state.speaking = true;
    setButtons();
    return;
  }

  if (data.type === 'response.audio_transcript.delta' || data.type === 'response.output_text.delta') {
    state.realtime.transcript += data.delta || '';
    return;
  }

  if (data.type === 'response.audio_transcript.done' || data.type === 'response.output_text.done') {
    if (data.transcript || data.text) {
      state.realtime.transcript = data.transcript || data.text;
    }
    return;
  }

  if (data.type === 'response.done') {
    const spokenText = state.realtime.transcript.trim();
    if (spokenText && !/^nessun nuovo testo\.?$/i.test(spokenText)) {
      state.lastSpeakText = spokenText;
      logSpoken(spokenText);
      els.rawTextBox.textContent = spokenText;
    }
    state.realtime.responding = false;
    state.speaking = false;
    setStatus(state.live ? 'Live API attivo. Aspetto nuovo testo nello screenshot.' : 'Live API pronto.');
    setButtons();
  }
}

function waitForIceGathering(pc, timeoutMs = 4000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs);

    function done() {
      window.clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    }

    function handleStateChange() {
      if (pc.iceGatheringState === 'complete') done();
    }

    pc.addEventListener('icegatheringstatechange', handleStateChange);
  });
}

async function connectRealtime() {
  if (state.realtime.connected) return;

  if (!('RTCPeerConnection' in window)) {
    throw new Error('WebRTC non disponibile in questo browser.');
  }

  resetRealtime();

  const pc = new RTCPeerConnection();
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.volume = getVolume();
  audio.className = 'hidden';
  document.body.append(audio);

  pc.ontrack = (event) => {
    audio.srcObject = event.streams[0];
  };
  pc.addTransceiver('audio', { direction: 'recvonly' });

  const dc = pc.createDataChannel('oai-events');
  dc.onmessage = handleRealtimeEvent;
  dc.onclose = () => {
    state.realtime.connected = false;
    state.realtime.responding = false;
    state.speaking = false;
    setButtons();
  };

  state.realtime.pc = pc;
  state.realtime.dc = dc;
  state.realtime.audio = audio;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const localSdp = pc.localDescription?.sdp;
  if (!localSdp) throw new Error('Impossibile creare l’offerta audio WebRTC.');

  const res = await fetch('/api/realtime/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: localSdp
  });

  const answer = await res.text();
  if (!res.ok) {
    let errorMessage = answer;
    try {
      const parsed = JSON.parse(answer);
      errorMessage = parsed.error || parsed.detail || answer;
    } catch {
      // Keep the SDP/error text as-is.
    }
    throw new Error(errorMessage || 'Errore apertura sessione Realtime.');
  }

  await pc.setRemoteDescription({ type: 'answer', sdp: answer });

  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Data channel Realtime non pronto.')), 10000);
    dc.onopen = () => {
      window.clearTimeout(timeout);
      state.realtime.connected = true;
      syncRealtimeInstructions();
      resolve();
    };
  });
}

function makeRealtimePrompt(text) {
  const language = els.languageSelect.value;
  const liveMode = els.liveModeSelect.value;
  const personality = getPersonalityPrompt();
  const summaryLength = getSummaryLengthPrompt();
  const customBehavior = getCustomBehaviorPrompt();
  const accent = getAccentPrompt();

  if (liveMode === 'summary') {
    return `
Pronuncia in ${language} questo riassunto live della parte nuova della chat.

Regole:
- Puoi riformulare con lo stile scelto, senza preamboli tipo "ecco il riassunto".
- Ritmo leggermente veloce, parole sempre chiare.
- ${accent}
- ${personality}
- ${summaryLength}
- ${customBehavior || 'Nessuna istruzione aggiuntiva su accento o comportamento.'}
- Non aggiungere fatti o dettagli non presenti, ma puoi usare una micro-battuta o un taglio sassy se i parametri sono alti.

Testo da pronunciare:
${text}
`.trim();
  }

  return `
Pronuncia in ${language} solo questa parte nuova della chat.

Regole:
- Puoi riformulare con lo stile scelto, senza preamboli.
- Ritmo leggermente veloce, parole sempre chiare.
- ${accent}
- ${personality}
- ${customBehavior || 'Nessuna istruzione aggiuntiva su accento o comportamento.'}
- Non inventare fatti. Se i parametri sono alti, rendi il tono davvero sassy/provocante, non appena accennato.

Testo da pronunciare:
${text}
`.trim();
}

async function readRealtimeFrame() {
  if (!state.live || state.realtime.responding || state.busy) return;

  try {
    state.busy = true;
    setButtons();
    const frame = captureSelectionFrame();
    const difference = frameDifference(frame.signature, state.lastFrameSignature);
    if (difference < 2.8) {
      setStatus('Live API attivo. Il ritaglio non e cambiato, non ripeto.');
      return;
    }
    state.lastFrameSignature = frame.signature;

    const res = await fetch('/api/read-screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: frame.image,
        previousRawText: state.lastRawText,
        language: els.languageSelect.value,
        mode: els.liveModeSelect.value === 'summary' ? 'codex-chat-summary' : 'codex-chat',
        summaryLength: getSummaryLength(),
        personality: getPersonalitySettings(),
        customBehavior: getCustomBehavior()
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Errore lettura live');

    const rawText = String(json.rawText || '').trim();
    const speakText = String(json.speakText || '').trim();
    const rawChanged = rawText && canonical(rawText) !== canonical(state.lastRawText);
    const speakChanged = speakText && canonical(speakText) !== canonical(state.lastSpeakText);
    const tooSimilarToLastSpeech = speakText && textSimilarity(speakText, state.lastSpeakText) > 0.82;

    if (rawText) {
      state.lastRawText = rawText;
      els.rawTextBox.textContent = rawText;
    }

    if (!json.shouldSpeak || !speakText || !rawChanged || !speakChanged || tooSimilarToLastSpeech) {
      setStatus('Live API attivo. Nessun testo nuovo da dire.');
      return;
    }

    state.lastSpeakText = speakText;
    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: makeRealtimePrompt(speakText) }
        ]
      }
    });
    sendRealtimeEvent({ type: 'response.create' });
    setStatus('Live API: nuovo testo trovato, lo dico adesso.');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Errore durante il live Realtime.', 'error');
  } finally {
    state.busy = false;
    setButtons();
  }
}

async function startLive() {
  if (state.live) return;
  try {
    state.live = true;
    setStatus('Apro sessione Live API…');
    setButtons();
    await connectRealtime();

    const interval = Math.max(3000, Number(els.intervalInput.value || DEFAULT_INTERVAL));
    setStatus('Live API attivo. Leggo quando trovo testo nuovo.');
    await readRealtimeFrame();
    state.timer = window.setInterval(readRealtimeFrame, interval);
  } catch (error) {
    console.error(error);
    stopLive();
    setStatus(error.message || 'Errore durante l avvio Live API.', 'error');
  }
}

function stopLive() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  state.live = false;
  resetRealtime();
  setButtons();
}

function clearAll() {
  state.lastRawText = '';
  state.lastSpeakText = '';
  state.lastFrameSignature = null;
  els.rawTextBox.textContent = 'Ancora nulla.';
  els.spokenLog.innerHTML = '';
  setStatus('Memoria pulita. La prossima lettura riparte da zero.');
}

els.shareBtn.addEventListener('click', shareScreen);
els.selectBtn.addEventListener('click', enableSelection);
els.readOnceBtn.addEventListener('click', () => readOnce());
els.liveBtn.addEventListener('click', startLive);
els.stopLiveBtn.addEventListener('click', () => {
  stopLive();
  setStatus('Live fermato.');
});
els.playPauseBtn.addEventListener('click', () => {
  toggleAudioPlayback();
  setStatus(state.audioPaused ? 'Audio in pausa.' : 'Audio ripreso.');
});
els.stopAudioBtn.addEventListener('click', () => {
  stopAudio();
  setStatus('Audio fermato.');
});
els.clearBtn.addEventListener('click', clearAll);
els.volumeInput.addEventListener('input', applyVolume);

[
  els.languageSelect,
  els.accentSelect,
  els.accentIntensityInput,
  els.liveModeSelect,
  els.provocationInput,
  els.sarcasmInput,
  els.seriousnessInput,
  els.summaryLengthInput,
  els.customBehaviorInput
].forEach((control) => {
  control.addEventListener('input', handleInstructionChange);
  control.addEventListener('change', handleInstructionChange);
});

els.volumeInput.addEventListener('input', () => {
  updateActiveInstructions(state.realtime.connected ? 'synced' : 'local');
});

els.previewWrap.addEventListener('mousedown', (event) => {
  if (!state.canDrawSelection || !state.stream) return;
  event.preventDefault();
  state.selecting = true;
  state.dragStart = pointFromEvent(event);
  setSelectionFromPoints(state.dragStart, state.dragStart);
});

window.addEventListener('mousemove', (event) => {
  if (!state.selecting || !state.dragStart) return;
  setSelectionFromPoints(state.dragStart, pointFromEvent(event));
});

window.addEventListener('mouseup', () => {
  if (!state.selecting) return;
  state.selecting = false;
  state.canDrawSelection = false;
  els.previewWrap.classList.remove('selecting');

  if (state.selection && state.selection.w > 10 && state.selection.h > 10) {
    setStatus('Rettangolo selezionato. Ora puoi fare “Leggi una volta” o “Avvia live”.');
  } else {
    state.selection = null;
    setStatus('Rettangolo troppo piccolo. Riprova.');
  }
  updateSelectionBox();
  setButtons();
});

window.addEventListener('resize', updateSelectionBox);

checkBackend();
setButtons();
updateActiveInstructions();
