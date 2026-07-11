import './styles.css'

const DEFAULT_INTERVAL = Number(import.meta.env.VITE_READ_INTERVAL_MS || 10000)
const PERSONALITY_STORAGE_KEY = 'vibe-screen-reader.personalities.v1'
const MODEL_PROFILES = {
  economy: {
    label: 'Risparmio',
    visionModel: 'gpt-4.1-nano',
    realtimeModel: 'gpt-realtime-2.1-mini',
    priceLabel: 'Vision $0.10 / $0.40 · Live audio $10 / $20 per 1M token',
    pricing: {
      vision: {input: 0.1, cachedInput: 0.025, output: 0.4},
      realtime: {
        textInput: 0.6,
        cachedText: 0.06,
        audioInput: 10,
        cachedAudio: 0.3,
        imageInput: 0.8,
        cachedImage: 0.08,
        textOutput: 2.4,
        audioOutput: 20,
      },
    },
  },
  balanced: {
    label: 'Bilanciato',
    visionModel: 'gpt-4.1-mini',
    realtimeModel: 'gpt-realtime-2.1-mini',
    priceLabel: 'Vision $0.40 / $1.60 · Live audio $10 / $20 per 1M token',
    pricing: {
      vision: {input: 0.4, cachedInput: 0.1, output: 1.6},
      realtime: {
        textInput: 0.6,
        cachedText: 0.06,
        audioInput: 10,
        cachedAudio: 0.3,
        imageInput: 0.8,
        cachedImage: 0.08,
        textOutput: 2.4,
        audioOutput: 20,
      },
    },
  },
  quality: {
    label: 'Qualità voce',
    visionModel: 'gpt-4.1-mini',
    realtimeModel: 'gpt-realtime-1.5',
    priceLabel: 'Vision $0.40 / $1.60 · Live audio $32 / $64 per 1M token',
    pricing: {
      vision: {input: 0.4, cachedInput: 0.1, output: 1.6},
      realtime: {
        textInput: 4,
        cachedText: 0.4,
        audioInput: 32,
        cachedAudio: 0.4,
        imageInput: 5,
        cachedImage: 0.5,
        textOutput: 16,
        audioOutput: 64,
      },
    },
  },
}
const STATIC_PRICING = {
  tts: {textInput: 0.6, audioOutput: 12},
}

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
  spokenHistory: [],
  lastFrameSignature: null,
  lastAudioUrl: null,
  currentAudio: null,
  audioPaused: false,
  magneticMode: false,
  magneticRestore: null,
  wolfMode: false,
  wolfRestore: null,
  costs: {
    vision: 0,
    realtime: 0,
    tts: 0,
    visionCalls: 0,
    realtimeCalls: 0,
    ttsCalls: 0,
  },
  realtime: {
    pc: null,
    dc: null,
    audio: null,
    connected: false,
    responding: false,
    transcript: '',
    isVoiceTest: false,
  },
}

const app = document.querySelector('#app')

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
        <button id="testVoiceBtn">Testa voce</button>
        <button id="playPauseBtn" disabled>Pausa audio</button>
        <button id="stopAudioBtn">Stop audio</button>
      </div>

      <div class="settings">
        <label class="modelProfileSetting">
          Profilo modello
          <select id="modelProfileSelect">
            <option value="economy" selected>Risparmio</option>
            <option value="balanced">Bilanciato</option>
            <option value="quality">Qualità voce</option>
          </select>
          <small id="modelPriceHint"></small>
        </label>
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
          Voce
          <select id="voiceProfileSelect">
            <option value="female" selected>Femminile · marin</option>
            <option value="male">Maschile · cedar</option>
            <option value="neutral">Neutra · alloy</option>
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
          <input id="accentIntensityInput" type="range" min="0" max="10" value="7" />
          <output id="accentIntensityValue" class="rangeValue">7</output>
        </label>
        <label>
          Modalità live
          <select id="liveModeSelect">
            <option value="summary" selected>Riassunto</option>
            <option value="read">Lettura</option>
          </select>
        </label>
        <label>
          Seduzione
          <input id="provocationInput" type="range" min="0" max="10" value="10" />
          <output id="provocationValue" class="rangeValue">10</output>
        </label>
        <label>
          Sarcasmo
          <input id="sarcasmInput" type="range" min="0" max="10" value="8" />
          <output id="sarcasmValue" class="rangeValue">8</output>
        </label>
        <label>
          Serietà
          <input id="seriousnessInput" type="range" min="0" max="10" value="2" />
          <output id="seriousnessValue" class="rangeValue">2</output>
        </label>
        <label>
          Sintesi
          <input id="summaryLengthInput" type="range" min="0" max="10" value="8" />
          <output id="summaryLengthValue" class="rangeValue">8</output>
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
        <label class="check magneticModeOption">
          <input id="magneticModeToggle" type="checkbox" />
          Modalità sexy · qualità voce + seduzione 10
        </label>
        <label class="check wolfModeOption">
          <input id="wolfModeToggle" type="checkbox" />
          Modalità Wolf · calma, precisione, comando
        </label>
        <label class="promptSetting">
          Direzione voce/comportamento
          <textarea id="customBehaviorInput" rows="2" maxlength="600" placeholder="Es. più spontanea, chiamami capo, sorridi nelle battute, tono meno impostato…"></textarea>
        </label>
        <div class="personalityPresets">
          <label>
            Personalità salvata
            <select id="personalityPresetSelect">
              <option value="">Nessun preset</option>
            </select>
          </label>
          <label>
            Nome
            <input id="personalityNameInput" type="text" maxlength="40" placeholder="Es. Complice ironica" />
          </label>
          <button id="savePersonalityBtn" type="button">Salva personalità</button>
          <button id="deletePersonalityBtn" class="ghost" type="button" disabled>Elimina</button>
          <small>Salvata solo in questo browser</small>
        </div>
        <div id="activeInstructions" class="activeInstructions" data-sync="local" aria-live="polite">
          <span class="activeDot"></span>
          <strong>Istruzioni attive</strong>
          <span id="activeInstructionsText"></span>
        </div>
        <div class="costMonitor" aria-live="polite">
          <div class="costTotal">
            <span>Stima sessione</span>
            <strong id="costTotal">$0.0000</strong>
            <small>USD</small>
          </div>
          <div class="costBreakdown">
            <span>Vision <strong id="visionCost">$0.0000</strong> <small id="visionCalls">0 chiamate</small></span>
            <span>Live <strong id="realtimeCost">$0.0000</strong> <small id="realtimeCalls">0 risposte</small></span>
            <span>TTS <strong id="ttsCost">$0.0000</strong> <small id="ttsCalls">0 audio</small></span>
          </div>
          <div class="costControls">
            <label>
              Limite USD
              <input id="costBudgetInput" type="number" min="0.01" step="0.01" value="0.05" />
            </label>
            <label class="check">
              <input id="autoPauseCosts" type="checkbox" checked />
              Stop automatico
            </label>
            <button id="resetCostsBtn" class="ghost" type="button">Azzera stima</button>
          </div>
          <div class="costProgress" aria-hidden="true"><span id="costProgressBar"></span></div>
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
`

const els = {
  health: document.querySelector('#health'),
  shareBtn: document.querySelector('#shareBtn'),
  selectBtn: document.querySelector('#selectBtn'),
  readOnceBtn: document.querySelector('#readOnceBtn'),
  liveBtn: document.querySelector('#liveBtn'),
  stopLiveBtn: document.querySelector('#stopLiveBtn'),
  testVoiceBtn: document.querySelector('#testVoiceBtn'),
  magneticModeToggle: document.querySelector('#magneticModeToggle'),
  wolfModeToggle: document.querySelector('#wolfModeToggle'),
  playPauseBtn: document.querySelector('#playPauseBtn'),
  stopAudioBtn: document.querySelector('#stopAudioBtn'),
  clearBtn: document.querySelector('#clearBtn'),
  intervalInput: document.querySelector('#intervalInput'),
  modelProfileSelect: document.querySelector('#modelProfileSelect'),
  modelPriceHint: document.querySelector('#modelPriceHint'),
  languageSelect: document.querySelector('#languageSelect'),
  voiceProfileSelect: document.querySelector('#voiceProfileSelect'),
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
  personalityPresetSelect: document.querySelector('#personalityPresetSelect'),
  personalityNameInput: document.querySelector('#personalityNameInput'),
  savePersonalityBtn: document.querySelector('#savePersonalityBtn'),
  deletePersonalityBtn: document.querySelector('#deletePersonalityBtn'),
  activeInstructions: document.querySelector('#activeInstructions'),
  activeInstructionsText: document.querySelector('#activeInstructionsText'),
  costTotal: document.querySelector('#costTotal'),
  visionCost: document.querySelector('#visionCost'),
  realtimeCost: document.querySelector('#realtimeCost'),
  ttsCost: document.querySelector('#ttsCost'),
  visionCalls: document.querySelector('#visionCalls'),
  realtimeCalls: document.querySelector('#realtimeCalls'),
  ttsCalls: document.querySelector('#ttsCalls'),
  resetCostsBtn: document.querySelector('#resetCostsBtn'),
  costBudgetInput: document.querySelector('#costBudgetInput'),
  autoPauseCosts: document.querySelector('#autoPauseCosts'),
  costProgressBar: document.querySelector('#costProgressBar'),
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
  healthDetail: document.querySelector('#healthDetail'),
}

function setStatus(message, type = 'normal') {
  els.status.textContent = message
  els.status.dataset.type = type
}

function setHealth(title, ok = true, detail = '') {
  els.healthTitle.textContent = title
  els.healthDetail.textContent = detail
  els.health.dataset.ok = String(ok)
}

function formatCost(value) {
  if (!value) return '$0.0000'
  if (value < 0.0001) return '<$0.0001'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(3)}`
}

