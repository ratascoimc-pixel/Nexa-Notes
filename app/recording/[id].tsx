import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { BrandHeader } from '../../components/BrandHeader';
import { colors, radii } from '../../constants/theme';
import {
  createAndShareDocumentPdf,
  createAndSharePdf,
  createAndShareTranscriptPdf,
  shareExistingPdf,
} from '../../lib/pdf';
import { shareAudioFile } from '../../lib/share';
import {
  deleteAudioOnly,
  deleteLocalFile,
  deleteOrganizedDocumentOnly,
  deleteRecording,
  deleteStudyNotesOnly,
  deleteTranscriptOnly,
  getRecording,
  patchRecording,
} from '../../lib/store';
import { generateOrganizedDocument, generateStudyNotes, transcribeRecording } from '../../services/api';
import { NotzRecording, OrganizedDocument, OrganizationMode } from '../../types';

const ORGANIZE_OPTIONS: { mode: OrganizationMode; label: string; short: string }[] = [
  { mode: 'detailed-outline', label: 'Detailed Outline', short: 'Detailed Outline' },
  { mode: 'simple-outline', label: 'Simple Outline', short: 'Simple Outline' },
  { mode: 'summary', label: 'Summary', short: 'Summary' },
  { mode: 'key-points', label: 'Key Points', short: 'Key Points' },
  { mode: 'detailed-notes', label: 'Detailed Notes', short: 'Detailed Notes' },
  { mode: 'qa-review', label: 'Q&A Review', short: 'Q&A Review' },
  { mode: 'flashcards', label: 'Flashcards', short: 'Flashcards' },
  { mode: 'references', label: 'References', short: 'References' },
];

