import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: true }));
app.use(express.json({ limit: '18mb' }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'coral';
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1';
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || TTS_VOICE;
const TTS_INSTRUCTIONS = [
  'Parla in italiano con una voce femminile adulta, naturale, calda e chiara.',
  'Usa un ritmo leggermente piu veloce del parlato calmo, senza mangiare le parole.',
  'Mantieni un tono amichevole, luminoso, complice e incoraggiante.',
  'Suona come una partner tecnica simpatica che mi aiuta mentre programmo: presente, sorridente, sempre utile.',
  'Non teatralizzare e non distrarti dal contenuto tecnico da leggere.'
].join(' ');
const REALTIME_INSTRUCTIONS = [
  'Sei un lettore live per una zona dello schermo selezionata dall utente.',
  'La zona contiene probabilmente una chat tecnica di Codex dentro VS Code.',
  'Quando ricevi uno screenshot, leggi solo il testo nuovo e significativo della chat.',
  'Ignora barre, pulsanti, sidebar, header, tooltip e testo di interfaccia.',
  'Se non c e niente di nuovo, rispondi solo: nessun nuovo testo.',
  'Parla in italiano con voce femminile adulta, naturale, sorridente e luminosa.',
  'Usa un ritmo vivace, circa il 15 percento piu veloce di un parlato calmo, ma resta sempre comprensibile.',
  'Suona complice, giocosa e leggermente flirtante, come una partner tecnica simpatica che mi aiuta.',
  'Resta sempre utile, mai esplicita e mai teatrale.'
].join(' ');

function clampNumber(value, min = 0, max = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function buildPersonalityInstructions(personality = {}) {
  const provocation = clampNumber(personality.provocation);
  const sarcasm = clampNumber(personality.sarcasm);
  const seriousness = clampNumber(personality.seriousness);
  const tone = [];

  if (provocation <= 2) {
    tone.push('Provocazione bassa: tono dolce, professionale e amichevole.');
  } else if (provocation <= 6) {
    tone.push('Provocazione media: tono caldo, complice e leggermente flirtante.');
  } else {
    tone.push('Provocazione alta: tono audace, giocoso e provocante in modo elegante, mai esplicito.');
  }

  if (sarcasm <= 2) {
    tone.push('Sarcasmo basso: niente battute taglienti, resta morbida.');
  } else if (sarcasm <= 6) {
    tone.push('Sarcasmo medio: usa micro-battute leggere quando naturale.');
  } else {
    tone.push('Sarcasmo alto: puoi essere pungente e ironica, ma mai cattiva o distraente.');
  }

  if (seriousness <= 2) {
    tone.push('Serieta bassa: piu giocosa e rilassata.');
  } else if (seriousness <= 6) {
    tone.push('Serieta media: bilancia gioco e precisione tecnica.');
  } else {
    tone.push('Serieta alta: priorita a chiarezza, precisione e utilita.');
  }

  tone.push('Resta sempre utile, chiara, non esplicita e concentrata sul lavoro.');
  return tone.join(' ');
}

function buildTtsInstructions(personality = {}) {
  return [
    TTS_INSTRUCTIONS,
    buildPersonalityInstructions(personality)
  ].join(' ');
}

function requireApiKey(res) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('INSERISCI')) {
    res.status(500).json({
      error: 'OPENAI_API_KEY mancante. Copia .env.example in .env e inserisci la tua chiave.'
    });
    return false;
  }
  return true;
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;

  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonLoose(text) {
  if (!text) throw new Error('Risposta vuota dal modello.');

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('JSON non valido dal modello.');
  }
}

function normalizeString(value, max = 12000) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

function clampSpeakText(value) {
  const text = normalizeString(value, 1800);
  if (text.length <= 1600) return text;
  return `${text.slice(0, 1550).replace(/\s+\S*$/, '')}…`;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('INSERISCI')),
    visionModel: VISION_MODEL,
    ttsModel: TTS_MODEL,
    ttsVoice: TTS_VOICE,
    realtimeModel: REALTIME_MODEL,
    realtimeVoice: REALTIME_VOICE
  });
});

app.post('/api/realtime/session', express.text({ type: 'application/sdp', limit: '2mb' }), async (req, res) => {
  try {
    if (!requireApiKey(res)) return;
    if (!req.body) return res.status(400).json({ error: 'SDP mancante.' });

    const sessionConfig = JSON.stringify({
      type: 'realtime',
      model: REALTIME_MODEL,
      output_modalities: ['audio'],
      instructions: REALTIME_INSTRUCTIONS,
      audio: {
        output: {
          voice: REALTIME_VOICE
        }
      }
    });

    const form = new FormData();
    form.set('sdp', req.body);
    form.set('session', sessionConfig);

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Safety-Identifier': 'local-vibe-screen-reader'
      },
      body: form
    });

    const sdp = await response.text();
    if (!response.ok) {
      console.error('Errore /api/realtime/session:', response.status, sdp);
      return res.status(response.status).json({
        error: 'Errore durante la creazione della sessione Realtime.',
        detail: sdp
      });
    }

    res.type('application/sdp').send(sdp);
  } catch (error) {
    console.error('Errore /api/realtime/session:', error);
    res.status(500).json({
      error: error?.message || 'Errore durante la creazione della sessione Realtime.'
    });
  }
});