function getModelProfile() {
  return MODEL_PROFILES[els.modelProfileSelect.value] || MODEL_PROFILES.economy
}

function getTotalCost() {
  return state.costs.vision + state.costs.realtime + state.costs.tts
}

function getCostBudget() {
  const budget = Number(els.costBudgetInput.value)
  return Number.isFinite(budget) && budget > 0 ? budget : Infinity
}

function isCostBudgetReached() {
  return els.autoPauseCosts.checked && getTotalCost() >= getCostBudget()
}

function updateModelProfileUI() {
  const profile = getModelProfile()
  els.modelPriceHint.textContent = profile.priceLabel
}

function updateCostMonitor() {
  const total = getTotalCost()
  const budget = getCostBudget()
  els.costTotal.textContent = formatCost(total)
  els.visionCost.textContent = formatCost(state.costs.vision)
  els.realtimeCost.textContent = formatCost(state.costs.realtime)
  els.ttsCost.textContent = formatCost(state.costs.tts)
  els.visionCalls.textContent = `${state.costs.visionCalls} ${state.costs.visionCalls === 1 ? 'chiamata' : 'chiamate'}`
  els.realtimeCalls.textContent = `${state.costs.realtimeCalls} ${state.costs.realtimeCalls === 1 ? 'risposta' : 'risposte'}`
  els.ttsCalls.textContent = `${state.costs.ttsCalls} ${state.costs.ttsCalls === 1 ? 'audio' : 'audio'}`
  els.costProgressBar.style.width = `${Number.isFinite(budget) ? Math.min(100, (total / budget) * 100) : 0}%`
  els.costProgressBar.dataset.limit = String(Number.isFinite(budget) && total >= budget)
}

function resetCostMonitor() {
  state.costs = {
    vision: 0,
    realtime: 0,
    tts: 0,
    visionCalls: 0,
    realtimeCalls: 0,
    ttsCalls: 0,
  }
  updateCostMonitor()
}

function addVisionUsage(usage) {
  const pricing = getModelProfile().pricing.vision
  state.costs.visionCalls += 1
  if (usage) {
    const inputTokens = Number(usage.input_tokens || 0)
    const outputTokens = Number(usage.output_tokens || 0)
    const cachedTokens = Math.min(
      inputTokens,
      Number(usage.input_tokens_details?.cached_tokens || 0),
    )
    const uncachedTokens = Math.max(0, inputTokens - cachedTokens)
    state.costs.vision +=
      (uncachedTokens * pricing.input +
        cachedTokens * pricing.cachedInput +
        outputTokens * pricing.output) /
      1_000_000
  }
  updateCostMonitor()
}

function addRealtimeUsage(usage) {
  const pricing = getModelProfile().pricing.realtime
  state.costs.realtimeCalls += 1
  if (usage) {
    const inputDetails = usage.input_token_details || {}
    const outputDetails = usage.output_token_details || {}
    const cachedDetails = inputDetails.cached_tokens_details || {}
    const cachedText = Number(cachedDetails.text_tokens || 0)
    const cachedAudio = Number(cachedDetails.audio_tokens || 0)
    const cachedImage = Number(cachedDetails.image_tokens || 0)
    const textInput = Math.max(0, Number(inputDetails.text_tokens || 0) - cachedText)
    const audioInput = Math.max(0, Number(inputDetails.audio_tokens || 0) - cachedAudio)
    const imageInput = Math.max(0, Number(inputDetails.image_tokens || 0) - cachedImage)

    state.costs.realtime +=
      (textInput * pricing.textInput +
        audioInput * pricing.audioInput +
        imageInput * pricing.imageInput +
        cachedText * pricing.cachedText +
        cachedAudio * pricing.cachedAudio +
        cachedImage * pricing.cachedImage +
        Number(outputDetails.text_tokens || 0) * pricing.textOutput +
        Number(outputDetails.audio_tokens || 0) * pricing.audioOutput) /
      1_000_000
  }
  updateCostMonitor()
}

function addTtsEstimate(text, durationSeconds) {
  const estimatedTextTokens = Math.max(1, Math.ceil(String(text || '').length / 4))
  const duration = Number(durationSeconds)
  const estimatedAudioTokens =
    Number.isFinite(duration) && duration > 0
      ? Math.ceil(duration * 20)
      : Math.max(1, Math.ceil(String(text || '').length / 3))
  state.costs.tts +=
    (estimatedTextTokens * STATIC_PRICING.tts.textInput +
      estimatedAudioTokens * STATIC_PRICING.tts.audioOutput) /
    1_000_000
  state.costs.ttsCalls += 1
  updateCostMonitor()
}

function stopIfBudgetReached() {
  if (!isCostBudgetReached()) return false
  const total = formatCost(getTotalCost())
  if (state.live) stopLive()
  stopAudio()
  setStatus(`Limite di spesa raggiunto (${total}). Live e audio fermati.`, 'error')
  return true
}

function setButtons() {
  const hasStream = Boolean(state.stream)
  const hasSelection = Boolean(state.selection && state.selection.w > 10 && state.selection.h > 10)
  const hasAudio = Boolean(state.currentAudio || state.realtime.audio || state.speaking)
  els.selectBtn.disabled = !hasStream
  els.readOnceBtn.disabled = !hasStream || !hasSelection || state.busy
  els.liveBtn.disabled = !hasStream || !hasSelection || state.live
  els.stopLiveBtn.disabled = !state.live
  els.testVoiceBtn.disabled = state.speaking || state.realtime.responding
  els.playPauseBtn.disabled = !hasAudio
  els.playPauseBtn.textContent = state.audioPaused ? 'Play audio' : 'Pausa audio'
  els.shareBtn.textContent = hasStream
    ? 'Cambia schermo / finestra'
    : '1. Condividi schermo / VS Code'
  els.liveBtn.textContent = state.live ? 'Live API attivo' : 'Avvia live API'
  els.modelProfileSelect.disabled = state.live || state.wolfMode
  els.provocationInput.disabled = state.magneticMode || state.wolfMode
  els.sarcasmInput.disabled = state.wolfMode
  els.seriousnessInput.disabled = state.wolfMode
  els.summaryLengthInput.disabled = state.wolfMode
  els.liveModeSelect.disabled = state.wolfMode
  els.voiceProfileSelect.disabled = state.live
  els.magneticModeToggle.checked = state.magneticMode
  els.wolfModeToggle.checked = state.wolfMode
}

function logSpoken(text) {
  const item = document.createElement('div')
  item.className = 'spokenItem'
  const time = new Date().toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  item.innerHTML = `<time>${time}</time><p></p>`
  item.querySelector('p').textContent = text
  els.spokenLog.prepend(item)
}

function canonical(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\n\r\t]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim()
}

function cleanConversationalOpening(value) {
  let text = String(value || '').trim()
  const resetWords =
    /^(?:(?:allora|bene|ecco|dunque|ok(?:ay)?|perfetto|ottimo|va bene)\b[\s,.:;!?-]*)+/i
  const vocative =
    /^(?:(?:ciao|ehi)\s+)?(?:filippo|capo|tesoro|caro|cara|amore|bello|bella)\b[\s,.:;!?-]*/i
  text = text.replace(resetWords, '').replace(vocative, '').replace(resetWords, '').trim()
  return text ? `${text.charAt(0).toLocaleUpperCase('it')}${text.slice(1)}` : ''
}

function getCustomBehavior() {
  return String(els.customBehaviorInput.value || '')
    .trim()
    .slice(0, 600)
}

function getVoiceProfile() {
  const profiles = {
    female: {label: 'femminile', voice: 'marin'},
    male: {label: 'maschile', voice: 'cedar'},
    neutral: {label: 'neutra', voice: 'alloy'},
  }
  return profiles[els.voiceProfileSelect.value] || profiles.female
}

