import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';

const UPLOAD_DIR = path.resolve('uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function audioExtension(file) {
  const original = path.extname(file.originalname || '').toLowerCase();
  if (['.m4a', '.mp3', '.wav', '.webm', '.mp4', '.mpeg', '.mpga', '.ogg', '.flac'].includes(original)) return original;
  const mime = String(file.mimetype || '').toLowerCase();
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('flac')) return '.flac';
  return '.m4a';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomUUID()}${audioExtension(file)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'nexa-notes-api', jobs: true }));

function requireKey(res) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).send('OPENAI_API_KEY is not configured on the server.');
    return false;
  }
  return true;
}

async function withRetry(fn, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await fn(); } catch (error) {
      last = error;
      const status = Number(error?.status || 0);
      const retryable = !status || status === 408 || status === 409 || status === 429 || status >= 500;
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 900 * (2 ** (attempt - 1))));
    }
  }
  throw last;
}

// Backward-compatible endpoint for already-installed older betas.
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!requireKey(res)) return;
    if (!req.file) return res.status(400).send('Missing audio');
    const previous = String(req.body.previousContext || '').slice(-1200);
    const result = await withRetry(() => openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'gpt-transcribe',
      prompt: previous ? `This is the next segment of one continuous recording. Use this prior ending only for continuity of names and phrasing: ${previous}` : undefined,
    }));
    res.json({ text: result.text || '' });
  } catch (e) {
    console.error(e);
    res.status(Number(e?.status) || 500).send(e?.message || 'Transcription failed');
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

const transcriptionJobs = new Map();

function publicTranscriptionJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    totalParts: job.totalParts,
    uploadedParts: job.parts.filter(Boolean).length,
    completedParts: job.completedParts || 0,
    currentPart: job.currentPart || undefined,
    transcript: job.status === 'completed' ? job.transcript : undefined,
    error: job.error,
  };
}

app.post('/transcription-jobs', (req, res) => {
  if (!requireKey(res)) return;
  const totalParts = Math.max(1, Math.min(100, Number(req.body?.totalParts || 0)));
  if (!Number.isFinite(totalParts) || totalParts < 1) return res.status(400).send('totalParts must be at least 1.');
  const jobId = randomUUID();
  const job = {
    jobId,
    recordingId: String(req.body?.recordingId || ''),
    title: String(req.body?.title || 'Recording'),
    totalParts,
    parts: new Array(totalParts),
    completedParts: 0,
    currentPart: 0,
    status: 'uploading',
    started: false,
    createdAt: Date.now(),
  };
  transcriptionJobs.set(jobId, job);
  res.status(201).json(publicTranscriptionJob(job));
});

app.post('/transcription-jobs/:jobId/parts/:part', upload.single('audio'), (req, res) => {
  const job = transcriptionJobs.get(req.params.jobId);
  const part = Number(req.params.part);
  if (!job || !Number.isInteger(part) || part < 1 || part > job.totalParts) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(404).send('Transcription job or part was not found.');
  }
  if (!req.file) return res.status(400).send('Missing audio');
  const previous = job.parts[part - 1];
  if (previous?.path && previous.path !== req.file.path) fs.unlink(previous.path, () => {});
  job.parts[part - 1] = { path: req.file.path, originalName: req.file.originalname, mime: req.file.mimetype };
  job.updatedAt = Date.now();
  const uploadedParts = job.parts.filter(Boolean).length;
  res.status(201).json({ ok: true, part, uploadedParts, totalParts: job.totalParts });
  if (uploadedParts === job.totalParts && !job.started) startTranscriptionJob(job);
});

app.get('/transcription-jobs/:jobId', (req, res) => {
  const job = transcriptionJobs.get(req.params.jobId);
  if (!job) return res.status(404).send('This transcription job is no longer available. Tap Transcribe Again to retry.');
  res.json(publicTranscriptionJob(job));
});

function startTranscriptionJob(job) {
  if (job.started) return;
  job.started = true;
  job.status = 'queued';
  setImmediate(async () => {
    const textParts = [];
    try {
      job.status = 'transcribing';
      for (let index = 0; index < job.parts.length; index += 1) {
        job.currentPart = index + 1;
        const previous = textParts.length ? textParts[textParts.length - 1].slice(-1200) : '';
        const result = await withRetry(() => openai.audio.transcriptions.create({
          file: fs.createReadStream(job.parts[index].path),
          model: 'gpt-transcribe',
          prompt: previous ? `This is segment ${index + 1} of one continuous recording. Use this prior ending only for continuity of names and phrasing: ${previous}` : undefined,
        }));
        textParts.push(String(result.text || '').trim());
        job.completedParts = index + 1;
      }
      job.transcript = textParts.filter(Boolean).join('\n\n');
      job.status = 'completed';
      job.currentPart = 0;
      job.completedAt = Date.now();
    } catch (error) {
      console.error('Background transcription failed', error);
      job.status = 'error';
      job.error = error?.message || 'Transcription failed.';
    } finally {
      for (const part of job.parts) if (part?.path) fs.unlink(part.path, () => {});
    }
  });
}

function parseJson(text) {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  throw new Error('The organization model returned invalid JSON. Please try again.');
}

