
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { BrandHeader } from '../components/BrandHeader';
import { colors, radii } from '../constants/theme';
import { saveRecording } from '../lib/store';

// Rotate well before a single segment can approach the transcription upload limit.
// To the user this remains one continuous recording.
const SEGMENT_MS = 8 * 60 * 1000;
const recorderOptions = { ...RecordingPresets.HIGH_QUALITY, directory: 'document' as const };
const WAVE_BASE = [20, 34, 48, 29, 58, 38, 66, 42, 25, 52, 35, 61, 30, 47, 24, 55, 36, 46];

export default function Home() {
  const recorder = useAudioRecorder(recorderOptions);
  const state = useAudioRecorderState(recorder, 250);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(0);
  const pauseStarted = useRef(0);
  const pausedTotal = useRef(0);
  const rotating = useRef(false);
  const segmentsRef = useRef<string[]>([]);

  useEffect(() => {
    (async () => {
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if (!p.granted) {
        Alert.alert('Microphone permission needed', 'Notz needs microphone access to record.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
    })().catch((e) => Alert.alert('Audio setup', e?.message || 'Could not configure audio.'));
  }, []);

  useEffect(() => {
    if (!active || paused) return;
    const timer = setInterval(() => {
      setElapsed(Date.now() - startedAt.current - pausedTotal.current);
    }, 250);
    return () => clearInterval(timer);
  }, [active, paused]);

  useEffect(() => {
    if (active && !paused && state.durationMillis >= SEGMENT_MS && !rotating.current) {
      void rotateSegment();
    }
  }, [active, paused, state.durationMillis]);

  async function rotateSegment() {
    rotating.current = true;
    try {
      await recorder.stop();
      if (recorder.uri && !segmentsRef.current.includes(recorder.uri)) {
        segmentsRef.current = [...segmentsRef.current, recorder.uri];
      }
      await recorder.prepareToRecordAsync(recorderOptions);
      recorder.record();
    } catch (e: any) {
      Alert.alert('Recording issue', e?.message || 'Could not continue the recording.');
    } finally {
      rotating.current = false;
    }
  }

  async function start() {
    try {
      segmentsRef.current = [];
      setElapsed(0);
      pausedTotal.current = 0;
      startedAt.current = Date.now();
      await recorder.prepareToRecordAsync(recorderOptions);
      recorder.record();
      setActive(true);
      setPaused(false);
    } catch (e: any) {
      Alert.alert('Could not start recording', e?.message || 'Unknown recording error.');
    }
  }

  function togglePause() {
    if (!active) return;
    if (paused) {
      pausedTotal.current += Date.now() - pauseStarted.current;
      recorder.record();
      setPaused(false);
    } else {
      pauseStarted.current = Date.now();
      recorder.pause();
      setPaused(true);
    }
  }

  async function stop() {
    if (busy) return;
    setBusy(true);
    try {
      let finalElapsed = elapsed;
      if (paused) {
        pausedTotal.current += Date.now() - pauseStarted.current;
        finalElapsed = Date.now() - startedAt.current - pausedTotal.current;
      } else {
        finalElapsed = Date.now() - startedAt.current - pausedTotal.current;
      }

      await recorder.stop();
      const all = [...segmentsRef.current];
      if (recorder.uri && !all.includes(recorder.uri)) all.push(recorder.uri);
      if (!all.length) throw new Error('No audio file was created.');

      const id = `rec_${Date.now()}`;
      const item = {
        id,
        title: `Recording ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        durationMs: Math.max(0, finalElapsed),
        segmentUris: all,
        status: 'recorded' as const,
      };
      await saveRecording(item);
      setActive(false);
      setPaused(false);
      segmentsRef.current = [];
      setElapsed(item.durationMs);
      router.push(`/recording/${id}`);
    } catch (e: any) {
      Alert.alert('Could not save recording', e?.message || 'Unknown save error.');
    } finally {
      setBusy(false);
    }
  }

  const sec = Math.floor(elapsed / 1000);
  const time = `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const pulse = Math.floor(elapsed / 250);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.root} showsVerticalScrollIndicator={false}>
        <BrandHeader />

        <View style={s.recordCard}>
          <View style={s.statusRow}>
            <View style={[s.statusDot, active && !paused && s.statusDotLive]} />
            <Text style={s.label}>{active ? (paused ? 'PAUSED' : 'RECORDING') : 'READY TO RECORD'}</Text>
          </View>
          <Text style={s.timer}>{time}</Text>
          <Text style={s.hint}>
            {active
              ? 'Keep going. Long sessions are protected automatically while you record.'
              : 'Record until you press Stop. There is no 10-minute recording limit.'}
          </Text>

          <View style={s.wave} accessibilityLabel="Recording waveform">
            {WAVE_BASE.map((base, index) => {
              const moving = active && !paused;
              const bump = moving ? ((index + pulse) % 4) * 5 : 0;
              const height = moving ? Math.min(72, base + bump) : 4;
              return <View key={index} style={[s.waveBar, { height }]} />;
            })}
          </View>

          <Pressable
            style={[s.recordButton, active && s.stopButton, busy && s.disabled]}
            onPress={active ? stop : start}
            disabled={busy}
          >
            <View style={[s.recordInner, active && s.stopInner]}>
              <Text style={s.recordGlyph}>{active ? '■' : '●'}</Text>
            </View>
          </Pressable>
          <Text style={s.recordCaption}>{active ? (busy ? 'SAVING…' : 'STOP & SAVE') : 'NEW RECORDING'}</Text>

          {active ? (
            <Pressable style={s.pauseButton} onPress={togglePause} disabled={busy}>
              <Text style={s.pauseText}>{paused ? 'RESUME RECORDING' : 'PAUSE RECORDING'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={s.quickRow}>
          <QuickAction title="Library" subtitle="All notes" onPress={() => router.push('/library')} />
          <QuickAction title="Outlines" subtitle="Organized" onPress={() => router.push('/library?filter=Outlines')} />
          <QuickAction title="Export" subtitle="PDFs" onPress={() => router.push('/library?filter=Study%20Notes')} />
        </View>

        <Pressable style={s.libraryCard} onPress={() => router.push('/library')}>
          <View>
            <Text style={s.libraryEyebrow}>MY NOTES</Text>
            <Text style={s.libraryTitle}>Recordings & organized notes</Text>
            <Text style={s.libraryText}>Open transcripts, study notes, outlines and saved PDFs.</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={s.quickCard} onPress={onPress}>
      <Text style={s.quickTitle}>{title}</Text>
      <Text style={s.quickSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  root: { padding: 20, paddingBottom: 42, backgroundColor: colors.background, flexGrow: 1 },
  recordCard: {
    marginTop: 22,
    backgroundColor: colors.surface,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textDim },
  statusDotLive: { backgroundColor: colors.goldBright },
  label: { fontSize: 11, letterSpacing: 2.1, color: colors.goldBright, fontWeight: '900' },
  timer: { fontSize: 46, fontWeight: '900', color: colors.text, marginTop: 12, letterSpacing: 1 },
  hint: { textAlign: 'center', color: colors.textMuted, lineHeight: 20, marginTop: 8, maxWidth: 335, fontSize: 13 },
  wave: { height: 86, width: '100%', flexDirection: 'row', gap: 5, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  waveBar: { width: 4, borderRadius: 4, backgroundColor: colors.gold },
  recordButton: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderWidth: 7,
    borderColor: colors.goldSoft,
  },
  stopButton: { backgroundColor: colors.goldBright },
  recordInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  stopInner: { borderRadius: 17 },
  recordGlyph: { color: colors.goldBright, fontSize: 27, lineHeight: 31 },
  recordCaption: { color: colors.text, fontWeight: '900', letterSpacing: 1.4, marginTop: 12, fontSize: 12 },
  pauseButton: { marginTop: 16, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border },
  pauseText: { color: colors.goldBright, fontWeight: '800', letterSpacing: 0.8, fontSize: 11 },
  disabled: { opacity: 0.55 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  quickCard: { flex: 1, minHeight: 78, backgroundColor: colors.surfaceRaised, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderSoft, padding: 13, justifyContent: 'center' },
  quickTitle: { color: colors.text, fontWeight: '900', fontSize: 14 },
  quickSubtitle: { color: colors.goldBright, marginTop: 4, fontSize: 11, fontWeight: '700' },
  libraryCard: { marginTop: 16, backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: 19, flexDirection: 'row', alignItems: 'center' },
  libraryEyebrow: { color: colors.goldBright, letterSpacing: 1.8, fontSize: 10, fontWeight: '900' },
  libraryTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 5 },
  libraryText: { color: colors.textMuted, marginTop: 5, lineHeight: 18, paddingRight: 22, fontSize: 12 },
  arrow: { color: colors.goldBright, fontSize: 34, marginLeft: 'auto' },
});