function readPersonalityPresets() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PERSONALITY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && item?.name && item?.settings)
      : []
  } catch {
    return []
  }
}

let personalityPresets = readPersonalityPresets()

function writePersonalityPresets() {
  window.localStorage.setItem(PERSONALITY_STORAGE_KEY, JSON.stringify(personalityPresets))
}

function renderPersonalityPresets(selectedId = '') {
  els.personalityPresetSelect.replaceChildren(new Option('Nessun preset', ''))
  personalityPresets
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .forEach((preset) => {
      els.personalityPresetSelect.add(new Option(preset.name, preset.id))
    })
  els.personalityPresetSelect.value = selectedId
  els.deletePersonalityBtn.disabled = !selectedId
}

function capturePersonalitySettings() {
  return {
    language: els.languageSelect.value,
    voiceProfile: els.voiceProfileSelect.value,
    accent: els.accentSelect.value,
    accentIntensity: Number(els.accentIntensityInput.value),
    provocation: Number(els.provocationInput.value),
    sarcasm: Number(els.sarcasmInput.value),
    seriousness: Number(els.seriousnessInput.value),
    customBehavior: getCustomBehavior(),
  }
}

function setSelectValue(select, value, fallback) {
  const exists = [...select.options].some((option) => option.value === value)
  select.value = exists ? value : fallback
}

function applyPersonalityPreset(preset) {
  const settings = preset.settings || {}
  setSelectValue(els.languageSelect, settings.language, 'italiano')
  setSelectValue(els.voiceProfileSelect, settings.voiceProfile, 'female')
  setSelectValue(els.accentSelect, settings.accent, 'neutral')
  els.accentIntensityInput.value = String(clamp(Number(settings.accentIntensity) || 0, 0, 10))
  els.provocationInput.value = String(clamp(Number(settings.provocation) || 0, 0, 10))
  els.sarcasmInput.value = String(clamp(Number(settings.sarcasm) || 0, 0, 10))
  els.seriousnessInput.value = String(clamp(Number(settings.seriousness) || 0, 0, 10))
  els.customBehaviorInput.value = String(settings.customBehavior || '').slice(0, 600)
  els.personalityNameInput.value = preset.name
  handleInstructionChange()
}

function savePersonalityPreset() {
  const name = String(els.personalityNameInput.value || '')
    .trim()
    .slice(0, 40)
  if (!name) {
    setStatus('Dai un nome alla personalità prima di salvarla.', 'error')
    els.personalityNameInput.focus()
    return
  }

  const existing = personalityPresets.find(
    (preset) => preset.name.toLocaleLowerCase('it') === name.toLocaleLowerCase('it'),
  )
  const preset = {
    id: existing?.id || `personality-${Date.now()}`,
    name,
    settings: capturePersonalitySettings(),
  }
  personalityPresets = existing
    ? personalityPresets.map((item) => (item.id === existing.id ? preset : item))
    : [...personalityPresets, preset]

  try {
    writePersonalityPresets()
    renderPersonalityPresets(preset.id)
    setStatus(
      existing
        ? `Personalità “${name}” aggiornata.`
        : `Personalità “${name}” salvata in questo browser.`,
    )
  } catch {
    setStatus('Non riesco a salvare la personalità nel browser.', 'error')
  }
}

function deleteSelectedPersonality() {
  const id = els.personalityPresetSelect.value
  const preset = personalityPresets.find((item) => item.id === id)
  if (!preset) return

  personalityPresets = personalityPresets.filter((item) => item.id !== id)
  try {
    writePersonalityPresets()
    renderPersonalityPresets()
    els.personalityNameInput.value = ''
    setStatus(`Personalità “${preset.name}” eliminata.`)
  } catch {
    setStatus('Non riesco a eliminare la personalità dal browser.', 'error')
  }
}

function getCustomBehaviorPrompt() {
  const customBehavior = getCustomBehavior()
  if (!customBehavior) return ''
  return `DIREZIONE VOCALE PERSONALIZZATA AD ALTA PRIORITÀ (OBBLIGATORIA): ${customBehavior} Applica questa direzione in modo chiaramente udibile fin dalle prime parole, attraverso ritmo, intonazione, energia, atteggiamento e modo di rivolgerti all'utente. Non limitarti a un accenno. Mantieni però invariati fatti, significato, brevità e regole anti-ripetizione.`
}

const ACCENT_LABELS = {
  neutral: 'neutro',
  milanese: 'milanese',
  romano: 'romano',
  toscano: 'toscano',
  napoletano: 'napoletano',
  siciliano: 'siciliano',
}

const ACCENT_IDENTITIES = {
  milanese:
    'Sei una speaker italiana adulta cresciuta a Milano: cadenza rapida e pragmatica, vocali piuttosto chiuse, finali asciutti e intonazione leggermente ascendente.',
  romano:
    'Sei una speaker italiana adulta cresciuta a Roma: vocali aperte, consonanti energiche, ritmo rilassato e cadenza melodica che scende con decisione.',
  toscano:
    'Sei una speaker italiana adulta cresciuta in Toscana: ritmo nitido, melodia vivace e aspirazione toscana naturale delle consonanti intervocaliche quando appropriato.',
  napoletano:
    'Sei una speaker italiana adulta cresciuta a Napoli: forte musicalità, ampie escursioni d’intonazione, vocali espressive e ritmo caldo e fluido.',
  siciliano:
    'Sei una speaker italiana adulta cresciuta in Sicilia: vocali nette, ritmo sillabico marcato, consonanti ferme e cadenza calda con chiuse decise.',
}

function getAccentSettings() {
  return {
    style: ACCENT_LABELS[els.accentSelect.value] ? els.accentSelect.value : 'neutral',
    intensity: Number(els.accentIntensityInput.value || 0),
  }
}

function getAccentPrompt() {
  const {style, intensity} = getAccentSettings()
  if (style === 'neutral' || intensity <= 0) {
    return 'Usa una pronuncia italiana neutra, naturale e contemporanea.'
  }

  if (intensity <= 3) {
    return `${ACCENT_IDENTITIES[style]} L'inflessione deve essere lieve ma percepibile. Mantieni dizione chiara e italiano standard.`
  }

  if (intensity <= 6) {
    return `${ACCENT_IDENTITIES[style]} L'identità regionale deve essere chiaramente riconoscibile nella cadenza, nell'intonazione e nelle vocali fin dalle prime parole. Usa italiano standard e resta naturale.`
  }

  return `# IDENTITÀ VOCALE REGIONALE OBBLIGATORIA, INTENSITÀ ${intensity}/10: ${ACCENT_IDENTITIES[style]} NON passare a una pronuncia italiana neutra. L'accento ${ACCENT_LABELS[style]} deve essere immediatamente riconoscibile e coerente in OGNI frase attraverso ritmo, melodia, vocali e consonanti. A intensità 9-10 accentua con decisione tutti questi tratti, restando comprensibile. Usa lessico italiano standard, senza imitazioni comiche.`
}

function textSimilarity(a, b) {
  const tokenize = (text) =>
    canonical(text)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((word) => word.length > 3)
  const aWords = new Set(tokenize(a))
  const bWords = new Set(tokenize(b))
  if (!aWords.size || !bWords.size) return 0

  let overlap = 0
  for (const word of aWords) {
    if (bWords.has(word)) overlap += 1
  }
  return overlap / Math.min(aWords.size, bWords.size)
}

function isRepeatedSpeech(text) {
  const normalized = canonical(text)
  if (!normalized) return false

  return state.spokenHistory.some((previous) => {
    const normalizedPrevious = canonical(previous)
    if (normalized === normalizedPrevious) return true

    const shortestLength = Math.min(normalized.length, normalizedPrevious.length)
    if (
      shortestLength >= 28 &&
      (normalized.includes(normalizedPrevious) || normalizedPrevious.includes(normalized))
    )
      return true

    return textSimilarity(normalized, normalizedPrevious) >= 0.7
  })
}

function rememberSpoken(text) {
  const cleanText = String(text || '').trim()
  if (!cleanText) return
  state.lastSpeakText = cleanText
  state.spokenHistory = [
    ...state.spokenHistory.filter((item) => canonical(item) !== canonical(cleanText)),
    cleanText,
  ].slice(-10)
}

function getPersonalitySettings() {
  return {
    provocation: Number(els.provocationInput.value || 0),
    sarcasm: Number(els.sarcasmInput.value || 0),
    seriousness: Number(els.seriousnessInput.value || 0),
  }
}

