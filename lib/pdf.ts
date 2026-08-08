import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { NexaRecording, StudyNotes } from '../types';

const esc = (value: string) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c));
const list = (items: string[] = []) => items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>—</p>';

function notesHtml(r: NexaRecording, n: StudyNotes) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
  @page{margin:34px} body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0B1736;line-height:1.55}
  .brand{font-size:12px;letter-spacing:2px;color:#5B42E8;font-weight:700}.title{font-size:30px;margin:8px 0 2px}.meta{color:#667085;font-size:12px;margin-bottom:24px}
  h2{font-size:18px;margin:22px 0 7px;border-bottom:1px solid #E6E9F2;padding-bottom:5px}li{margin:5px 0}.summary{background:#F4F5FF;border-radius:12px;padding:14px}
  </style></head><body><div class="brand">NEXA NOTES • STUDY NOTES</div><div class="title">${esc(n.title || r.title)}</div><div class="meta">Created ${esc(new Date(r.createdAt).toLocaleString())}</div>
  <h2>Main Theme</h2><p>${esc(n.mainTheme)}</p><h2>Key Points</h2>${list(n.keyPoints)}<h2>Important References</h2>${list(n.references)}
  <h2>Illustrations / Examples</h2>${list(n.illustrations)}<h2>How to Apply It</h2>${list(n.application)}<h2>Questions for Review</h2>${list(n.reviewQuestions)}
  <h2>Summary</h2><div class="summary">${esc(n.summary)}</div></body></html>`;
}

function safeName(value: string) {
  return value.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'Nexa-Notes';
}

export async function createAndSharePdf(recording: NexaRecording) {
  if (!recording.notes) throw new Error('Generate study notes first.');
  const { uri: cacheUri } = await Print.printToFileAsync({ html: notesHtml(recording, recording.notes) });
  const pdfDir = `${FileSystem.documentDirectory}nexa-pdfs/`;
  await FileSystem.makeDirectoryAsync(pdfDir, { intermediates: true });
  const dest = `${pdfDir}${safeName(recording.title)}-${recording.id}.pdf`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.moveAsync({ from: cacheUri, to: dest });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Save or share Nexa Notes PDF' });
  }
  return dest;
}

export async function shareExistingPdf(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('The saved PDF could not be found. Generate it again.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Share Nexa Notes PDF' });
}
