import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BrandHeader } from '../../components/BrandHeader';
import { colors, radii } from '../../constants/theme';
import { createAndShareDocumentPdf, createAndSharePdf, shareExistingPdf } from '../../lib/pdf';
import { deleteRecording, getRecording, patchRecording } from '../../lib/store';
import { generateOrganizedDocument, generateStudyNotes, transcribeRecording } from '../../services/api';
import { NotzRecording, OrganizedDocument, OrganizationMode } from '../../types';

const ORGANIZE_OPTIONS: { mode: OrganizationMode; label: string; short: string }[] = [
  { mode: 'detailed-outline', label: 'Detailed Outline', short: 'Detailed' },
  { mode: 'simple-outline', label: 'Simple Outline', short: 'Simple' },
  { mode: 'summary', label: 'Summary', short: 'Summary' },
  { mode: 'key-points', label: 'Key Points', short: 'Key Points' },
  { mode: 'qa-review', label: 'Q&A Review', short: 'Q&A' },
  { mode: 'references', label: 'References', short: 'References' },
];

export default function RecordingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<NotzRecording | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => setItem(await getRecording(id)), [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!item) {
    return <View style={s.center}><Text style={s.loading}>Loading…</Text></View>;
  }

  const rename = async (value: string) => setItem(await patchRecording(id, { title: value }));

  const transcribe = async () => {
    setBusy('transcribing');
    try {
      await patchRecording(id, { status: 'transcribing', error: undefined });
      const text = await transcribeRecording(item);
      const updated = await patchRecording(id, {
        transcript: text,
        status: 'transcribed',
        error: undefined,
        notes: undefined,
        documents: undefined,
        pdfUri: undefined,
        outputPdfUris: undefined,
      });
      setItem(updated);
    } catch (e: any) {
      const message = e?.message || 'Transcription failed.';
      setItem(await patchRecording(id, { status: 'error', error: message }));
      Alert.alert('Transcription', message);
    } finally {
      setBusy('');
    }
  };

  const notes = async () => {
    if (!item.transcript) return;
    setBusy('creating study notes');
    try {
      const result = await generateStudyNotes(item.transcript, item.title);
      setItem(await patchRecording(id, {
        notes: result,
        status: 'notes-ready',
        error: undefined,
        pdfUri: undefined,
      }));
    } catch (e: any) {
      Alert.alert('Study notes', e?.message || 'Could not create study notes.');
    } finally {
      setBusy('');
    }
  };

  const organize = async (mode: OrganizationMode, label: string) => {
    if (!item.transcript) return;
    setBusy(`creating ${label.toLowerCase()}`);
    try {
      const result = await generateOrganizedDocument(item.transcript, item.title, mode);
      const outputPdfUris = { ...(item.outputPdfUris || {}) };
      delete outputPdfUris[mode];
      setItem(await patchRecording(id, {
        documents: { ...(item.documents || {}), [mode]: result },
        outputPdfUris,
        status: 'notes-ready',
        error: undefined,
      }));
    } catch (e: any) {
      Alert.alert(label, e?.message || `Could not create ${label.toLowerCase()}.`);
    } finally {
      setBusy('');
    }
  };

  const pdf = async () => {
    setBusy('creating PDF');
    try {
      const uri = await createAndSharePdf(item);
      setItem(await patchRecording(id, { pdfUri: uri }));
    } catch (e: any) {
      Alert.alert('PDF', e?.message || 'Could not create PDF.');
    } finally {
      setBusy('');
    }
  };

  const sharePdf = async () => {
    if (!item.pdfUri) return pdf();
    try { await shareExistingPdf(item.pdfUri); } catch { await pdf(); }
  };

  const exportDocument = async (mode: OrganizationMode, document: OrganizedDocument, label: string) => {
    setBusy(`creating ${label} PDF`);
    try {
      const existing = item.outputPdfUris?.[mode];
      if (existing) {
        try {
          await shareExistingPdf(existing);
          return;
        } catch {}
      }
      const uri = await createAndShareDocumentPdf(item, mode, document, label);
      setItem(await patchRecording(id, {
        outputPdfUris: { ...(item.outputPdfUris || {}), [mode]: uri },
      }));
    } catch (e: any) {
      Alert.alert('PDF', e?.message || `Could not create ${label} PDF.`);
    } finally {
      setBusy('');
    }
  };

  const remove = () => Alert.alert(
    'Delete recording?',
    'This removes the saved audio, transcript, notes and PDFs from this device.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRecording(id); router.back(); } },
    ],
  );

  return (
    <ScrollView contentContainerStyle={s.root} showsVerticalScrollIndicator={false}>
      <BrandHeader compact />

      <View style={s.titleBlock}>
        <TextInput
          style={s.title}
          value={item.title}
          onChangeText={(value) => setItem({ ...item, title: value })}
          onEndEditing={(event) => rename(event.nativeEvent.text)}
          selectionColor={colors.goldBright}
        />
        <Text style={s.meta}>
          {new Date(item.createdAt).toLocaleString()} • {duration(item.durationMs)} • {item.segmentUris.length} protected audio segment{item.segmentUris.length === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={s.primaryActions}>
        <Action
          label={item.transcript ? 'TRANSCRIBE AGAIN' : 'TRANSCRIBE'}
          disabled={Boolean(busy)}
          onPress={transcribe}
          primary
        />
      </View>

      {busy ? (
        <View style={s.processingCard}>
          <View style={s.processingDot} />
          <Text style={s.processing}>Notz is {busy}…</Text>
        </View>
      ) : null}

      {item.error ? (
        <View style={s.error}>
          <Text style={s.errorTitle}>Processing error</Text>
          <Text style={s.body}>{item.error}</Text>
        </View>
      ) : null}

      {item.transcript ? (
        <Section title="Organize this recording" eyebrow="CHOOSE AN OUTPUT">
          <Text style={s.muted}>Create the format you want without changing the original transcript.</Text>
          <View style={s.modeGrid}>
            <ModeButton label={item.notes ? 'Study Notes ✓' : 'Study Notes'} onPress={notes} disabled={Boolean(busy)} />
            {ORGANIZE_OPTIONS.map((option) => (
              <ModeButton
                key={option.mode}
                label={`${option.short}${item.documents?.[option.mode] ? ' ✓' : ''}`}
                onPress={() => organize(option.mode, option.label)}
                disabled={Boolean(busy)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      {item.transcript ? (
        <Section title="Transcript" eyebrow="ORIGINAL">
          <Text style={s.body}>{item.transcript}</Text>
        </Section>
      ) : (
        <Section title="Transcript" eyebrow="ORIGINAL">
          <Text style={s.muted}>Your full transcript will appear here after processing.</Text>
        </Section>
      )}

      {item.notes ? (
        <Section title="Study Notes" eyebrow="ORGANIZED">
          <Subheading>Main Theme</Subheading>
          <Text style={s.body}>{item.notes.mainTheme}</Text>
          <Subheading>Key Points</Subheading>
          {item.notes.keyPoints.map((value, index) => <Text key={`key-${index}`} style={s.bullet}>• {value}</Text>)}
          <Subheading>Important References</Subheading>
          {item.notes.references.map((value, index) => <Text key={`ref-${index}`} style={s.bullet}>• {value}</Text>)}
          <Subheading>Illustrations / Examples</Subheading>
          {item.notes.illustrations.map((value, index) => <Text key={`ill-${index}`} style={s.bullet}>• {value}</Text>)}
          <Subheading>How to Apply It</Subheading>
          {item.notes.application.map((value, index) => <Text key={`app-${index}`} style={s.bullet}>• {value}</Text>)}
          <Subheading>Questions for Review</Subheading>
          {item.notes.reviewQuestions.map((value, index) => <Text key={`q-${index}`} style={s.bullet}>• {value}</Text>)}
          <Subheading>Summary</Subheading>
          <Text style={s.body}>{item.notes.summary}</Text>
          <Pressable style={s.exportButton} onPress={sharePdf} disabled={Boolean(busy)}>
            <Text style={s.exportText}>{item.pdfUri ? 'SHARE SAVED PDF' : 'SAVE / SHARE PDF'}</Text>
          </Pressable>
        </Section>
      ) : null}

      {ORGANIZE_OPTIONS.map((option) => {
        const document = item.documents?.[option.mode];
        if (!document) return null;
        return (
          <Section key={option.mode} title={option.label} eyebrow="ORGANIZED">
            {document.summary ? <Text style={s.summary}>{document.summary}</Text> : null}
            {document.sections.map((section, sectionIndex) => (
              <View key={`${option.mode}-${sectionIndex}`} style={s.documentSection}>
                <Subheading>{section.heading}</Subheading>
                {section.body ? <Text style={s.body}>{section.body}</Text> : null}
                {section.items.map((value, index) => <Text key={`item-${index}`} style={s.bullet}>• {value}</Text>)}
                {section.qa.map((qa, index) => (
                  <View key={`qa-${index}`} style={s.qaCard}>
                    <Text style={s.qaQuestion}>{qa.question}</Text>
                    <Text style={s.body}>{qa.answer}</Text>
                  </View>
                ))}
              </View>
            ))}
            <Pressable style={s.exportButton} onPress={() => exportDocument(option.mode, document, option.label)} disabled={Boolean(busy)}>
              <Text style={s.exportText}>{item.outputPdfUris?.[option.mode] ? 'SHARE SAVED PDF' : 'SAVE / SHARE PDF'}</Text>
            </Pressable>
          </Section>
        );
      })}

      <Pressable onPress={remove} style={s.delete}>
        <Text style={s.deleteText}>Delete Recording</Text>
      </Pressable>
    </ScrollView>
  );
}

const duration = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${m}:${String(seconds).padStart(2, '0')}`;
};

function Action({ label, onPress, disabled, primary = false }: { label: string; onPress: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[s.action, primary && s.actionPrimary, disabled && s.disabled]}>
      <Text style={[s.actionText, primary && s.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function ModeButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[s.modeButton, disabled && s.disabled]}>
      <Text style={s.modeButtonText}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow?: string; children: any }) {
  return (
    <View style={s.section}>
      {eyebrow ? <Text style={s.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Subheading({ children }: { children: any }) {
  return <Text style={s.subheading}>{children}</Text>;
}

const s = StyleSheet.create({
  root: { padding: 20, paddingBottom: 60, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loading: { color: colors.textMuted },
  titleBlock: { marginTop: 22 },
  title: { fontSize: 25, fontWeight: '900', color: colors.text, padding: 0 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 7, lineHeight: 17 },
  primaryActions: { marginTop: 18 },
  action: { backgroundColor: colors.surfaceSoft, padding: 15, borderRadius: radii.medium, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  actionPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  actionText: { color: colors.goldBright, fontWeight: '900', letterSpacing: 0.5 },
  actionTextPrimary: { color: colors.background },
  disabled: { opacity: 0.5 },
  processingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.surface, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.goldSoft, padding: 13, marginTop: 12 },
  processingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.goldBright },
  processing: { color: colors.goldBright, fontWeight: '800' },
  section: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.borderSoft, padding: 18, marginTop: 16 },
  sectionEyebrow: { color: colors.goldBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: colors.text, marginTop: 3, marginBottom: 10 },
  subheading: { color: colors.goldBright, fontSize: 14, fontWeight: '900', marginTop: 14, marginBottom: 6 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  bullet: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginBottom: 3 },
  muted: { color: colors.textDim, lineHeight: 21, fontSize: 13 },
  summary: { color: colors.text, lineHeight: 22, backgroundColor: colors.surfaceSoft, borderRadius: radii.medium, padding: 13 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  modeButton: { minWidth: '30%', flexGrow: 1, backgroundColor: colors.backgroundAlt, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center' },
  modeButtonText: { color: colors.goldBright, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  documentSection: { marginTop: 4 },
  qaCard: { marginTop: 10, backgroundColor: colors.backgroundAlt, borderRadius: radii.medium, borderLeftWidth: 3, borderLeftColor: colors.gold, padding: 12 },
  qaQuestion: { color: colors.text, fontWeight: '900', marginBottom: 6, lineHeight: 20 },
  exportButton: { marginTop: 18, backgroundColor: colors.gold, borderRadius: radii.medium, padding: 14, alignItems: 'center' },
  exportText: { color: colors.background, fontWeight: '900', letterSpacing: 0.7 },
  error: { backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.danger, padding: 15, borderRadius: radii.medium, marginTop: 16 },
  errorTitle: { fontWeight: '900', color: colors.danger, marginBottom: 5 },
  delete: { padding: 18, alignItems: 'center', marginTop: 20 },
  deleteText: { color: colors.danger, fontWeight: '800' },
});