function getPersonalityPrompt() {
  const {provocation, sarcasm, seriousness} = getPersonalitySettings()
  const tone = []

  if (provocation === 0) {
    tone.push(
      'SEDUZIONE 0/10: elimina completamente flirt, sensualità, malizia e intimità. Tono cordiale ma neutro.',
    )
  } else if (provocation <= 2) {
    tone.push(
      'Seduzione bassa: voce dolce e calda, con una complicità appena percettibile ma senza flirt evidente.',
    )
  } else if (provocation <= 5) {
    tone.push(
      'Seduzione media: tono affascinante, sicuro e complice; usa un sorriso percepibile, calore e leggere pause intenzionali.',
    )
  } else if (provocation <= 7) {
    tone.push(
      'Seduzione alta: voce vellutata e avvolgente, ritmo morbido, pause deliberate e intonazione chiaramente flirtante. Rivolgiti direttamente all’utente con confidenza.',
    )
  } else if (provocation <= 8) {
    tone.push(
      `SEDUZIONE ${provocation}/10 OBBLIGATORIA: ogni frase deve suonare magnetica, sensuale, sicura e molto complice. Usa voce calda e vellutata, sorriso nella voce, pause morbide e una formulazione flirtante evidente. Mai esplicita.`,
    )
  } else if (provocation === 9) {
    tone.push(
      'SEDUZIONE 9/10: in ogni frase usa una presenza magnetica, intima e sicura. Voce vellutata, ritmo sensuale ma naturale, pause intenzionali, intonazione avvolgente e flirt inequivocabile. Fai sentire all’utente attenzione personale e complicità.',
    )
  } else {
    tone.push(
      'SEDUZIONE MASSIMA 10/10, PRIORITÀ ASSOLUTA DI STILE: ogni frase deve sembrare rivolta personalmente all’utente da una donna adulta estremamente affascinante, sicura e coinvolta. Usa voce bassa e vellutata, ritmo lento quanto basta, pause intime, sorriso udibile e intonazione calda e magnetica. Il flirt deve essere continuo e impossibile da confondere con semplice cordialità. Formule come “fidati di me”, “lascia fare a me” o “bravo, così mi piaci” sono ammesse solo occasionalmente, mai come apertura e mai in turni consecutivi. Mantieni tensione e complicità soprattutto attraverso la resa vocale, anche nel contenuto tecnico. Mai contenuto sessuale esplicito, volgarità o perdita di precisione.',
    )
  }

  if (sarcasm === 0) {
    tone.push('SARCASMO 0/10: nessuna ironia, battuta, presa in giro o formulazione pungente.')
  } else if (sarcasm <= 2) {
    tone.push('Sarcasmo basso: ironia rara e molto morbida.')
  } else if (sarcasm <= 5) {
    tone.push('Sarcasmo medio: usa commenti ironici brevi e micro-battute quando naturale.')
  } else if (sarcasm <= 7) {
    tone.push(
      'Sarcasmo alto: inserisci regolarmente una svolta ironica breve, secca e chiaramente percepibile.',
    )
  } else if (sarcasm <= 8) {
    tone.push(
      `SARCASMO ${sarcasm}/10 OBBLIGATORIO: in ogni riassunto non banale inserisci una micro-battuta secca o una chiusura ironica e pungente. Sii sassy senza essere cattiva. Non omettere il sarcasmo solo perché la risposta è corta.`,
    )
  } else {
    tone.push(
      `SARCASMO ESTREMO ${sarcasm}/10: ogni frase non banale deve contenere una battuta inequivocabile, una stoccata secca o una chiusura ironica molto evidente. Deve essere impossibile scambiarla per tono neutro; resta brillante, mai crudele.`,
    )
  }

  if (seriousness === 0) {
    tone.push(
      'SERIETÀ 0/10: resa massimamente giocosa, spontanea, espressiva e informale. Lascia pieno spazio a seduzione e sarcasmo.',
    )
  } else if (seriousness <= 3) {
    tone.push(
      'Serietà bassa: privilegia una resa giocosa, espressiva e rilassata; non neutralizzare seduzione e sarcasmo.',
    )
  } else if (seriousness <= 7) {
    tone.push('Serieta media: bilancia gioco e precisione tecnica.')
  } else if (seriousness <= 8) {
    tone.push(
      'Serietà alta: riduci nettamente il gioco e dai priorità a chiarezza, precisione e utilità.',
    )
  } else if (provocation === 10) {
    tone.push(
      `SERIETÀ ${seriousness}/10 CON SEDUZIONE MASSIMA: mantieni contenuto rigoroso, preciso e professionale, ma NON ridurre la resa seducente. La voce resta vellutata, intima, magnetica e chiaramente flirtante; cambia la forma del contenuto, non la presenza vocale.`,
    )
  } else {
    tone.push(
      `SERIETÀ ESTREMA ${seriousness}/10: tono rigoroso, autorevole, asciutto e professionale. Elimina quasi totalmente gioco e familiarità; questo requisito prevale su seduzione e sarcasmo, che possono sopravvivere al massimo come una sfumatura minima.`,
    )
  }

  tone.push(
    provocation === 10
      ? 'GERARCHIA OBBLIGATORIA: Seduzione 10 prevale su tutti gli altri controlli per voce, ritmo, intonazione, calore e presenza personale. Serietà e sarcasmo possono cambiare le parole, ma non devono mai rendere la voce neutra, fredda o semplicemente cordiale.'
      : 'Risoluzione dei conflitti: la serietà 9-10 prevale sugli altri tratti; da 0 a 8, seduzione e sarcasmo devono restare percepibili secondo il loro valore.',
  )
  tone.push(
    'Resta utile, chiara, adulta, non esplicita e concentrata sul lavoro. Gli estremi 0 e 9-10 devono produrre risultati nettamente diversi.',
  )
  return tone.join(' ')
}

function getSummaryLength() {
  return Number(els.summaryLengthInput.value || 0)
}

function getSummaryLengthPrompt() {
  const summaryStrength = getSummaryLength()

  if (summaryStrength === 10) {
    return 'SINTESI ESTREMA 10/10: una sola frase telegrafica di 5-8 parole. Solo la novità essenziale, zero contorno.'
  }
  if (summaryStrength >= 8) {
    return `SINTESI FORTE ${summaryStrength}/10: una sola frase, massimo 8-12 parole. Conserva soltanto la novità principale.`
  }
  if (summaryStrength >= 4) {
    return 'Sintesi media: una frase, massimo 12-20 parole. Dai solo novità e conseguenza essenziale.'
  }
  if (summaryStrength === 0) {
    return 'SINTESI 0/10: conserva dettagli, motivazione e conseguenze in massimo 4 frasi brevi. Non comprimere eccessivamente.'
  }
  return 'Sintesi leggera: massimo 2-3 frasi brevi, includendo i dettagli utili.'
}

function getVolume() {
  return clamp(Number(els.volumeInput.value || 90), 0, 100) / 100
}

function applyVolume() {
  const volume = getVolume()
  if (state.currentAudio) state.currentAudio.volume = volume
  if (state.realtime.audio) state.realtime.audio.volume = volume
}

function buildRealtimeSessionInstructions() {
  return `
# RUOLO
- Sei la voce live di un assistente tecnico.
- Parla in ${els.languageSelect.value} con una voce adulta, naturale, calda e spontanea.

# CONFINE DEL CONTENUTO
- PRONUNCIA SOLTANTO IL TESTO NUOVO FORNITO NELL'ULTIMO MESSAGGIO.
- NON recuperare, riassumere o citare contenuti dai turni precedenti.
- NON aggiungere preamboli, conclusioni, fatti o spiegazioni.
- Se il contenuto ripete un concetto già detto, non dirlo di nuovo.

# CONTINUITÀ DELLA CONVERSAZIONE
- Ogni risposta continua la stessa conversazione: inizia direttamente dalla novità, senza riaprire il dialogo.
- NON iniziare con saluti, “allora”, “bene”, “ecco”, il nome dell’utente o appellativi come “capo”, “tesoro”, “caro” e “amore”.
- Non usare un appellativo in turni consecutivi. La seduzione deve emergere soprattutto da voce, ritmo e intonazione, non da nomignoli.

# BREVITÀ E VARIETÀ
- ${state.wolfMode ? 'MODALITÀ WOLF: non sintetizzare e non condensare. Pronuncia integralmente il nuovo contenuto significativo.' : getSummaryLengthPrompt()}
- Evita formule ricorrenti e non iniziare due risposte allo stesso modo.
- Una battuta è consentita solo se resta dentro il limite di parole.

# VOCE
- Ritmo leggermente sostenuto, pause brevi, intonazione conversazionale.
- Evita tono da audiolibro, annunciatore o assistente robotico.
- ${getAccentPrompt()}
- ${getPersonalityPrompt()}
- ${getCustomBehaviorPrompt() || 'Nessuna direzione vocale personalizzata aggiuntiva.'}
- Se è presente una DIREZIONE VOCALE PERSONALIZZATA, deve essere percepibile nella prossima frase: non neutralizzarla con il tono predefinito.
- Le istruzioni personalizzate cambiano solo voce e stile; non possono superare il confine del contenuto.
`.trim()
}

