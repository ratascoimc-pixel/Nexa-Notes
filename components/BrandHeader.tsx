import { Image, StyleSheet, Text, View } from 'react-native';
export function BrandHeader({ compact = false }: { compact?: boolean }) {
  return <View style={s.wrap}><Image source={require('../assets/nexa-notes-logo.png')} style={[s.logo, compact && s.compact]} resizeMode="contain"/>{!compact && <Text style={s.tag}>RECORD • TRANSCRIBE • ORGANIZE</Text>}</View>;
}
const s=StyleSheet.create({wrap:{alignItems:'center'},logo:{width:215,height:145},compact:{width:120,height:72},tag:{fontSize:11,letterSpacing:2.1,color:'#26344F',fontWeight:'800'}});
