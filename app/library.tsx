import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, radii } from '../constants/theme';
import { listRecordings } from '../lib/store';
import { NotzRecording } from '../types';

const FILTERS = ['All', 'Study Notz', 'Outlines', 'Summaries', 'Transcripts'] as const;
type Filter = typeof FILTERS[number];

const duration = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

function hasOutline(item: NotzRecording) {
  return Boolean(item.documents?.['detailed-outline'] || item.documents?.['simple-outline']);
}

function category(item: NotzRecording) {
  if (item.notes) return 'STUDY NOTZ';
  if (hasOutline(item)) return 'OUTLINE';
  if (item.documents?.summary) return 'SUMMARY';
  if (item.transcript) return 'TRANSCRIPT';
  return item.segmentUris.length ? 'RECORDING' : 'SAVED OUTPUTS';
}

export default function Library() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const rawRequested = String(params.filter || '').toLowerCase().replace('study notes', 'study notz');
  const requested = FILTERS.find((value) => value.toLowerCase() === rawRequested);
  const [items, setItems] = useState<NotzRecording[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(requested || 'All');

  const load = useCallback(async () => setItems(await listRecordings()), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (needle && !item.title.toLowerCase().includes(needle) && !String(item.transcript || '').toLowerCase().includes(needle)) return false;
      if (filter === 'Study Notz' && !item.notes) return false;
      if (filter === 'Outlines' && !hasOutline(item)) return false;
      if (filter === 'Summaries' && !item.documents?.summary) return false;
      if (filter === 'Transcripts' && !item.transcript) return false;
      return true;
    });
  }, [items, query, filter]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.root}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.eyebrow}>NOTZ LIBRARY</Text>
            <Text style={s.heading}>My Notes</Text>
          </View>
          <Pressable style={s.newButton} onPress={() => router.replace('/')}>
            <Text style={s.newButtonText}>＋ NEW</Text>
          </Pressable>
        </View>

        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search recordings and transcripts"
          placeholderTextColor={colors.textDim}
          selectionColor={colors.goldBright}
        />

        <View style={s.filters}>
          {FILTERS.map((value) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[s.filter, filter === value && s.filterActive]}>
              <Text style={[s.filterText, filter === value && s.filterTextActive]}>{value}</Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          style={s.list}
          contentContainerStyle={shown.length ? s.listContent : s.emptyContent}
          data={shown}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} />}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Text style={s.emptyTitle}>{items.length ? 'Nothing matches this filter' : 'No recordings yet'}</Text>
              <Text style={s.emptyText}>{items.length ? 'Try another filter or search term.' : 'Tap New Recording to capture your first note.'}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const formatCount = (item.notes ? 1 : 0) + Object.keys(item.documents || {}).length;
            const pdfCount = (item.transcriptPdfUri ? 1 : 0) + (item.pdfUri ? 1 : 0) + Object.keys(item.outputPdfUris || {}).length;
            return (
              <Pressable style={s.card} onPress={() => router.push(`/recording/${item.id}`)}>
                <View style={s.cardTop}>
                  <Text style={s.category}>{category(item)}</Text>
                  <Text style={s.arrow}>›</Text>
                </View>
                <Text style={s.title}>{item.title}</Text>
                <Text style={s.meta}>
                  {new Date(item.createdAt).toLocaleDateString()} • {duration(item.durationMs)} • {item.segmentUris.length
                    ? `${item.segmentUris.length} audio part${item.segmentUris.length === 1 ? '' : 's'}`
                    : 'audio deleted'}
                </Text>
                <View style={s.badges}>
                  <Badge label="Audio" active={Boolean(item.segmentUris.length)} />
                  <Badge label="Transcript" active={Boolean(item.transcript)} />
                  <Badge label={`Formats ${formatCount}`} active={Boolean(formatCount)} />
                  <Badge label={`PDF ${pdfCount}`} active={Boolean(pdfCount)} />
                </View>
              </Pressable>
            );
          }}
        />

        <View style={s.bottomNav}>
          <Nav label="Home" onPress={() => router.replace('/')} />
          <Nav label="Library" active onPress={() => {}} />
          <Pressable style={s.recordNav} onPress={() => router.replace('/')}><Text style={s.recordNavText}>●</Text></Pressable>
          <Nav label="Outlines" onPress={() => setFilter('Outlines')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Badge({ label, active }: { label: string; active: boolean }) {
  return <Text style={[s.badge, active && s.badgeActive]}>{label}</Text>;
}

function Nav({ label, active = false, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return <Pressable style={s.navItem} onPress={onPress}><Text style={[s.navText, active && s.navTextActive]}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 18, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.goldBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  heading: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
  newButton: { backgroundColor: colors.gold, borderRadius: radii.pill, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.goldBright },
  newButtonText: { color: colors.background, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  search: { marginTop: 16, backgroundColor: colors.surface, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.blueSoft, color: colors.text, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft },
  filterActive: { backgroundColor: colors.gold, borderColor: colors.goldBright },
  filterText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: colors.background },
  list: { flex: 1, marginTop: 14 },
  listContent: { paddingBottom: 18 },
  emptyContent: { flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.blueSoft, padding: 17, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { color: colors.goldBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  arrow: { color: colors.blueBright, fontSize: 27, lineHeight: 27 },
  title: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 3 },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 7 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: { color: colors.textDim, backgroundColor: colors.backgroundAlt, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontWeight: '800' },
  badgeActive: { color: colors.goldBright, borderWidth: 1, borderColor: colors.goldSoft },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  emptyText: { color: colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  bottomNav: { flexDirection: 'row', alignItems: 'center', minHeight: 70, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.background },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  navText: { color: colors.textDim, fontSize: 10, fontWeight: '800' },
  navTextActive: { color: colors.goldBright },
  recordNav: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, borderWidth: 2, borderColor: colors.blueSoft },
  recordNavText: { color: colors.background, fontSize: 24 },
});