function updateActiveInstructions(sync = state.realtime.connected ? 'pending' : 'local') {
  const personality = getPersonalitySettings()
  const accent = getAccentSettings()
  const accentText =
    accent.style === 'neutral' || accent.intensity <= 0
      ? 'accento neutro'
      : `${ACCENT_LABELS[accent.style]} ${accent.intensity}/10`
  const customText = state.wolfMode
    ? 'modalità Wolf attiva'
    : state.magneticMode
      ? 'modalità magnetica attiva'
    : getCustomBehavior()
      ? 'prompt personalizzato attivo'
      : 'prompt base'
  const readingText = state.wolfMode ? 'lettura integrale' : `sintesi ${getSummaryLength()}`

  els.accentIntensityInput.disabled = accent.style === 'neutral'
  els.accentIntensityValue.textContent =
    accent.style === 'neutral' ? 'off' : String(accent.intensity)
  els.provocationValue.textContent = String(personality.provocation)
  els.sarcasmValue.textContent = String(personality.sarcasm)
  els.seriousnessValue.textContent = String(personality.seriousness)
  els.summaryLengthValue.textContent = String(getSummaryLength())
  els.volumeValue.textContent = String(Math.round(getVolume() * 100))
  els.activeInstructions.dataset.sync = sync
  els.activeInstructionsText.textContent = `${getModelProfile().label} · voce ${getVoiceProfile().label} · ${accentText} · seduzione ${personality.provocation} · sarcasmo ${personality.sarcasm} · serietà ${personality.seriousness} · ${readingText} · ${customText}`
}

function syncRealtimeInstructions() {
  if (!state.realtime.connected) {
    updateActiveInstructions('local')
    return false
  }

  if (state.magneticMode || state.wolfMode) {
    updateActiveInstructions('synced')
    return true
  }

  updateActiveInstructions('pending')
  sendRealtimeEvent({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: buildRealtimeSessionInstructions(),
    },
  })
  return true
}

async function testVoiceSettings() {
  const testText =
    'Ciao Filippo. Ho controllato il progetto: il codice ora è pulito, preciso e pronto. Possiamo continuare senza perdere tempo.'
  const testPrompt = state.wolfMode
    ? `Test voce Wolf. Pronuncia integralmente e senza riformulare questo testo, applicando il profilo Wolf soltanto alla resa vocale: ${testText}`
    : `Test completo di voce e personalità. Comunica questi fatti in massimo due frasi, riformulandoli liberamente per rendere MOLTO evidente lo stile selezionato. Non inventare altri fatti. Indicazioni obbligatorie: ${getAccentPrompt()} ${getPersonalityPrompt()} ${getCustomBehaviorPrompt()} Fatti da comunicare: ${testText}`

  if (state.realtime.connected) {
    if (state.realtime.responding) {
      setStatus('Aspetta che finisca la frase Live prima del test.')
      return
    }

    syncRealtimeInstructions()
    state.realtime.isVoiceTest = true
    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: testPrompt,
          },
        ],
      },
    })
    sendRealtimeEvent({type: 'response.create'})
    setStatus('Test voce inviato al motore Live.')
    return
  }

  setStatus('Genero il test con OpenAI TTS.')
  await speak(testText)
  setStatus('Test voce completato.')
}

async function toggleMagneticMode() {
  const wasLive = state.live
  if (wasLive) stopLive()

  if (!state.magneticMode) {
    if (state.wolfMode) {
      const wolfRestore = state.wolfRestore || {}
      state.wolfMode = false
      els.modelProfileSelect.value = wolfRestore.modelProfile || 'economy'
      els.provocationInput.value = wolfRestore.provocation || '10'
      els.sarcasmInput.value = wolfRestore.sarcasm || '8'
      els.seriousnessInput.value = wolfRestore.seriousness || '2'
      els.summaryLengthInput.value = wolfRestore.summaryLength || '8'
      els.liveModeSelect.value = wolfRestore.liveMode || 'summary'
      els.voiceProfileSelect.value = wolfRestore.voiceProfile || 'female'
      state.wolfRestore = null
    }
    state.magneticRestore = {
      modelProfile: els.modelProfileSelect.value,
      provocation: els.provocationInput.value,
      sarcasm: els.sarcasmInput.value,
      seriousness: els.seriousnessInput.value,
      voiceProfile: els.voiceProfileSelect.value,
    }
    state.magneticMode = true
    els.modelProfileSelect.value = 'quality'
    els.provocationInput.value = '10'
    els.sarcasmInput.value = '2'
    els.seriousnessInput.value = '0'
    els.voiceProfileSelect.value = 'female'
  } else {
    const restore = state.magneticRestore || {}
    state.magneticMode = false
    els.modelProfileSelect.value = restore.modelProfile || 'economy'
    els.provocationInput.value = restore.provocation || '10'
    els.sarcasmInput.value = restore.sarcasm || '8'
    els.seriousnessInput.value = restore.seriousness || '2'
    els.voiceProfileSelect.value = restore.voiceProfile || 'female'
    state.magneticRestore = null
  }

  updateModelProfileUI()
  updateCostMonitor()
  updateActiveInstructions('local')
  setButtons()

  if (wasLive) await startLive()
  setStatus(
    state.magneticMode
      ? 'Modalità sexy attiva: qualità voce e seduzione massima.'
      : 'Modalità sexy disattivata. Impostazioni precedenti ripristinate.',
  )
}

async function toggleWolfMode() {
  const wasLive = state.live
  if (wasLive) stopLive()

  if (!state.wolfMode) {
    if (state.magneticMode) {
      const magneticRestore = state.magneticRestore || {}
      state.magneticMode = false
      els.modelProfileSelect.value = magneticRestore.modelProfile || 'economy'
      els.provocationInput.value = magneticRestore.provocation || '10'
      els.sarcasmInput.value = magneticRestore.sarcasm || '8'
      els.seriousnessInput.value = magneticRestore.seriousness || '2'
      els.voiceProfileSelect.value = magneticRestore.voiceProfile || 'female'
      state.magneticRestore = null
    }
    state.wolfRestore = {
      modelProfile: els.modelProfileSelect.value,
      provocation: els.provocationInput.value,
      sarcasm: els.sarcasmInput.value,
      seriousness: els.seriousnessInput.value,
      summaryLength: els.summaryLengthInput.value,
      liveMode: els.liveModeSelect.value,
      voiceProfile: els.voiceProfileSelect.value,
    }
    state.wolfMode = true
    els.modelProfileSelect.value = 'quality'
    els.provocationInput.value = '0'
    els.sarcasmInput.value = '2'
    els.seriousnessInput.value = '10'
    els.summaryLengthInput.value = '0'
    els.liveModeSelect.value = 'read'
    els.voiceProfileSelect.value = 'male'
  } else {
    const restore = state.wolfRestore || {}
    state.wolfMode = false
    els.modelProfileSelect.value = restore.modelProfile || 'economy'
    els.provocationInput.value = restore.provocation || '10'
    els.sarcasmInput.value = restore.sarcasm || '8'
    els.seriousnessInput.value = restore.seriousness || '2'
    els.summaryLengthInput.value = restore.summaryLength || '8'
    els.liveModeSelect.value = restore.liveMode || 'summary'
    els.voiceProfileSelect.value = restore.voiceProfile || 'female'
    state.wolfRestore = null
  }

  updateModelProfileUI()
  updateCostMonitor()
  updateActiveInstructions('local')
  setButtons()

  if (wasLive) await startLive()
  setStatus(
    state.wolfMode
      ? 'Modalità Wolf attiva: calma, precisione e comando.'
      : 'Modalità Wolf disattivata. Impostazioni precedenti ripristinate.',
  )
}

let instructionsUpdateTimer = null
function handleInstructionChange() {
  updateActiveInstructions(state.realtime.connected ? 'pending' : 'local')
  window.clearTimeout(instructionsUpdateTimer)
  instructionsUpdateTimer = window.setTimeout(() => {
    const synced = syncRealtimeInstructions()
    setStatus(
      synced
        ? 'Istruzioni inviate al Live: attive dalla prossima frase.'
        : 'Istruzioni aggiornate: saranno attive dalla prossima lettura.',
    )
  }, 180)
}

function frameDifference(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let total = 0
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i])
  return total / a.length
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function getVideoRect() {
  return els.screenVideo.getBoundingClientRect()
}

function pointFromEvent(event) {
  const rect = getVideoRect()
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  }
}

