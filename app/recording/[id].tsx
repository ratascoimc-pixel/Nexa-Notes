import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { createAndSharePdf, shareExistingPdf } from '../../lib/pdf';
import { deleteRecording, getRecording, patchRecording } from '../../lib/store';
import { generateStudyNotes, transcribeRecording } from '../../services/api';
import { NexaRecording } from '../../types';

export default function RecordingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<NexaRecording | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => setItem(await getRecording(id)), [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!item) return <View style={s.center}><Text>Loading…</Text></View>;

  const rename = async (v: string) => setItem(await patchRecording(id, { title: v }));
  const transcribe = async () => {
    setBusy('transcribing');
    try {
      await patchRecording(id, { status: 'transcribing', error: undefined });
      const text = await transcribeRecording(item);
      const x = await patchRecording(id, { transcript: text, status: 'transcribed', error: undefined, notes: undefined, pdfUri: undefined });
      setItem(x);
    } catch (e: any) {
      const msg = e?.message || 'Transcription failed.';
      setItem(await patchRecording(id, { status: 'error', error: msg }));
      Alert.alert('Transcription', msg);
    } finally { setBusy(''); }
  };
  const notes = async () => {
    if (!item.transcript) return;
    setBusy('creating study notes');
    try {
      const result = await generateStudyNotes(item.transcript, item.title);
      setItem(await patchRecording(id, { notes: result, status: 'notes-ready', error: undefined, pdfUri: undefined }));
    } catch (e: any) {
      Alert.alert('Study notes', e?.message || 'Could not create study notes.');
    } finally { setBusy(''); }
  };
  const pdf = async () => {
    setBusy('creating PDF');
    try {
      const uri = await createAndSharePdf(item);
      setItem(await patchRecording(id, { pdfUri: uri }));
    } catch (e: any) {
      Alert.alert('PDF', e?.message || 'Could not create PDF.');
    } finally { setBusy(''); }
  };
  const sharePdf = async () => {
    if (!item.pdfUri) return pdf();
    try { await shareExistingPdf(item.pdfUri); } catch { await pdf(); }
  };
  const remove = () => Alert.alert('Delete recording?', 'This removes the saved audio, transcript, notes and PDF from this device.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRecording(id); router.back(); } },
  ]);

  return (
    <ScrollView contentContainerStyle={s.root}>
      <TextInput style={s.title} value={item.title} onChangeText={(v) => setItem({ ...item, title: v })} onEndEditing={(e) => rename(e.nativeEvent.text)} />
      <Text style={s.meta}>{new Date(item.createdAt).toLocaleString()} • {duration(item.durationMs)} • {item.segmentUris.length} protected audio segment{item.segmentUris.length === 1 ? '' : 's'}</Text>
      <View style={s.actions}>
        <Action label={item.transcript ? 'TRANSCRIBE AGAIN' : 'TRANSCRIBE'} disabled={!!busy} onPress={transcribe} />
        {item.transcript && <Action label={item.notes ? 'REGENERATE STUDY NOTES' : 'CREATE STUDY NOTES'} disabled={!!busy} onPress={notes} />}
        {item.notes && <Action label={item.pdfUri ? 'SHARE SAVED PDF' : 'SAVE / SHARE PDF'} disabled={!!busy} onPress={sharePdf} />}
      </View>
      {busy ? <Text style={s.processing}>Nexa Notes is {busy}…</Text> : null}
      {item.error ? <View style={s.error}><Text style={s.errorTitle}>Processing error</Text><Text style={s.body}>{item.error}</Text></View> : null}
      {item.transcript ? <Section title="Transcript"><Text style={s.body}>{item.transcript}</Text></Section> : <Section title="Transcript"><Text style={s.muted}>Your full transcript will appear here after processing.</Text></Section>}
      {item.notes ? <>
        <Section title="Main Theme"><Text style={s.body}>{item.notes.mainTheme}</Text></Section>
        <Section title="Key Points">{item.notes.keyPoints.map((x, i) => <Text key={i} style={s.bullet}>• {x}</Text>)}</Section>
        <Section title="Important References">{item.notes.references.map((x, i) => <Text key={i} style={s.bullet}>• {x}</Text>)}</Section>
        <Section title="Illustrations / Examples">{item.notes.illustrations.map((x, i) => <Text key={i} style={s.bullet}>• {x}</Text>)}</Section>
        <Section title="How to Apply It">{item.notes.application.map((x, i) => <Text key={i} style={s.bullet}>• {x}</Text>)}</Section>
        <Section title="Questions for Review">{item.notes.reviewQuestions.map((x, i) => <Text key={i} style={s.bullet}>• {x}</Text>)}</Section>
        <Section title="Summary"><Text style={s.body}>{item.notes.summary}</Text></Section>
      </> : null}
      <Pressable onPress={remove} style={s.delete}><Text style={s.deleteText}>Delete Recording</Text></Pressable>
    </ScrollView>
  );
}

const duration = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={[s.action, disabled && { opacity: 0.5 }]}><Text style={s.actionText}>{label}</Text></Pressable>; }
function Section({ title, children }: { title: string; children: any }) { return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{children}</View>; }
const s = StyleSheet.create({
  root: { padding: 20, paddingBottom: 60, backgroundColor: '#F7F9FF' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '900', color: '#0B1736', padding: 0 }, meta: { fontSize: 12, color: '#667085', marginTop: 5 },
  actions: { gap: 9, marginTop: 20 }, action: { backgroundColor: '#315FF4', padding: 15, borderRadius: 14, alignItems: 'center' }, actionText: { color: '#fff', fontWeight: '900', letterSpacing: 0.5 },
  processing: { textAlign: 'center', color: '#6341E8', fontWeight: '800', marginTop: 12 }, section: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 16 }, sectionTitle: { fontSize: 17, fontWeight: '900', color: '#0B1736', marginBottom: 9 },
  body: { color: '#344054', fontSize: 15, lineHeight: 23 }, bullet: { color: '#344054', fontSize: 15, lineHeight: 23, marginBottom: 4 }, muted: { color: '#8A94A6', lineHeight: 21 },
  error: { backgroundColor: '#FFF3F3', padding: 15, borderRadius: 14, marginTop: 16 }, errorTitle: { fontWeight: '900', color: '#8B1E1E', marginBottom: 5 },
  delete: { padding: 18, alignItems: 'center', marginTop: 20 }, deleteText: { color: '#B42318', fontWeight: '800' },
});