export default function RecordingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<NotzRecording | null>(null);
  const [busy, setBusy] = useState('');
  const [audioPart, setAudioPart] = useState(0);
  const [showAudioParts, setShowAudioParts] = useState(false);
  const loadedUri = useRef('');
  const advancing = useRef(false);
  const player = useAudioPlayer(null, { updateInterval: 400 });
  const playerStatus = useAudioPlayerStatus(player);

  const load = useCallback(async () => {
    const found = await getRecording(id);
    setItem(found);
    if (found) setAudioPart((current) => current >= found.segmentUris.length ? 0 : current);
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const uri = item?.segmentUris[audioPart];
    if (!uri) {
      loadedUri.current = '';
      try { player.pause(); } catch {}
      return;
    }
    if (loadedUri.current !== uri) {
      try {
        player.replace(uri);
        loadedUri.current = uri;
      } catch {}
    }
  }, [item?.segmentUris, audioPart, player]);

  useEffect(() => {
    if (!item || !playerStatus.didJustFinish || advancing.current) return;
    if (audioPart >= item.segmentUris.length - 1) return;
    const next = audioPart + 1;
    const uri = item.segmentUris[next];
    if (!uri) return;
    advancing.current = true;
    setAudioPart(next);
    try {
      player.replace(uri);
      loadedUri.current = uri;
      player.play();
    } catch {}
    const t = setTimeout(() => { advancing.current = false; }, 350);
    return () => clearTimeout(t);
  }, [playerStatus.didJustFinish, item, audioPart, player]);

  if (!item) {
    return <View style={s.center}><Text style={s.loading}>Loading…</Text></View>;
  }

  const rename = async (value: string) => setItem(await patchRecording(id, { title: value }));

  const togglePlayback = async () => {
    if (!item.segmentUris.length) return;
    try {
      if (playerStatus.playing) {
        player.pause();
        return;
      }
      const uri = item.segmentUris[audioPart] || item.segmentUris[0];
      if (loadedUri.current !== uri) {
        player.replace(uri);
        loadedUri.current = uri;
      }
      if (playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration - 0.2) {
        await player.seekTo(0);
      }
      player.play();
    } catch (e: any) {
      Alert.alert('Audio playback', e?.message || 'Could not play this recording.');
    }
  };

  const seekBy = async (seconds: number) => {
    try {
      const next = Math.max(0, Math.min(playerStatus.duration || 0, playerStatus.currentTime + seconds));
      await player.seekTo(next);
    } catch {}
  };

  const chooseAudioPart = (index: number, autoplay = false) => {
    const uri = item.segmentUris[index];
    if (!uri) return;
    try { player.pause(); } catch {}
    setAudioPart(index);
    try {
      player.replace(uri);
      loadedUri.current = uri;
      if (autoplay) player.play();
    } catch {}
  };

  const shareAudioPart = async (index: number) => {
    const uri = item.segmentUris[index];
    if (!uri) return;
    try {
      await shareAudioFile(uri, item.title, index + 1, item.segmentUris.length);
    } catch (e: any) {
      Alert.alert('Share audio', e?.message || 'Could not share this audio file.');
    }
  };

  const transcribe = async () => {
    if (!item.segmentUris.length) {
      Alert.alert('No audio', 'The audio was deleted. Existing notes can remain, but this recording cannot be transcribed again without audio.');
      return;
    }
    setBusy('transcribing');
    try {
      await patchRecording(id, { status: 'transcribing', error: undefined });
      const text = await transcribeRecording(item);
      await deleteLocalFile(item.transcriptPdfUri);
      const updated = await patchRecording(id, {
        transcript: text,
        transcriptPdfUri: undefined,
        status: item.notes || Object.keys(item.documents || {}).length ? 'notes-ready' : 'transcribed',
        error: undefined,
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
    setBusy('creating Study Notz');
    try {
      const result = await generateStudyNotes(item.transcript, item.title);
      await deleteLocalFile(item.pdfUri);
      setItem(await patchRecording(id, {
        notes: result,
        status: 'notes-ready',
        error: undefined,
        pdfUri: undefined,
      }));
    } catch (e: any) {
      Alert.alert('Study Notz', e?.message || 'Could not create Study Notz.');
    } finally {
      setBusy('');
    }
  };

  const organize = async (mode: OrganizationMode, label: string) => {
    if (!item.transcript) return;
    setBusy(`creating ${label.toLowerCase()}`);
    try {
      const result = await generateOrganizedDocument(item.transcript, item.title, mode);
      await deleteLocalFile(item.outputPdfUris?.[mode]);
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

  const shareTranscript = async () => {
    if (!item.transcript) return;
    setBusy('preparing transcript');
    try {
      if (item.transcriptPdfUri) {
        try {
          await shareExistingPdf(item.transcriptPdfUri);
          return;
        } catch {}
      }
      const uri = await createAndShareTranscriptPdf(item);
      setItem(await patchRecording(id, { transcriptPdfUri: uri }));
    } catch (e: any) {
      Alert.alert('Transcript', e?.message || 'Could not share the transcript.');
    } finally {
      setBusy('');
    }
  };

  const shareStudyNotz = async () => {
    if (!item.notes) return;
    setBusy('preparing Study Notz');
    try {
      if (item.pdfUri) {
        try {
          await shareExistingPdf(item.pdfUri);
          return;
        } catch {}
      }
      const uri = await createAndSharePdf(item);
      setItem(await patchRecording(id, { pdfUri: uri }));
    } catch (e: any) {
      Alert.alert('Study Notz', e?.message || 'Could not share Study Notz.');
    } finally {
      setBusy('');
    }
  };

  const exportDocument = async (mode: OrganizationMode, document: OrganizedDocument, label: string) => {
    setBusy(`preparing ${label}`);
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
      Alert.alert(label, e?.message || `Could not share ${label.toLowerCase()}.`);
    } finally {
      setBusy('');
    }
  };

  const confirmDeleteAudio = () => Alert.alert(
    'Delete audio only?',
    'The transcript and every organized format will stay. You will no longer be able to listen to or re-transcribe this recording.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Audio',
        style: 'destructive',
        onPress: async () => {
          try { player.pause(); } catch {}
          setItem(await deleteAudioOnly(id));
          setAudioPart(0);
        },
      },
    ],
  );

  const confirmDeleteTranscript = () => Alert.alert(
    'Delete transcript only?',
    'Study Notz, outlines, summaries, key points and other generated formats will stay.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Transcript', style: 'destructive', onPress: async () => setItem(await deleteTranscriptOnly(id)) },
    ],
  );

  const confirmDeleteStudy = () => Alert.alert(
    'Delete Study Notz only?',
    'The audio, transcript and all other formats will stay.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Study Notz', style: 'destructive', onPress: async () => setItem(await deleteStudyNotesOnly(id)) },
    ],
  );

  const confirmDeleteDocument = (mode: OrganizationMode, label: string) => Alert.alert(
    `Delete ${label} only?`,
    'The audio, transcript and every other format will stay.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: `Delete ${label}`, style: 'destructive', onPress: async () => setItem(await deleteOrganizedDocumentOnly(id, mode)) },
    ],
  );

  const remove = () => Alert.alert(
    'Delete entire recording?',
    'This removes the audio, transcript, every organized format and all saved PDFs from this device.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Everything', style: 'destructive', onPress: async () => { await deleteRecording(id); router.back(); } },
    ],
  );

  const generated = ORGANIZE_OPTIONS.filter((option) => Boolean(item.documents?.[option.mode]));

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
          {new Date(item.createdAt).toLocaleString()} • {duration(item.durationMs)} • {item.segmentUris.length
            ? `${item.segmentUris.length} protected audio segment${item.segmentUris.length === 1 ? '' : 's'}`
            : 'audio deleted'}
        </Text>
      </View>

      <Section title="Listen to the recording" eyebrow="AUDIO">
        {item.segmentUris.length ? (
          <>
            <View style={s.playerRow}>
              <Pressable style={s.smallControl} onPress={() => void seekBy(-15)}><Text style={s.smallControlText}>−15</Text></Pressable>
              <Pressable style={s.playButton} onPress={() => void togglePlayback()}>
                <Text style={s.playText}>{playerStatus.playing ? 'PAUSE' : 'PLAY'}</Text>
              </Pressable>
              <Pressable style={s.smallControl} onPress={() => void seekBy(15)}><Text style={s.smallControlText}>+15</Text></Pressable>
            </View>
            <Text style={s.playerTime}>{clock(playerStatus.currentTime)} / {clock(playerStatus.duration)}</Text>
            <Text style={s.partLabel}>Audio part {audioPart + 1} of {item.segmentUris.length} • playback continues through long recordings</Text>
            {item.segmentUris.length > 1 ? (
              <View style={s.partNav}>
                <Pressable disabled={audioPart === 0} onPress={() => chooseAudioPart(audioPart - 1, true)} style={[s.partButton, audioPart === 0 && s.disabled]}>
                  <Text style={s.partButtonText}>‹ PREVIOUS</Text>
                </Pressable>
                <Pressable disabled={audioPart >= item.segmentUris.length - 1} onPress={() => chooseAudioPart(audioPart + 1, true)} style={[s.partButton, audioPart >= item.segmentUris.length - 1 && s.disabled]}>
                  <Text style={s.partButtonText}>NEXT ›</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable style={s.inlineDelete} onPress={confirmDeleteAudio}><Text style={s.inlineDeleteText}>Delete Audio Only</Text></Pressable>
          </>
        ) : <Text style={s.muted}>The audio has been deleted. Any transcript and organized formats you kept are still available below.</Text>}
      </Section>

      <Section title="Send / Share Files" eyebrow="QUICK SEND — BEFORE THE TRANSCRIPT">
        <Text style={s.muted}>Each item is shared separately. Organized text is sent as a clean NOTZ PDF; audio is sent as the original recording file.</Text>
        <View style={s.shareGrid}>
          <ShareTile
            label={item.segmentUris.length > 1 ? 'Audio Parts' : 'Audio'}
            ready={Boolean(item.segmentUris.length)}
            onPress={() => item.segmentUris.length === 1 ? void shareAudioPart(0) : setShowAudioParts((value) => !value)}
          />
          <ShareTile label="Transcript" ready={Boolean(item.transcript)} onPress={() => void shareTranscript()} />
          <ShareTile label="Study Notz" ready={Boolean(item.notes)} onPress={() => void shareStudyNotz()} />
          {generated.map((option) => (
            <ShareTile
              key={`share-${option.mode}`}
              label={option.short}
              ready
              onPress={() => void exportDocument(option.mode, item.documents![option.mode]!, option.label)}
            />
          ))}
        </View>
        {showAudioParts && item.segmentUris.length > 1 ? (
          <View style={s.audioParts}>
            <Text style={s.audioPartsTitle}>Long recording — send an audio part:</Text>
            <View style={s.modeGrid}>
              {item.segmentUris.map((_, index) => (
                <ModeButton key={`audio-share-${index}`} label={`Part ${index + 1}`} onPress={() => void shareAudioPart(index)} disabled={Boolean(busy)} />
              ))}
            </View>
          </View>
        ) : null}
      </Section>

      <View style={s.primaryActions}>
        <Action
          label={item.transcript ? 'TRANSCRIBE AGAIN' : 'TRANSCRIBE RECORDING'}
          disabled={Boolean(busy) || !item.segmentUris.length}
          onPress={transcribe}
          primary
        />
      </View>

      {busy ? (
        <View style={s.processingCard}>
          <View style={s.processingDot} />
          <Text style={s.processing}>NOTZ is {busy}…</Text>
        </View>
      ) : null}

      {item.error ? (
        <View style={s.error}>
          <Text style={s.errorTitle}>Processing error</Text>
          <Text style={s.body}>{item.error}</Text>
        </View>
      ) : null}

      {item.transcript ? (
        <Section title="Turn the transcript into…" eyebrow="CREATE A FORMAT">
          <Text style={s.muted}>Create any combination you want. Regenerating one format does not delete the others.</Text>
          <View style={s.modeGrid}>
            <ModeButton label={item.notes ? 'Study Notz ✓' : 'Study Notz'} onPress={notes} disabled={Boolean(busy)} />
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
          <OutputActions
            sendLabel="SEND TRANSCRIPT"
            onSend={() => void shareTranscript()}
            deleteLabel="DELETE TRANSCRIPT ONLY"
            onDelete={confirmDeleteTranscript}
            disabled={Boolean(busy)}
          />
        </Section>
      ) : (
        <Section title="Transcript" eyebrow="ORIGINAL">
          <Text style={s.muted}>Your full transcript will appear here after processing.</Text>
        </Section>
      )}

      {item.notes ? (
        <Section title="Study Notz" eyebrow="ORGANIZED">
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
          <OutputActions
            sendLabel="SEND STUDY NOTZ"
            onSend={() => void shareStudyNotz()}
            deleteLabel="DELETE STUDY NOTZ ONLY"
            onDelete={confirmDeleteStudy}
            disabled={Boolean(busy)}
          />
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
            <OutputActions
              sendLabel={`SEND ${option.label.toUpperCase()}`}
              onSend={() => void exportDocument(option.mode, document, option.label)}
              deleteLabel={`DELETE ${option.label.toUpperCase()} ONLY`}
              onDelete={() => confirmDeleteDocument(option.mode, option.label)}
              disabled={Boolean(busy)}
            />
          </Section>
        );
      })}

      <Pressable onPress={remove} style={s.delete}>
        <Text style={s.deleteText}>Delete Entire Recording & All Formats</Text>
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