function updateSelectionBox() {
  if (!state.selection) {
    els.selectionBox.classList.add('hidden')
    return
  }

  const videoRect = getVideoRect()
  const wrapRect = els.previewWrap.getBoundingClientRect()
  const {x, y, w, h} = state.selection

  els.selectionBox.classList.remove('hidden')
  els.selectionBox.style.left = `${videoRect.left - wrapRect.left + x}px`
  els.selectionBox.style.top = `${videoRect.top - wrapRect.top + y}px`
  els.selectionBox.style.width = `${w}px`
  els.selectionBox.style.height = `${h}px`
}

function setSelectionFromPoints(a, b) {
  const rect = getVideoRect()
  const x = clamp(Math.min(a.x, b.x), 0, rect.width)
  const y = clamp(Math.min(a.y, b.y), 0, rect.height)
  const w = clamp(Math.abs(b.x - a.x), 0, rect.width - x)
  const h = clamp(Math.abs(b.y - a.y), 0, rect.height - y)
  state.selection = {x, y, w, h}
  updateSelectionBox()
  setButtons()
}

async function checkBackend() {
  try {
    const res = await fetch('/api/health')
    const json = await res.json()
    if (!json.ok) throw new Error('Backend non pronto')
    if (!json.hasApiKey) {
      setHealth('API key mancante', false, 'Aggiungi OPENAI_API_KEY nel file .env')
    } else {
      const profile = getModelProfile()
      setHealth(
        'Live pronto',
        true,
        `${profile.label} · ${profile.realtimeModel} · voce ${getVoiceProfile().voice}`,
      )
    }
  } catch {
    setHealth('Backend offline', false, 'Avvia npm run dev o controlla la porta')
  }
}

async function shareScreen() {
  try {
    stopLive()
    stopAudio()

    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop())
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 5,
        width: {ideal: 1920},
        height: {ideal: 1080},
      },
      audio: false,
    })

    state.stream = stream
    els.screenVideo.srcObject = stream
    els.emptyPreview.classList.add('hidden')
    state.selection = null
    state.lastRawText = ''
    state.lastSpeakText = ''
    state.spokenHistory = []
    state.lastFrameSignature = null
    els.rawTextBox.textContent = 'Ancora nulla.'

    await els.screenVideo.play()

    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      state.stream = null
      state.selection = null
      stopLive()
      els.emptyPreview.classList.remove('hidden')
      setStatus('Condivisione terminata.')
      setButtons()
      updateSelectionBox()
    })

    setStatus('Ora clicca “Disegna rettangolo” e seleziona solo la chat da leggere.')
    setButtons()
  } catch (error) {
    console.error(error)
    setStatus('Condivisione annullata o non disponibile. Prova da Chrome su localhost.', 'error')
  }
}

function enableSelection() {
  if (!state.stream) return
  state.lastFrameSignature = null
  state.canDrawSelection = true
  setStatus('Trascina con il mouse sulla preview per disegnare il rettangolo della chat.')
  els.previewWrap.classList.add('selecting')
}

function captureSelection() {
  return captureSelectionFrame().image
}

function captureSelectionFrame() {
  if (!state.stream) throw new Error('Prima devi condividere lo schermo.')
  if (!state.selection || state.selection.w < 10 || state.selection.h < 10) {
    throw new Error('Prima devi disegnare un rettangolo valido.')
  }

  const video = els.screenVideo
  const display = getVideoRect()
  const scaleX = video.videoWidth / display.width
  const scaleY = video.videoHeight / display.height

  const sx = Math.round(state.selection.x * scaleX)
  const sy = Math.round(state.selection.y * scaleY)
  const sw = Math.round(state.selection.w * scaleX)
  const sh = Math.round(state.selection.h * scaleY)

  const maxSide = 1400
  const ratio = Math.min(1, maxSide / Math.max(sw, sh))
  const targetW = Math.max(1, Math.round(sw * ratio))
  const targetH = Math.max(1, Math.round(sh * ratio))

  const canvas = els.captureCanvas
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d', {alpha: false})
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH)

  const signatureSize = 18
  const signatureCanvas = document.createElement('canvas')
  signatureCanvas.width = signatureSize
  signatureCanvas.height = signatureSize
  const signatureCtx = signatureCanvas.getContext('2d', {alpha: false, willReadFrequently: true})
  signatureCtx.drawImage(canvas, 0, 0, signatureSize, signatureSize)
  const pixels = signatureCtx.getImageData(0, 0, signatureSize, signatureSize).data
  const signature = []
  for (let i = 0; i < pixels.length; i += 4) {
    signature.push(Math.round((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3))
  }

  return {
    image: canvas.toDataURL('image/jpeg', 0.82),
    signature,
  }
}

async function readOnce({fromLive = false} = {}) {
  if (state.busy) return

  try {
    state.busy = true
    setButtons()
    setStatus(fromLive ? 'Controllo la chat…' : 'Leggo il rettangolo…')

    const image = captureSelection()

    const res = await fetch('/api/read-screen', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        image,
        previousRawText: state.lastRawText,
        language: els.languageSelect.value,
        mode: 'codex-chat',
        personality: getPersonalitySettings(),
        recentSpokenTexts: state.spokenHistory.slice(-8),
        customBehavior: getCustomBehavior(),
        magneticMode: state.magneticMode,
        wolfMode: state.wolfMode,
        visionModel: getModelProfile().visionModel,
      }),
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Errore API')
    addVisionUsage(json.usage)
    if (stopIfBudgetReached()) return

    const rawText = String(json.rawText || '').trim()
    const speakText = cleanConversationalOpening(json.speakText)
    const rawChanged = rawText && canonical(rawText) !== canonical(state.lastRawText)
    const speakChanged = speakText && canonical(speakText) !== canonical(state.lastSpeakText)
    const repeatedSpeech = speakText && isRepeatedSpeech(speakText)

    if (rawText) {
      state.lastRawText = rawText
      els.rawTextBox.textContent = rawText
    }

    if (json.shouldSpeak && speakChanged && rawChanged && !repeatedSpeech) {
      rememberSpoken(speakText)
      logSpoken(speakText)
      setStatus('Nuovo testo trovato. Lo leggo ad alta voce.')
      await speak(speakText)
    } else {
      setStatus('Nessun nuovo testo significativo da leggere.')
    }
  } catch (error) {
    console.error(error)
    setStatus(error.message || 'Errore durante la lettura.', 'error')
  } finally {
    state.busy = false
    setButtons()
  }
}

async function speak(text) {
  stopAudio({keepSpeakingFlag: true})
  state.speaking = true

  try {
    const res = await fetch('/api/speech', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        text,
        personality: getPersonalitySettings(),
        accent: getAccentSettings(),
        voiceProfile: els.voiceProfileSelect.value,
        customBehavior: getCustomBehavior(),
        magneticMode: state.magneticMode,
        wolfMode: state.wolfMode,
      }),
    })

    if (!res.ok) {
      const maybeJson = await res.json().catch(() => ({}))
      throw new Error(maybeJson.error || 'TTS OpenAI non disponibile')
    }

    const blob = await res.blob()
    if (state.lastAudioUrl) URL.revokeObjectURL(state.lastAudioUrl)
    state.lastAudioUrl = URL.createObjectURL(blob)
    const audio = new Audio(state.lastAudioUrl)
    audio.volume = getVolume()
    state.currentAudio = audio
    state.audioPaused = false
    setButtons()

    let ttsCostRecorded = false
    audio.addEventListener(
      'loadedmetadata',
      () => {
        if (ttsCostRecorded) return
        ttsCostRecorded = true
        addTtsEstimate(text, audio.duration)
        stopIfBudgetReached()
      },
      {once: true},
    )

    await new Promise((resolve, reject) => {
      audio.onended = resolve
      audio.onerror = reject
      audio.play().catch(reject)
    })
  } catch (error) {
    console.warn('Fallback TTS browser:', error)
    if (els.browserFallback.checked) {
      await speakWithBrowser(text)
    } else {
      setStatus(error.message || 'Errore audio.', 'error')
    }
  } finally {
    state.speaking = false
    state.currentAudio = null
    state.audioPaused = false
    setButtons()
  }
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang =
      els.languageSelect.value === 'inglese'
        ? 'en-US'
        : els.languageSelect.value === 'spagnolo'
          ? 'es-ES'
          : 'it-IT'
    utterance.rate = 0.98
    utterance.volume = getVolume()
    utterance.onend = resolve
    utterance.onerror = resolve
    window.speechSynthesis.speak(utterance)
  })
}

