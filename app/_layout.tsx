import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
export default function Layout(){return <><StatusBar style="dark"/><Stack screenOptions={{headerShadowVisible:false,headerStyle:{backgroundColor:'#F7F9FF'},headerTintColor:'#0B1736',contentStyle:{backgroundColor:'#F7F9FF'}}}><Stack.Screen name="index" options={{headerShown:false}}/><Stack.Screen name="library" options={{title:'My Recordings'}}/><Stack.Screen name="recording/[id]" options={{title:'Recording'}}/></Stack></>}
