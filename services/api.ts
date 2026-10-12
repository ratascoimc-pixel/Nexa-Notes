import { NotzRecording, OrganizedDocument, OrganizationMode, StudyNotes } from '../types';

const API = process.env.EXPO_PUBLIC_API_BASE_URL;

function requireApi() {
  if (!API) throw new Error('Notz transcription service is not configured yet.');
  return API.replace(/\/$/, '');
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function checkApi(): Promise<boolean> {
  try {
    const response = await fetch(`${requireApi()}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function transcribeRecording(
  recording: NotzRecording,
  onProgress?: (parts: { uri: string; text: string }[]) => Promise<void>,
): Promise<string> {
  const base = requireApi();
  const parts: string[] = [];
  const completed: { uri: string; text: string }[] = [];

  // Keep the proven v1.4-compatible endpoint for maximum reliability with the existing backend.
  for (let i = 0; i < recording.segmentUris.length; i += 1) {
    const uri = recording.segmentUris[i];
    const saved = recording.transcriptionParts?.[i];
    if (saved?.uri === uri) {
      parts.push(saved.text);
      completed.push(saved);
      continue;
    }
    const form = new FormData();
    form.append('audio', {
      uri,
      name: `notz-${recording.id}-${i + 1}.m4a`,
      type: 'audio/mp4',
    } as any);
    form.append('part', String(i + 1));
    form.append('totalParts', String(recording.segmentUris.length));
    if (parts.length) form.append('previousContext', parts[parts.length - 1].slice(-1200));

    const response = await fetch(`${base}/transcribe`, { method: 'POST', body: form });
    if (!response.ok) throw new Error((await response.text()) || `Transcription failed on part ${i + 1}.`);
    const data = await response.json();
    if (typeof data.text !== 'string') throw new Error(`Invalid transcription response on part ${i + 1}.`);
    const text = data.text.trim();
    parts.push(text);
    completed.push({ uri, text });
    if (onProgress) await onProgress([...completed]);
  }
  return parts.filter(Boolean).join('\n\n');
}

export async function generateStudyNotes(transcript: string, title: string): Promise<StudyNotes> {
  const base = requireApi();
  const response = await fetch(`${base}/study-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, title }),
  });
  if (!response.ok) throw new Error((await response.text()) || 'Study note generation failed');
  return response.json();
}

export async function generateOrganizedDocument(
  transcript: string,
  title: string,
  mode: OrganizationMode,
): Promise<OrganizedDocument> {
  const base = requireApi();
  const response = await fetch(`${base}/organization-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, title, mode }),
  });
  if (!response.ok) throw new Error((await response.text()) || 'Could not start organization job.');
  const created = await response.json();
  const jobId = String(created.jobId || '');
  if (!jobId) throw new Error('The organization service did not return a job ID.');

  for (let attempt = 0; attempt < 240; attempt += 1) {
    await wait(1500);
    const statusResponse = await fetch(`${base}/organization-jobs/${encodeURIComponent(jobId)}`);
    if (!statusResponse.ok) throw new Error((await statusResponse.text()) || 'Could not check organization progress.');
    const job = await statusResponse.json();
    if (job.status === 'completed' && job.document) return job.document as OrganizedDocument;
    if (job.status === 'error') throw new Error(job.error || 'Organization failed.');
  }
  throw new Error('Organization is taking longer than expected. Please try again.');
}