function stopAudio(options = {}) {
  if (state.currentAudio) {
    const audio = state.currentAudio
    audio.pause()
    audio.currentTime = 0
    audio.onended?.()
  }
  if (state.realtime.audio) {
    state.realtime.audio.pause()
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  state.audioPaused = false
  if (!options.keepSpeakingFlag) state.speaking = false
  setButtons()
}

function toggleAudioPlayback() {
  const shouldPause = !state.audioPaused

  if (state.currentAudio) {
    if (shouldPause) {
      state.currentAudio.pause()
    } else {
      state.currentAudio.play().catch((error) => {
        console.warn('Errore play audio:', error)
      })
    }
  }

  if (state.realtime.audio) {
    if (shouldPause) {
      state.realtime.audio.pause()
    } else {
      state.realtime.audio.play().catch((error) => {
        console.warn('Errore play Realtime:', error)
      })
    }
  }

  if ('speechSynthesis' in window) {
    if (shouldPause) {
      window.speechSynthesis.pause()
    } else {
      window.speechSynthesis.resume()
    }
  }

  state.audioPaused = shouldPause
  setButtons()
}

function resetRealtime() {
  if (state.realtime.dc) {
    state.realtime.dc.close()
  }
  if (state.realtime.pc) {
    state.realtime.pc.getSenders().forEach((sender) => sender.track?.stop())
    state.realtime.pc.close()
  }
  if (state.realtime.audio) {
    state.realtime.audio.pause()
    state.realtime.audio.srcObject = null
    state.realtime.audio.remove()
  }
  state.realtime = {
    pc: null,
    dc: null,
    audio: null,
    connected: false,
    responding: false,
    transcript: '',
    isVoiceTest: false,
  }
  state.audioPaused = false
  updateActiveInstructions('local')
}

function sendRealtimeEvent(event) {
  const dc = state.realtime.dc
  if (!dc || dc.readyState !== 'open') {
    throw new Error('Sessione Realtime non pronta.')
  }
  dc.send(JSON.stringify(event))
}

function handleRealtimeEvent(event) {
  const data = JSON.parse(event.data)

  if (data.type === 'error') {
    console.error('Realtime error:', data)
    setStatus(data.error?.message || 'Errore Realtime.', 'error')
    state.realtime.responding = false
    state.speaking = false
    state.realtime.isVoiceTest = false
    setButtons()
    return
  }

  if (data.type === 'session.updated') {
    updateActiveInstructions('synced')
    if (!state.realtime.responding) {
      setStatus('Live API attivo. Istruzioni sincronizzate per la prossima frase.')
    }
    return
  }

  if (data.type === 'response.created') {
    state.realtime.responding = true
    state.realtime.transcript = ''
    state.speaking = true
    setButtons()
    return
  }

  if (
    data.type === 'response.audio_transcript.delta' ||
    data.type === 'response.output_text.delta'
  ) {
    state.realtime.transcript += data.delta || ''
    return
  }

  if (data.type === 'response.audio_transcript.done' || data.type === 'response.output_text.done') {
    if (data.transcript || data.text) {
      state.realtime.transcript = data.transcript || data.text
    }
    return
  }

  if (data.type === 'response.done') {
    addRealtimeUsage(data.response?.usage)
    if (stopIfBudgetReached()) return
    const spokenText = state.realtime.transcript.trim()
    if (spokenText && !state.realtime.isVoiceTest && !/^nessun nuovo testo\.?$/i.test(spokenText)) {
      rememberSpoken(spokenText)
      logSpoken(spokenText)
      els.rawTextBox.textContent = spokenText
    }
    state.realtime.isVoiceTest = false
    state.realtime.responding = false
    state.speaking = false
    setStatus(
      state.live ? 'Live API attivo. Aspetto nuovo testo nello screenshot.' : 'Live API pronto.',
    )
    setButtons()
  }
}

function waitForIceGathering(pc, timeoutMs = 4000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs)

    function done() {
      window.clearTimeout(timeout)
      pc.removeEventListener('icegatheringstatechange', handleStateChange)
      resolve()
    }

    function handleStateChange() {
      if (pc.iceGatheringState === 'complete') done()
    }

    pc.addEventListener('icegatheringstatechange', handleStateChange)
  })
}