const organizationJobs = new Map();
const allowedModes = new Set(['study-notes', 'detailed-notes', 'outline', 'summary', 'key-points', 'flashcards']);

function modeInstructions(mode) {
  const instructions = {
    'study-notes': 'Create study notes with the main theme, important points, references mentioned, illustrations/examples, practical application, and review questions.',
    'detailed-notes': 'Create thorough chronological notes that follow the transcript from beginning to end, preserving the speaker’s progression and important details.',
    outline: 'Create a clean hierarchical outline with major headings, subpoints, supporting details, and references. Make the structure easy to scan.',
    summary: 'Create a concise but substantial summary, followed by the most important conclusions and takeaways.',
    'key-points': 'Extract the strongest key points, memorable ideas, references, examples, conclusions, and action items without unnecessary detail.',
    flashcards: 'Create useful question-and-answer flashcards for review. Group related cards into logical sections.',
  };
  return instructions[mode] || instructions['study-notes'];
}

function normalizeDocument(value, fallbackTitle, mode) {
  const sections = Array.isArray(value?.sections) ? value.sections.map((section) => ({
    heading: String(section?.heading || 'Section'),
    body: section?.body ? String(section.body) : '',
    items: Array.isArray(section?.items) ? section.items.map(String).filter(Boolean) : [],
    qa: Array.isArray(section?.qa) ? section.qa.map((x) => ({ question: String(x?.question || ''), answer: String(x?.answer || '') })).filter((x) => x.question || x.answer) : [],
  })) : [];
  return {
    title: String(value?.title || fallbackTitle || 'Nexa Notes'),
    mode,
    summary: String(value?.summary || ''),
    sections,
  };
}

app.post('/organization-jobs', (req, res) => {
  if (!requireKey(res)) return;
  const transcript = String(req.body?.transcript || '');
  const title = String(req.body?.title || 'Untitled');
  const mode = allowedModes.has(req.body?.mode) ? req.body.mode : 'study-notes';
  if (!transcript.trim()) return res.status(400).send('Transcript required');
  const jobId = randomUUID();
  const job = { jobId, status: 'queued', title, transcript, mode, createdAt: Date.now() };
  organizationJobs.set(jobId, job);
  res.status(202).json({ jobId, status: job.status, mode });
  setImmediate(() => processOrganizationJob(job));
});

app.get('/organization-jobs/:jobId', (req, res) => {
  const job = organizationJobs.get(req.params.jobId);
  if (!job) return res.status(404).send('This organization job is no longer available. Please create it again.');
  res.json({ jobId: job.jobId, status: job.status, mode: job.mode, document: job.status === 'completed' ? job.document : undefined, error: job.error });
});

async function processOrganizationJob(job) {
  try {
    job.status = 'organizing';
    const response = await withRetry(() => openai.responses.create({
      model: process.env.NOTES_MODEL || 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: `Organize the supplied transcript accurately. Never invent a quote, scripture, source, person, date, or factual detail not supported by the transcript. ${modeInstructions(job.mode)} Return ONLY one valid JSON object with these exact keys: title (string), summary (string), sections (array). Each section must have heading (string), body (string), items (array of strings), qa (array of objects with question and answer strings).`,
        },
        { role: 'user', content: `Title: ${job.title}\nOrganization mode: ${job.mode}\n\nTranscript:\n${job.transcript}` },
      ],
    }));
    job.document = normalizeDocument(parseJson(response.output_text), job.title, job.mode);
    job.status = 'completed';
  } catch (error) {
    console.error('Background organization failed', error);
    job.status = 'error';
    job.error = error?.message || 'Organization failed.';
  } finally {
    delete job.transcript;
  }
}

// Keep legacy endpoint available for an older installed beta.
app.post('/study-notes', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const transcript = String(req.body?.transcript || '');
    const title = String(req.body?.title || 'Untitled');
    if (!transcript) return res.status(400).send('Transcript required');
    const response = await withRetry(() => openai.responses.create({
      model: process.env.NOTES_MODEL || 'gpt-5-mini',
      input: [
        { role: 'system', content: 'Turn the supplied transcript into accurate, useful study notes. Never invent facts. Return ONLY JSON with: title, mainTheme, keyPoints, references, illustrations, application, reviewQuestions, summary.' },
        { role: 'user', content: `Title: ${title}\n\nTranscript:\n${transcript}` },
      ],
    }));
    res.json(parseJson(response.output_text));
  } catch (e) {
    console.error(e);
    res.status(Number(e?.status) || 500).send(e?.message || 'Study note generation failed');
  }
});

// Clean completed/failed in-memory jobs after 12 hours.
setInterval(() => {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  for (const [id, job] of transcriptionJobs) {
    if ((job.completedAt || job.createdAt) < cutoff && ['completed', 'error'].includes(job.status)) transcriptionJobs.delete(id);
  }
  for (const [id, job] of organizationJobs) {
    if (job.createdAt < cutoff && ['completed', 'error'].includes(job.status)) organizationJobs.delete(id);
  }
}, 30 * 60 * 1000).unref();

const port = Number(process.env.PORT || 8787);
app.listen(port, '0.0.0.0', () => console.log(`Nexa Notes API running on ${port}`));
