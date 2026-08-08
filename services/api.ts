import { NexaRecording, StudyNotes } from '../types';

const API = process.env.EXPO_PUBLIC_API_BASE_URL;

function requireApi() {
  if (!API) throw new Error('Nexa Notes transcription service is not configured yet.');
  return API.replace(/\/$/, '');
}

export async function checkApi(): Promise<boolean> {
  try {
    const response = await fetch(`${requireApi()}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function transcribeRecording(recording: NexaRecording): Promise<string> {
  const base = requireApi();
  const parts: string[] = [];

  for (let i = 0; i < recording.segmentUris.length; i += 1) {
    const uri = recording.segmentUris[i];
    const form = new FormData();
    form.append('audio', {
      uri,
      name: `nexa-${recording.id}-${i + 1}.m4a`,
      type: 'audio/mp4',
    } as any);
    form.append('part', String(i + 1));
    form.append('totalParts', String(recording.segmentUris.length));
    if (parts.length) form.append('previousContext', parts[parts.length - 1].slice(-1200));

    const response = await fetch(`${base}/transcribe`, { method: 'POST', body: form });
    if (!response.ok) throw new Error((await response.text()) || `Transcription failed on part ${i + 1}.`);
    const data = await response.json();
    parts.push(String(data.text || '').trim());
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