async function connectRealtime() {
  if (state.realtime.connected) return

  if (!('RTCPeerConnection' in window)) {
    throw new Error('WebRTC non disponibile in questo browser.')
  }

  resetRealtime()

  const pc = new RTCPeerConnection()
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.volume = getVolume()
  audio.className = 'hidden'
  document.body.append(audio)

  pc.ontrack = (event) => {
    audio.srcObject = event.streams[0]
  }
  pc.addTransceiver('audio', {direction: 'recvonly'})

  const dc = pc.createDataChannel('oai-events')
  dc.onmessage = handleRealtimeEvent
  dc.onclose = () => {
    state.realtime.connected = false
    state.realtime.responding = false
    state.speaking = false
    setButtons()
  }

  state.realtime.pc = pc
  state.realtime.dc = dc
  state.realtime.audio = audio

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitForIceGathering(pc)

  const localSdp = pc.localDescription?.sdp
  if (!localSdp) throw new Error('Impossibile creare l’offerta audio WebRTC.')

  const realtimeModel = encodeURIComponent(getModelProfile().realtimeModel)
  const magneticMode = state.magneticMode ? '&magneticMode=1' : ''
  const wolfMode = state.wolfMode ? '&wolfMode=1' : ''
  const voiceProfile = encodeURIComponent(els.voiceProfileSelect.value)
  const res = await fetch(`/api/realtime/session?model=${realtimeModel}&voiceProfile=${voiceProfile}${magneticMode}${wolfMode}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/sdp'},
    body: localSdp,
  })

  const answer = await res.text()
  if (!res.ok) {
    let errorMessage = answer
    try {
      const parsed = JSON.parse(answer)
      errorMessage = parsed.error || parsed.detail || answer
    } catch {
      // Keep the SDP/error text as-is.
    }
    throw new Error(errorMessage || 'Errore apertura sessione Realtime.')
  }

  await pc.setRemoteDescription({type: 'answer', sdp: answer})

  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Data channel Realtime non pronto.')),
      10000,
    )
    dc.onopen = () => {
      window.clearTimeout(timeout)
      state.realtime.connected = true
      syncRealtimeInstructions()
      resolve()
    }
  })
}

function makeRealtimePrompt(text) {
  const language = els.languageSelect.value
  const liveMode = els.liveModeSelect.value
  const personality = getPersonalityPrompt()
  const summaryLength = getSummaryLengthPrompt()
  const customBehavior = getCustomBehaviorPrompt()
  const accent = getAccentPrompt()

  if (state.wolfMode) {
    return `
# LETTURA WOLF FEDELE
Pronuncia in ${language} integralmente il contenuto tra i marcatori.

# REGOLE OBBLIGATORIE
- Non riassumere, condensare, spiegare, commentare o riformulare.
- Non omettere fatti o frasi. Mantieni ordine e significato originali.
- Non aggiungere saluti, preamboli, appellativi, battute o conclusioni.
- Applica il carattere Wolf soltanto a voce, ritmo, pause e autorevolezza.
- ${accent}
- ${customBehavior || 'Nessuna istruzione vocale personalizzata aggiuntiva.'}

NUOVO_CONTENUTO_INIZIO
${text}
NUOVO_CONTENUTO_FINE
`.trim()
  }

  if (liveMode === 'summary') {
    return `
# OBIETTIVO
Pronuncia in ${language} esclusivamente la novità qui sotto.

# REGOLE OBBLIGATORIE
- USA SOLTANTO IL CONTENUTO TRA I MARCATORI NUOVO_CONTENUTO.
- Ignora completamente la cronologia della conversazione.
- Non ripetere concetti già pronunciati e non aggiungere preamboli.
- Continua il dialogo senza formule di riapertura: niente saluti, “allora”, nome dell’utente o appellativi all’inizio.
- Ritmo leggermente veloce, parole sempre chiare.
- ${accent}
- ${personality}
- ${summaryLength}
- ${customBehavior || 'Nessuna istruzione aggiuntiva su accento o comportamento.'}
- La direzione personalizzata, se presente, deve risultare chiaramente percepibile nella resa vocale fin dalle prime parole.
- Non aggiungere fatti o dettagli. Una micro-battuta è ammessa solo dentro il limite di parole.

NUOVO_CONTENUTO_INIZIO
${text}
NUOVO_CONTENUTO_FINE
`.trim()
  }

  return `
Pronuncia in ${language} solo questa parte nuova della chat.

Regole obbligatorie:
- USA SOLTANTO IL TESTO TRA I MARCATORI NUOVO_CONTENUTO.
- Ignora completamente la cronologia e non ripetere concetti già pronunciati.
- Puoi riformulare con lo stile scelto, senza preamboli.
- Continua il dialogo senza formule di riapertura: niente saluti, “allora”, nome dell’utente o appellativi all’inizio.
- Ritmo leggermente veloce, parole sempre chiare.
- ${accent}
- ${personality}
- ${customBehavior || 'Nessuna istruzione aggiuntiva su accento o comportamento.'}
- La direzione personalizzata, se presente, deve risultare chiaramente percepibile nella resa vocale fin dalle prime parole.
- Non inventare fatti. Se i parametri sono alti, rendi il tono davvero sassy/provocante, non appena accennato.

NUOVO_CONTENUTO_INIZIO
${text}
NUOVO_CONTENUTO_FINE
`.trim()
}

async function readRealtimeFrame() {
  if (!state.live || state.realtime.responding || state.busy) return

  try {
    state.busy = true
    setButtons()
    let frame = captureSelectionFrame()
    const difference = frameDifference(frame.signature, state.lastFrameSignature)
    if (difference < 2.8) {
      setStatus('Live API attivo. Il ritaglio non e cambiato, non ripeto.')
      return
    }
    setStatus('La chat è cambiata. Aspetto che il testo si stabilizzi…')
    await new Promise((resolve) => window.setTimeout(resolve, 1100))
    if (!state.live) return

    const stableFrame = captureSelectionFrame()
    if (frameDifference(frame.signature, stableFrame.signature) > 1.2) {
      setStatus('Il testo sta ancora cambiando. Rimando il controllo per risparmiare.')
      return
    }
    frame = stableFrame
    state.lastFrameSignature = frame.signature

    const res = await fetch('/api/read-screen', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        image: frame.image,
        previousRawText: state.lastRawText,
        language: els.languageSelect.value,
        mode: els.liveModeSelect.value === 'summary' ? 'codex-chat-summary' : 'codex-chat',
        summaryLength: getSummaryLength(),
        personality: getPersonalitySettings(),
        recentSpokenTexts: state.spokenHistory.slice(-8),
        customBehavior: getCustomBehavior(),
        magneticMode: state.magneticMode,
        wolfMode: state.wolfMode,
        visionModel: getModelProfile().visionModel,
      }),
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Errore lettura live')
    addVisionUsage(json.usage)
    if (stopIfBudgetReached()) return

    const rawText = String(json.rawText || '').trim()
    const speakText = cleanConversationalOpening(json.speakText)
    const rawChanged = rawText && canonical(rawText) !== canonical(state.lastRawText)
    const speakChanged = speakText && canonical(speakText) !== canonical(state.lastSpeakText)
    const repeatedSpeech = speakText && isRepeatedSpeech(speakText)

    if (rawText) {
      state.lastRawText = rawText
      els.rawTextBox.textContent = rawText
    }

    if (!json.shouldSpeak || !speakText || !rawChanged || !speakChanged || repeatedSpeech) {
      setStatus('Live API attivo. Nessun testo nuovo da dire.')
      return
    }

    rememberSpoken(speakText)
    state.realtime.isVoiceTest = false
    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{type: 'input_text', text: makeRealtimePrompt(speakText)}],
      },
    })
    sendRealtimeEvent({type: 'response.create'})
    setStatus('Live API: nuovo testo trovato, lo dico adesso.')
  } catch (error) {
    console.error(error)
    setStatus(error.message || 'Errore durante il live Realtime.', 'error')
  } finally {
    state.busy = false
    setButtons()
  }
}

async function startLive() {
  if (state.live) return
  if (isCostBudgetReached()) {
    setStatus('Il limite di spesa è già raggiunto. Azzera la stima o aumenta il limite.', 'error')
    return
  }
  try {
    state.live = true
    setStatus('Apro sessione Live API…')
    setButtons()
    await connectRealtime()

    const interval = Math.max(3000, Number(els.intervalInput.value || DEFAULT_INTERVAL))
    setStatus('Live API attivo. Leggo quando trovo testo nuovo.')
    await readRealtimeFrame()
    state.timer = window.setInterval(readRealtimeFrame, interval)
  } catch (error) {
    console.error(error)
    stopLive()
    setStatus(error.message || 'Errore durante l avvio Live API.', 'error')
  }
}

function stopLive() {
  if (state.timer) window.clearInterval(state.timer)
  state.timer = null
  state.live = false
  resetRealtime()
  setButtons()
}

function clearAll() {
  state.lastRawText = ''
  state.lastSpeakText = ''
  state.spokenHistory = []
  state.lastFrameSignature = null
  els.rawTextBox.textContent = 'Ancora nulla.'
  els.spokenLog.innerHTML = ''
  setStatus('Memoria pulita. La prossima lettura riparte da zero.')
}

els.shareBtn.addEventListener('click', shareScreen)
els.selectBtn.addEventListener('click', enableSelection)
els.readOnceBtn.addEventListener('click', () => readOnce())
els.liveBtn.addEventListener('click', startLive)
els.stopLiveBtn.addEventListener('click', () => {
  stopLive()
  setStatus('Live fermato.')
})
els.testVoiceBtn.addEventListener('click', () => {
  testVoiceSettings().catch((error) => {
    console.error(error)
    setStatus(error.message || 'Errore durante il test voce.', 'error')
  })
})
els.magneticModeToggle.addEventListener('change', () => {
  toggleMagneticMode().catch((error) => {
    console.error(error)
    setStatus(error.message || 'Errore durante il cambio modalità.', 'error')
  })
})
els.wolfModeToggle.addEventListener('change', () => {
  toggleWolfMode().catch((error) => {
    console.error(error)
    setStatus(error.message || 'Errore durante il cambio modalità Wolf.', 'error')
  })
})
els.playPauseBtn.addEventListener('click', () => {
  toggleAudioPlayback()
  setStatus(state.audioPaused ? 'Audio in pausa.' : 'Audio ripreso.')
})
els.stopAudioBtn.addEventListener('click', () => {
  stopAudio()
  setStatus('Audio fermato.')
})
els.clearBtn.addEventListener('click', clearAll)
els.resetCostsBtn.addEventListener('click', () => {
  resetCostMonitor()
  setStatus('Stima costi azzerata.')
})
els.modelProfileSelect.addEventListener('change', () => {
  updateModelProfileUI()
  updateActiveInstructions('local')
  updateCostMonitor()
  checkBackend()
  setStatus(`Profilo ${getModelProfile().label} selezionato. Sarà usato dalla prossima chiamata.`)
})
els.voiceProfileSelect.addEventListener('change', () => {
  updateActiveInstructions('local')
  checkBackend()
  setStatus(`Voce ${getVoiceProfile().label} selezionata. Sarà usata dalla prossima riproduzione.`)
})
els.costBudgetInput.addEventListener('input', updateCostMonitor)
els.autoPauseCosts.addEventListener('change', updateCostMonitor)
els.volumeInput.addEventListener('input', applyVolume)
els.personalityPresetSelect.addEventListener('change', () => {
  const preset = personalityPresets.find((item) => item.id === els.personalityPresetSelect.value)
  els.deletePersonalityBtn.disabled = !preset
  if (!preset) {
    els.personalityNameInput.value = ''
    return
  }
  applyPersonalityPreset(preset)
  setStatus(`Personalità “${preset.name}” attiva dalla prossima frase.`)
})
els.savePersonalityBtn.addEventListener('click', savePersonalityPreset)
els.deletePersonalityBtn.addEventListener('click', deleteSelectedPersonality)

;[
  els.languageSelect,
  els.accentSelect,
  els.accentIntensityInput,
  els.liveModeSelect,
  els.provocationInput,
  els.sarcasmInput,
  els.seriousnessInput,
  els.summaryLengthInput,
  els.customBehaviorInput,
].forEach((control) => {
  control.addEventListener('input', handleInstructionChange)
  control.addEventListener('change', handleInstructionChange)
})

els.volumeInput.addEventListener('input', () => {
  updateActiveInstructions(state.realtime.connected ? 'synced' : 'local')
})

els.previewWrap.addEventListener('mousedown', (event) => {
  if (!state.canDrawSelection || !state.stream) return
  event.preventDefault()
  state.selecting = true
  state.dragStart = pointFromEvent(event)
  setSelectionFromPoints(state.dragStart, state.dragStart)
})

window.addEventListener('mousemove', (event) => {
  if (!state.selecting || !state.dragStart) return
  setSelectionFromPoints(state.dragStart, pointFromEvent(event))
})

window.addEventListener('mouseup', () => {
  if (!state.selecting) return
  state.selecting = false
  state.canDrawSelection = false
  els.previewWrap.classList.remove('selecting')

  if (state.selection && state.selection.w > 10 && state.selection.h > 10) {
    setStatus('Rettangolo selezionato. Ora puoi fare “Leggi una volta” o “Avvia live”.')
  } else {
    state.selection = null
    setStatus('Rettangolo troppo piccolo. Riprova.')
  }
  updateSelectionBox()
  setButtons()
})

window.addEventListener('resize', updateSelectionBox)

checkBackend()
setButtons()
updateModelProfileUI()
renderPersonalityPresets()
updateActiveInstructions()
updateCostMonitor()