app.post('/api/read-screen', async (req, res) => {
  try {
    if (!requireApiKey(res)) return;

    const image = normalizeString(req.body?.image, 16_000_000);
    const previousRawText = normalizeString(req.body?.previousRawText, 12000);
    const language = normalizeString(req.body?.language, 30) || 'italiano';
    const mode = normalizeString(req.body?.mode, 40) || 'codex-chat';
    const wantsSummary = mode.includes('summary');

    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Immagine mancante o non valida.' });
    }

    const prompt = `
Sei il lettore vocale di una zona dello schermo selezionata dall'utente.
La zona contiene probabilmente la chat di Codex dentro VS Code.

Obiettivo:
1. Leggi dall'immagine SOLO il testo significativo della chat.
2. Ignora pulsanti, icone, sidebar, titoli ripetuti, placeholder, scrollbar, tooltip e testi di interfaccia non utili.
3. Escludi i messaggi scritti dall'utente: prompt, richieste, comandi, frasi in prima persona o blocchi che sembrano input umano.
4. Tieni solo risposte, aggiornamenti, spiegazioni, errori o risultati prodotti da Codex/assistant.
5. Confronta quel testo filtrato con "previous_raw_text" e individua solo la parte nuova.
6. ${wantsSummary ? `Prepara un riassunto breve in ${language} SOLO della parte nuova prodotta da Codex/assistant.` : `Prepara una frase naturale da leggere ad alta voce in ${language} SOLO con la parte nuova prodotta da Codex/assistant.`}

Modalità: ${mode}

Regole per la voce:
- Se non c'è testo nuovo significativo, should_speak deve essere false e speak_text vuoto.
- Non rileggere testo già presente in previous_raw_text.
- Non leggere mai il testo scritto dall'utente, anche se e nuovo.
- Se vedi una coppia domanda/risposta, ignora la domanda e considera solo la risposta.
- Se non sei sicuro che un testo sia dell'assistente, preferisci ignorarlo.
- ${wantsSummary ? 'Non leggere alla lettera: spiega in massimo 2 frasi cosa e cambiato o cosa e importante nel testo nuovo.' : 'Se il nuovo testo è una spiegazione, leggila in modo naturale.'}
- Se il nuovo testo contiene molto codice, NON leggere ogni riga: fai un riassunto breve e utile.
- Se il testo è parziale, tagliato o ancora in caricamento, leggi solo ciò che sembra stabile.
- ${wantsSummary ? 'Massimo 2 frasi.' : 'Massimo 5 frasi, meglio 1-3 frasi.'}
- Niente markdown nella voce.

Rispondi SOLO con JSON valido, senza blocchi markdown, con queste chiavi:
{
  "raw_text": "solo il testo significativo visibile prodotto da Codex/assistant, ricostruito in ordine, senza messaggi dell'utente",
  "new_text": "solo il testo nuovo rispetto a previous_raw_text",
  "speak_text": "testo breve e naturale da leggere ad alta voce",
  "should_speak": true
}

previous_raw_text:
${previousRawText || '(vuoto)'}
`.trim();

    const response = await openai.responses.create({
      model: VISION_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image, detail: 'low' }
          ]
        }
      ],
      temperature: 0
    });

    const outputText = extractOutputText(response);
    let parsed;
    try {
      parsed = parseJsonLoose(outputText);
    } catch {
      parsed = {
        raw_text: outputText,
        new_text: outputText,
        speak_text: outputText,
        should_speak: Boolean(outputText?.trim())
      };
    }

    const rawText = normalizeString(parsed.raw_text, 12000);
    const newText = normalizeString(parsed.new_text, 5000);
    const speakText = clampSpeakText(parsed.speak_text);
    const shouldSpeak = Boolean(parsed.should_speak && speakText);

    res.json({
      rawText,
      newText,
      speakText,
      shouldSpeak,
      model: VISION_MODEL
    });
  } catch (error) {
    console.error('Errore /api/read-screen:', error);
    res.status(500).json({
      error: error?.message || 'Errore durante la lettura dello schermo.'
    });
  }
});

app.post('/api/speech', async (req, res) => {
  try {
    if (!requireApiKey(res)) return;

    const text = clampSpeakText(req.body?.text);
    const personality = typeof req.body?.personality === 'object' && req.body.personality ? req.body.personality : {};
    if (!text) return res.status(400).json({ error: 'Testo mancante.' });

    const audio = await openai.audio.speech.create({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      instructions: buildTtsInstructions(personality),
      response_format: 'mp3'
    });

    const buffer = Buffer.from(await audio.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    console.error('Errore /api/speech:', error);
    res.status(500).json({
      error: error?.message || 'Errore durante la generazione audio.'
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, '127.0.0.1', () => {
  console.log(`API pronta su http://127.0.0.1:${port}`);
});
