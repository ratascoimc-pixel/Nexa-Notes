import * as FileSystem from 'expo-file-system/legacy';
import { NotzRecording, OrganizationMode } from '../types';

// Keep the legacy database filename so an in-place app upgrade keeps existing recordings.
const DB = `${FileSystem.documentDirectory}nexa-notes-library.json`;

async function readAll(): Promise<NotzRecording[]> {
  try {
    const info = await FileSystem.getInfoAsync(DB);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(DB);
    return JSON.parse(raw) as NotzRecording[];
  } catch {
    return [];
  }
}

async function writeAll(items: NotzRecording[]) {
  await FileSystem.writeAsStringAsync(DB, JSON.stringify(items, null, 2));
}

export async function deleteLocalFile(uri?: string) {
  if (!uri) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
}

export async function listRecordings() {
  const items = await readAll();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRecording(id: string) {
  return (await readAll()).find((item) => item.id === id) ?? null;
}

export async function saveRecording(item: NotzRecording) {
  const items = await readAll();
  const index = items.findIndex((r) => r.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  await writeAll(items);
  return item;
}

export async function patchRecording(id: string, patch: Partial<NotzRecording>) {
  const current = await getRecording(id);
  if (!current) throw new Error('Recording not found');
  return saveRecording({ ...current, ...patch });
}

function nextStatus(current: NotzRecording, patch: Partial<NotzRecording>) {
  const merged = { ...current, ...patch };
  if (merged.notes || Object.keys(merged.documents || {}).length) return 'notes-ready' as const;
  if (merged.transcript) return 'transcribed' as const;
  return 'recorded' as const;
}

export async function deleteAudioOnly(id: string) {
  const current = await getRecording(id);
  if (!current) throw new Error('Recording not found');
  for (const uri of current.segmentUris) await deleteLocalFile(uri);
  return patchRecording(id, { segmentUris: [] });
}

export async function deleteTranscriptOnly(id: string) {
  const current = await getRecording(id);
  if (!current) throw new Error('Recording not found');
  await deleteLocalFile(current.transcriptPdfUri);
  const patch: Partial<NotzRecording> = { transcript: undefined, transcriptPdfUri: undefined, error: undefined };
  patch.status = nextStatus(current, patch);
  return patchRecording(id, patch);
}

export async function deleteStudyNotesOnly(id: string) {
  const current = await getRecording(id);
  if (!current) throw new Error('Recording not found');
  await deleteLocalFile(current.pdfUri);
  const patch: Partial<NotzRecording> = { notes: undefined, pdfUri: undefined };
  patch.status = nextStatus(current, patch);
  return patchRecording(id, patch);
}

export async function deleteOrganizedDocumentOnly(id: string, mode: OrganizationMode) {
  const current = await getRecording(id);
  if (!current) throw new Error('Recording not found');
  await deleteLocalFile(current.outputPdfUris?.[mode]);

  const documents = { ...(current.documents || {}) };
  delete documents[mode];

  const outputPdfUris = { ...(current.outputPdfUris || {}) };
  delete outputPdfUris[mode];

  const patch: Partial<NotzRecording> = { documents, outputPdfUris };
  patch.status = nextStatus(current, patch);
  return patchRecording(id, patch);
}

export async function deleteRecording(id: string) {
  const items = await readAll();
  const current = items.find((r) => r.id === id);
  if (current) {
    for (const uri of current.segmentUris) await deleteLocalFile(uri);
    const pdfs = [
      current.transcriptPdfUri,
      current.pdfUri,
      ...Object.values(current.outputPdfUris || {}),
    ].filter(Boolean) as string[];
    for (const uri of pdfs) await deleteLocalFile(uri);
  }
  await writeAll(items.filter((r) => r.id !== id));
}
