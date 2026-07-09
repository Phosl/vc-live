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
  currentAudio: null,
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
      <div id="health" class="health">Controllo backend…</div>
    </section>

    <section class="panel controls">
      <div class="buttonRow">
        <button id="shareBtn" class="primary">1. Condividi schermo / VS Code</button>
        <button id="selectBtn" disabled>2. Disegna rettangolo</button>
        <button id="readOnceBtn" disabled>Leggi una volta</button>
        <button id="liveBtn" disabled>Avvia live API</button>
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
        <label>
          Modalità live
          <select id="liveModeSelect">
            <option value="read" selected>Lettura</option>
            <option value="summary">Riassunto</option>
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
  stopAudioBtn: document.querySelector('#stopAudioBtn'),
  clearBtn: document.querySelector('#clearBtn'),
  intervalInput: document.querySelector('#intervalInput'),
  languageSelect: document.querySelector('#languageSelect'),
  liveModeSelect: document.querySelector('#liveModeSelect'),
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
      setHealth(`Backend ok · ${json.visionModel} · live ${json.realtimeVoice || json.ttsVoice}`, true);
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
  if (state.realtime.audio) {
    state.realtime.audio.pause();
    state.realtime.audio.srcObject = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (!options.keepSpeakingFlag) state.speaking = false;
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

async function connectRealtime() {
  if (state.realtime.connected) return;

  if (!('RTCPeerConnection' in window)) {
    throw new Error('WebRTC non disponibile in questo browser.');
  }

  resetRealtime();

  const pc = new RTCPeerConnection();
  const audio = document.createElement('audio');
  audio.autoplay = true;
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

  const res = await fetch('/api/realtime/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: offer.sdp
  });

  const answer = await res.text();
  if (!res.ok) {
    let errorMessage = answer;
    try {
      errorMessage = JSON.parse(answer).error || answer;
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
      resolve();
    };
  });
}

function makeRealtimePrompt() {
  const language = els.languageSelect.value;
  const liveMode = els.liveModeSelect.value;
  const previous = state.lastSpeakText || '(vuoto)';

  if (liveMode === 'summary') {
    return `
Riassumi la chat nello screenshot in ${language}.

Obiettivo:
- Non leggere il testo alla lettera.
- Spiega in modo breve cosa sta succedendo, cosa e' cambiato e se c'e un punto importante da notare.
- Ignora interfaccia, pulsanti, sidebar, header, placeholder e scrollbar.
- Se c'e codice, descrivi l'intento o il risultato, non leggere le righe.
- Se non c'e niente di nuovo o utile rispetto a "previous_spoken_text", di' solo: nessun nuovo testo.
- Massimo 2 frasi, tono allegro, chiaro e leggermente veloce.

previous_spoken_text:
${previous}
`.trim();
  }

  return `
Leggi la chat nello screenshot in ${language}.

Regole:
- Leggi solo testo nuovo e significativo rispetto a "previous_spoken_text".
- Ignora interfaccia, pulsanti, sidebar, header, placeholder e scrollbar.
- Se c'e codice, riassumilo invece di leggere ogni riga.
- Se il testo e' parziale o ancora in caricamento, aspetta e leggi solo cio' che sembra stabile.
- Se non c'e niente di nuovo, di' solo: nessun nuovo testo.
- Massimo 3 frasi, tono allegro e leggermente veloce.

previous_spoken_text:
${previous}
`.trim();
}

async function readRealtimeFrame() {
  if (!state.live || state.realtime.responding || state.busy) return;

  try {
    state.busy = true;
    setButtons();
    const image = captureSelection();
    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: makeRealtimePrompt() },
          { type: 'input_image', image_url: image }
        ]
      }
    });
    sendRealtimeEvent({ type: 'response.create' });
    setStatus('Live API: ho mandato lo screenshot a Realtime.');
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

    const interval = Math.max(1600, Number(els.intervalInput.value || DEFAULT_INTERVAL));
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
