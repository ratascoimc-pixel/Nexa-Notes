import * as FileSystem from 'expo-file-system/legacy';
import { NexaRecording } from '../types';

const DB = `${FileSystem.documentDirectory}nexa-notes-library.json`;

async function readAll(): Promise<NexaRecording[]> {
  try {
    const info = await FileSystem.getInfoAsync(DB);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(DB);
    return JSON.parse(raw) as NexaRecording[];
  } catch {
    return [];
  }
}

async function writeAll(items: NexaRecording[]) {
  await FileSystem.writeAsStringAsync(DB, JSON.stringify(items, null, 2));
}

export async function listRecordings() {
  const items = await readAll();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRecording(id: string) {
  return (await readAll()).find((item) => item.id === id) ?? null;
}

export async function saveRecording(item: NexaRecording) {
  const items = await readAll();
  const index = items.findIndex((r) => r.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  await writeAll(items);
  return item;
}

export async function patchRecording(id: string, patch: Partial<NexaRecording>) {
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
    if (current.pdfUri) {
      try { await FileSystem.deleteAsync(current.pdfUri, { idempotent: true }); } catch {}
    }
  }
  await writeAll(items.filter((r) => r.id !== id));
}
