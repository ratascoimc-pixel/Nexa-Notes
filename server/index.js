import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import OpenAI from 'openai';

fs.mkdirSync('uploads', { recursive: true });
const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 25 * 1024 * 1024 } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'nexa-notes-api' }));

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).send('OPENAI_API_KEY is not configured on the server.');
    if (!req.file) return res.status(400).send('Missing audio');
    const previous = String(req.body.previousContext || '').slice(-1200);
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'gpt-transcribe',
      prompt: previous ? `This is the next segment of one continuous recording. Use this prior ending only for continuity of names and phrasing: ${previous}` : undefined,
    });
    res.json({ text: result.text || '' });
  } catch (e) {
    console.error(e);
    res.status(500).send(e?.message || 'Transcription failed');
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

function parseJson(text) {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  throw new Error('The study-note model returned invalid JSON. Please try again.');
}

function normalizeNotes(value, fallbackTitle) {
  const arr = (v) => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  return {
    title: String(value?.title || fallbackTitle || 'Study Notes'),
    mainTheme: String(value?.mainTheme || ''),
    keyPoints: arr(value?.keyPoints),
    references: arr(value?.references),
    illustrations: arr(value?.illustrations),
    application: arr(value?.application),
    reviewQuestions: arr(value?.reviewQuestions),
    summary: String(value?.summary || ''),
  };
}

app.post('/study-notes', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).send('OPENAI_API_KEY is not configured on the server.');
    const { transcript, title } = req.body || {};
    if (!transcript) return res.status(400).send('Transcript required');
    const response = await openai.responses.create({
      model: process.env.NOTES_MODEL || 'gpt-5-mini',
      input: [
        { role: 'system', content: 'Turn the supplied transcript into accurate, useful study notes. Never invent a quote, scripture, source, person, date, or factual detail that is not supported by the transcript. Return ONLY one valid JSON object with these exact keys: title (string), mainTheme (string), keyPoints (array of strings), references (array of strings), illustrations (array of strings), application (array of strings), reviewQuestions (array of strings), summary (string).' },
        { role: 'user', content: `Title: ${title || 'Untitled'}\n\nTranscript:\n${transcript}` },
      ],
    });
    res.json(normalizeNotes(parseJson(response.output_text), title));
  } catch (e) {
    console.error(e);
    res.status(500).send(e?.message || 'Study note generation failed');
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, '0.0.0.0', () => console.log(`Nexa Notes API running on ${port}`));
