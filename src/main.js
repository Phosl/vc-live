import './styles.css';

const DEFAULT_INTERVAL = Number(import.meta.env.VITE_READ_INTERVAL_MS || 2500);

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
  lastAudioUrl: null,
  currentAudio: null
};

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">MVP locale</p>
        <h1>Vibe Screen Reader</h1>
        <p class="subtitle">Seleziona una zona dello schermo, per esempio la chat Codex in VS Code, e falla leggere ad alta voce con OpenAI.</p>
      </div>
      <div id="health" class="health">Controllo backend…</div>
    </section>

    <section class="panel controls">
      <div class="buttonRow">
        <button id="shareBtn" class="primary">1. Condividi schermo / VS Code</button>
        <button id="selectBtn" disabled>2. Disegna rettangolo</button>
        <button id="readOnceBtn" disabled>Leggi una volta</button>
        <button id="liveBtn" disabled>Avvia live</button>
        <button id="stopLiveBtn" disabled>Ferma live</button>
        <button id="stopAudioBtn">Stop audio</button>
      </div>

      <div class="settings">
        <label>
          Intervallo live
          <input id="intervalInput" type="number" min="1200" step="100" value="${DEFAULT_INTERVAL}" />
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
        <label class="check">
          <input id="browserFallback" type="checkbox" checked />
          Fallback voce browser se OpenAI TTS fallisce
        </label>
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
          <h2>Testo letto</h2>
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
  stopAudioBtn: document.querySelector('#stopAudioBtn'),
  clearBtn: document.querySelector('#clearBtn'),
  intervalInput: document.querySelector('#intervalInput'),
  languageSelect: document.querySelector('#languageSelect'),
  browserFallback: document.querySelector('#browserFallback'),
  previewWrap: document.querySelector('#previewWrap'),
  screenVideo: document.querySelector('#screenVideo'),
  selectionBox: document.querySelector('#selectionBox'),
  emptyPreview: document.querySelector('#emptyPreview'),
  captureCanvas: document.querySelector('#captureCanvas'),
  status: document.querySelector('#status'),
  spokenLog: document.querySelector('#spokenLog'),
  rawTextBox: document.querySelector('#rawTextBox')
};

function setStatus(message, type = 'normal') {
  els.status.textContent = message;
  els.status.dataset.type = type;
}

function setHealth(message, ok = true) {
  els.health.textContent = message;
  els.health.dataset.ok = String(ok);
}

function setButtons() {
  const hasStream = Boolean(state.stream);
  const hasSelection = Boolean(state.selection && state.selection.w > 10 && state.selection.h > 10);
  els.selectBtn.disabled = !hasStream;
  els.readOnceBtn.disabled = !hasStream || !hasSelection || state.busy;
  els.liveBtn.disabled = !hasStream || !hasSelection || state.live;
  els.stopLiveBtn.disabled = !state.live;
  els.shareBtn.textContent = hasStream ? 'Cambia schermo / finestra' : '1. Condividi schermo / VS Code';
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
      setHealth('Backend ok, API key da inserire', false);
    } else {
      setHealth(`Backend ok · ${json.visionModel} · voce ${json.ttsVoice}`, true);
    }
  } catch {
    setHealth('Backend non raggiungibile', false);
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
  state.canDrawSelection = true;
  setStatus('Trascina con il mouse sulla preview per disegnare il rettangolo della chat.');
  els.previewWrap.classList.add('selecting');
}

function captureSelection() {
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

  return canvas.toDataURL('image/jpeg', 0.82);
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
        mode: 'codex-chat'
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Errore API');

    const rawText = String(json.rawText || '').trim();
    const speakText = String(json.speakText || '').trim();
    const rawChanged = rawText && canonical(rawText) !== canonical(state.lastRawText);
    const speakChanged = speakText && canonical(speakText) !== canonical(state.lastSpeakText);

    if (rawText) {
      state.lastRawText = rawText;
      els.rawTextBox.textContent = rawText;
    }

    if (json.shouldSpeak && speakChanged && rawChanged) {
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
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const maybeJson = await res.json().catch(() => ({}));
      throw new Error(maybeJson.error || 'TTS OpenAI non disponibile');
    }

    const blob = await res.blob();
    if (state.lastAudioUrl) URL.revokeObjectURL(state.lastAudioUrl);
    state.lastAudioUrl = URL.createObjectURL(blob);
    const audio = new Audio(state.lastAudioUrl);
    state.currentAudio = audio;

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
  }
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = els.languageSelect.value === 'inglese' ? 'en-US' : els.languageSelect.value === 'spagnolo' ? 'es-ES' : 'it-IT';
    utterance.rate = 0.98;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

function stopAudio(options = {}) {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (!options.keepSpeakingFlag) state.speaking = false;
}

function startLive() {
  if (state.live) return;
  state.live = true;
  setStatus('Live attivo. Leggo solo quando trovo testo nuovo.');
  setButtons();

  const interval = Math.max(1200, Number(els.intervalInput.value || DEFAULT_INTERVAL));
  readOnce({ fromLive: true });
  state.timer = window.setInterval(() => {
    if (!state.busy && !state.speaking) readOnce({ fromLive: true });
  }, interval);
}

function stopLive() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  state.live = false;
  setButtons();
}

function clearAll() {
  state.lastRawText = '';
  state.lastSpeakText = '';
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
els.stopAudioBtn.addEventListener('click', () => {
  stopAudio();
  setStatus('Audio fermato.');
});
els.clearBtn.addEventListener('click', clearAll);

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
