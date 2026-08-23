import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { NotzRecording, OrganizedDocument, OrganizationMode, StudyNotes } from '../types';

const esc = (value: string) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c));
const list = (items: string[] = []) => items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>—</p>';

const css = `
  @page{margin:34px} body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0A1728;line-height:1.55}
  .brand{font-size:12px;letter-spacing:2px;color:#9B7414;font-weight:800}.title{font-size:30px;margin:8px 0 2px}.meta{color:#667085;font-size:12px;margin-bottom:24px}
  h2{font-size:18px;margin:22px 0 7px;border-bottom:1px solid #E6E9F2;padding-bottom:5px}h3{font-size:15px;margin:16px 0 5px}li{margin:5px 0}
  .summary{background:#FBF6E8;border-radius:12px;padding:14px}.qa{margin:10px 0;padding:10px 12px;border-left:3px solid #D7A62A;background:#FAFAFA}
  .transcript{white-space:pre-wrap;font-size:13px;line-height:1.65}
`;

function shell(recording: NotzRecording, label: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${css}</style></head><body>
  <div class="brand">NOTZ • BY MASTER KEY ONE • ${esc(label.toUpperCase())}</div><div class="title">${esc(recording.title)}</div><div class="meta">Created ${esc(new Date(recording.createdAt).toLocaleString())}</div>
  ${body}</body></html>`;
}

function transcriptHtml(r: NotzRecording) {
  return shell(r, 'Transcript', `<div class="transcript">${esc(r.transcript || '')}</div>`);
}

function notesHtml(r: NotzRecording, n: StudyNotes) {
  return shell(r, 'Study Notz', `
  <h2>Main Theme</h2><p>${esc(n.mainTheme)}</p><h2>Key Points</h2>${list(n.keyPoints)}<h2>Important References</h2>${list(n.references)}
  <h2>Illustrations / Examples</h2>${list(n.illustrations)}<h2>How to Apply It</h2>${list(n.application)}<h2>Questions for Review</h2>${list(n.reviewQuestions)}
  <h2>Summary</h2><div class="summary">${esc(n.summary)}</div>`);
}

function documentHtml(r: NotzRecording, d: OrganizedDocument, label: string) {
  const sections = d.sections.map((section) => {
    const qa = section.qa.length ? section.qa.map((x) => `<div class="qa"><strong>${esc(x.question)}</strong><br/>${esc(x.answer)}</div>`).join('') : '';
    return `<h2>${esc(section.heading)}</h2>${section.body ? `<p>${esc(section.body)}</p>` : ''}${list(section.items)}${qa}`;
  }).join('');
  return shell(r, label, `${d.summary ? `<div class="summary">${esc(d.summary)}</div>` : ''}${sections}`);
}

function safeName(value: string) {
  return value.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'Notz';
}

async function persistAndShare(html: string, filename: string, dialogTitle: string) {
  const { uri: cacheUri } = await Print.printToFileAsync({ html });
  const pdfDir = `${FileSystem.documentDirectory}notz-pdfs/`;
  await FileSystem.makeDirectoryAsync(pdfDir, { intermediates: true });
  const dest = `${pdfDir}${filename}.pdf`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.moveAsync({ from: cacheUri, to: dest });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle });
  }
  return dest;
}

export async function createAndShareTranscriptPdf(recording: NotzRecording) {
  if (!recording.transcript) throw new Error('Transcribe the recording first.');
  return persistAndShare(
    transcriptHtml(recording),
    `${safeName(recording.title)}-transcript-${recording.id}`,
    'Share NOTZ transcript',
  );
}

export async function createAndSharePdf(recording: NotzRecording) {
  if (!recording.notes) throw new Error('Generate Study Notz first.');
  return persistAndShare(
    notesHtml(recording, recording.notes),
    `${safeName(recording.title)}-study-notz-${recording.id}`,
    'Share NOTZ Study Notz',
  );
}

export async function createAndShareDocumentPdf(
  recording: NotzRecording,
  mode: OrganizationMode,
  document: OrganizedDocument,
  label: string,
) {
  return persistAndShare(
    documentHtml(recording, document, label),
    `${safeName(recording.title)}-${mode}-${recording.id}`,
    `Share NOTZ ${label}`,
  );
}

export async function shareExistingPdf(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('The saved PDF could not be found. Generate it again.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Share NOTZ PDF' });
}
