import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[s.wrap, compact && s.compactWrap]}>
      <Image
        source={require('../assets/notz-icon.png')}
        style={[s.logo, compact && s.compactLogo]}
        resizeMode="contain"
      />
      <View style={s.copy}>
        <Text style={[s.name, compact && s.compactName]}>NOTZ</Text>
        <Text style={s.family}>by Master Key One</Text>
        {!compact && <Text style={s.tag}>CAPTURE. TRANSCRIBE. ORGANIZE.</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  compactWrap: { gap: 10 },
  logo: { width: 64, height: 64, borderRadius: 15 },
  compactLogo: { width: 54, height: 54, borderRadius: 13 },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: 5 },
  compactName: { fontSize: 22, letterSpacing: 4 },
  family: { color: colors.goldBright, fontSize: 11, marginTop: 1, letterSpacing: 0.7, fontWeight: '700' },
  tag: { color: colors.textMuted, fontSize: 10, marginTop: 8, letterSpacing: 1.7, fontWeight: '800' },
});