const clock = (seconds: number) => {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

function Action({ label, onPress, disabled, primary = false }: { label: string; onPress: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[s.action, primary && s.actionPrimary, disabled && s.disabled]}>
      <Text style={[s.actionText, primary && s.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function ShareTile({ label, ready, onPress }: { label: string; ready: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={!ready} onPress={onPress} style={[s.shareTile, !ready && s.shareTileDisabled]}>
      <Text style={[s.shareTileTitle, !ready && s.shareTileTitleDisabled]}>{label}</Text>
      <Text style={s.shareTileSub}>{ready ? 'SEND / SHARE' : 'NOT READY'}</Text>
    </Pressable>
  );
}

function OutputActions({
  sendLabel,
  onSend,
  deleteLabel,
  onDelete,
  disabled,
}: {
  sendLabel: string;
  onSend: () => void;
  deleteLabel: string;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <View style={s.outputActions}>
      <Pressable style={[s.exportButton, disabled && s.disabled]} onPress={onSend} disabled={disabled}>
        <Text style={s.exportText}>{sendLabel}</Text>
      </Pressable>
      <Pressable style={s.outputDelete} onPress={onDelete}>
        <Text style={s.outputDeleteText}>{deleteLabel}</Text>
      </Pressable>
    </View>
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
  primaryActions: { marginTop: 16 },
  action: { backgroundColor: colors.surfaceSoft, padding: 15, borderRadius: radii.medium, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  actionPrimary: { backgroundColor: colors.gold, borderColor: colors.goldBright },
  actionText: { color: colors.goldBright, fontWeight: '900', letterSpacing: 0.5 },
  actionTextPrimary: { color: colors.background },
  disabled: { opacity: 0.45 },
  processingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.surface, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.blueSoft, padding: 13, marginTop: 12 },
  processingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blueBright },
  processing: { color: colors.goldBright, fontWeight: '800' },
  section: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.blueSoft, padding: 18, marginTop: 16 },
  sectionEyebrow: { color: colors.goldBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: colors.text, marginTop: 3, marginBottom: 10 },
  subheading: { color: colors.goldBright, fontSize: 14, fontWeight: '900', marginTop: 14, marginBottom: 6 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  bullet: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginBottom: 3 },
  muted: { color: colors.textDim, lineHeight: 21, fontSize: 13 },
  summary: { color: colors.text, lineHeight: 22, backgroundColor: colors.surfaceSoft, borderRadius: radii.medium, padding: 13 },
  playerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 2 },
  playButton: { minWidth: 118, backgroundColor: colors.gold, borderRadius: radii.pill, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.goldBright },
  playText: { color: colors.background, fontWeight: '900', letterSpacing: 1 },
  smallControl: { width: 54, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt, borderWidth: 1, borderColor: colors.blueSoft },
  smallControlText: { color: colors.blueBright, fontWeight: '900' },
  playerTime: { textAlign: 'center', color: colors.text, fontWeight: '900', fontSize: 20, marginTop: 12, fontVariant: ['tabular-nums'] },
  partLabel: { color: colors.textMuted, textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 5 },
  partNav: { flexDirection: 'row', gap: 8, marginTop: 12 },
  partButton: { flex: 1, backgroundColor: colors.backgroundAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, paddingVertical: 10, alignItems: 'center' },
  partButtonText: { color: colors.goldBright, fontSize: 10, fontWeight: '900' },
  inlineDelete: { alignSelf: 'center', paddingVertical: 11, paddingHorizontal: 14, marginTop: 10 },
  inlineDeleteText: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  shareGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  shareTile: { minWidth: '30%', flexGrow: 1, backgroundColor: colors.backgroundAlt, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.goldSoft, paddingVertical: 12, paddingHorizontal: 10 },
  shareTileDisabled: { borderColor: colors.borderSoft, opacity: 0.55 },
  shareTileTitle: { color: colors.text, fontWeight: '900', fontSize: 12 },
  shareTileTitleDisabled: { color: colors.textDim },
  shareTileSub: { color: colors.goldBright, fontSize: 8, fontWeight: '900', marginTop: 4, letterSpacing: 0.7 },
  audioParts: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 13 },
  audioPartsTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  modeButton: { minWidth: '30%', flexGrow: 1, backgroundColor: colors.backgroundAlt, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center' },
  modeButtonText: { color: colors.goldBright, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  documentSection: { marginTop: 4 },
  qaCard: { marginTop: 10, backgroundColor: colors.backgroundAlt, borderRadius: radii.medium, borderLeftWidth: 3, borderLeftColor: colors.gold, padding: 12 },
  qaQuestion: { color: colors.text, fontWeight: '900', marginBottom: 6, lineHeight: 20 },
  outputActions: { marginTop: 18, gap: 8 },
  exportButton: { backgroundColor: colors.gold, borderRadius: radii.medium, padding: 14, alignItems: 'center' },
  exportText: { color: colors.background, fontWeight: '900', letterSpacing: 0.7, fontSize: 11 },
  outputDelete: { borderRadius: radii.medium, padding: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.dangerSurface, backgroundColor: colors.backgroundAlt },
  outputDeleteText: { color: colors.danger, fontWeight: '800', fontSize: 10 },
  error: { backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.danger, padding: 15, borderRadius: radii.medium, marginTop: 16 },
  errorTitle: { fontWeight: '900', color: colors.danger, marginBottom: 5 },
  delete: { padding: 18, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: colors.dangerSurface, borderRadius: radii.medium },
  deleteText: { color: colors.danger, fontWeight: '800' },
});
