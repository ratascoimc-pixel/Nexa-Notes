import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { BrandHeader } from '../components/BrandHeader';
import { saveRecording } from '../lib/store';

// Rotate well before a single segment can approach the transcription upload limit.
// To the user this remains one continuous recording.
const SEGMENT_MS = 8 * 60 * 1000;
const recorderOptions = { ...RecordingPresets.HIGH_QUALITY, directory: 'document' as const };

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
        Alert.alert('Microphone permission needed', 'Nexa Notes needs microphone access to record.');
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
    const t = setInterval(() => {
      setElapsed(Date.now() - startedAt.current - pausedTotal.current);
    }, 250);
    return () => clearInterval(t);
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

  return (
    <SafeAreaView style={s.root}>
      <BrandHeader />
      <View style={s.card}>
        <Text style={s.label}>{active ? (paused ? 'PAUSED' : 'RECORDING') : 'READY TO RECORD'}</Text>
        <Text style={s.timer}>{time}</Text>
        <Text style={s.hint}>
          {active
            ? 'Keep going. Nexa Notes protects long sessions automatically while you record.'
            : 'No 10-minute limit — record until you press Stop.'}
        </Text>
        <View style={s.wave}>
          <Text style={s.waveText}>{active && !paused ? '▂▄▆█▅▃▇▄▂  ▃▇█▅▂' : '──────────────'}</Text>
        </View>
        {!active ? (
          <Pressable style={s.primary} onPress={start}>
            <Text style={s.primaryText}>START RECORDING</Text>
          </Pressable>
        ) : (
          <View style={s.row}>
            <Pressable style={s.secondary} onPress={togglePause} disabled={busy}>
              <Text style={s.secondaryText}>{paused ? 'RESUME' : 'PAUSE'}</Text>
            </Pressable>
            <Pressable style={s.stop} onPress={stop} disabled={busy}>
              <Text style={s.primaryText}>{busy ? 'SAVING…' : 'STOP'}</Text>
            </Pressable>
          </View>
        )}
      </View>
      <Pressable style={s.library} onPress={() => router.push('/library')}>
        <Text style={s.libraryTitle}>My Recordings</Text>
        <Text style={s.libraryText}>Transcripts, study notes and PDFs →</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9FF', padding: 22 },
  card: { marginTop: 20, backgroundColor: '#fff', borderRadius: 28, padding: 26, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 18, elevation: 4 },
  label: { fontSize: 12, letterSpacing: 2, color: '#623BE7', fontWeight: '900' },
  timer: { fontSize: 46, fontWeight: '900', color: '#071735', marginTop: 12 },
  hint: { textAlign: 'center', color: '#667085', lineHeight: 20, marginTop: 8, maxWidth: 330 },
  wave: { height: 62, justifyContent: 'center' },
  waveText: { fontSize: 22, color: '#315FF4', letterSpacing: 2 },
  primary: { width: '100%', backgroundColor: '#315FF4', paddingVertical: 18, borderRadius: 18, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.7 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  secondary: { flex: 1, backgroundColor: '#EDF1FF', paddingVertical: 18, borderRadius: 18, alignItems: 'center' },
  secondaryText: { color: '#233A82', fontWeight: '900' },
  stop: { flex: 1, backgroundColor: '#6B36E8', paddingVertical: 18, borderRadius: 18, alignItems: 'center' },
  library: { marginTop: 18, backgroundColor: '#101D3D', padding: 19, borderRadius: 20 },
  libraryTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  libraryText: { color: '#C7D0E7', marginTop: 4 },
});
