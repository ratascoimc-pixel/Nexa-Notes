import * as FileSystem from 'expo-file-system/legacy';
import { NotzRecording } from '../types';

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

export async function deleteRecording(id: string) {
  const items = await readAll();
  const current = items.find((r) => r.id === id);
  if (current) {
    for (const uri of current.segmentUris) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
    }
    const pdfs = [current.pdfUri, ...Object.values(current.outputPdfUris || {})].filter(Boolean) as string[];
    for (const uri of pdfs) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
    }
  }
  await writeAll(items.filter((r) => r.id !== id));
}
