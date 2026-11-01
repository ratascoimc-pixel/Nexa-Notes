import { useEffect, useState } from 'react';
import { Alert, AppState, Share, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../constants/theme';
import { getRecording } from '../lib/store';
import * as cloud from '../lib/cloud';
export default function Shared() {
 const { source }=useLocalSearchParams<{source?:string}>();
 const [signed,setSigned]=useState(Boolean(cloud.cloudUser)),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [notes,setNotes]=useState<cloud.SharedNote[]>([]),[selected,setSelected]=useState<cloud.SharedNote|null>(null);
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[recipient,setRecipient]=useState(''),[role,setRole]=useState('viewer');
 const [people,setPeople]=useState<{email:string;role:string}[]>([]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}catch(e:any){Alert.alert('Shared Notes',e.message);}finally{setBusy(false);}};
 useEffect(()=>{if(source) getRecording(source).then(n=>{if(n){setTitle(n.title);setBody([n.transcript, n.notes ? JSON.stringify(n.notes,null,2):'',n.documents?JSON.stringify(n.documents,null,2):''].filter(Boolean).join('\n\n'));setDirty(true);}}).catch(e=>setStatus(e.message));},[source]);
 useEffect(()=>{
 if(!signed)return;
 let active=true;
 const refresh=async()=>{try{const rows=await cloud.listShared();if(!active)return;setNotes(rows);setStatus('Up to date');if(selected&&!dirty){const next=rows.find(n=>n.id===selected.id);if(next){setSelected(next);setTitle(next.title);setBody(next.body);}else{setSelected(null);setTitle('');setBody('');setStatus('This note is no longer shared with you.');}}}catch(e:any){if(active)setStatus(e.message);}};
 void refresh();const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},8000);
 return()=>{active=false;clearInterval(timer);};
 },[signed,selected?.id,dirty]);
 const button=(label:string,fn:()=>void)=><Pressable disabled={busy} style={s.button} onPress={fn}><Text style={s.label}>{label}</Text></Pressable>;
 return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><Text style={s.heading}>Shared Notes</Text>
 {!signed?<><Text style={s.text}>Sign in on Android or iPhone with the same email used for your invitations.</Text><TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/><TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry/>{button('Sign in',()=>void run(async()=>{await cloud.signIn(email.trim(),password);setPassword('');setSigned(true);}))}{button('Create account',()=>void run(async()=>{await cloud.signUp(email.trim(),password);setPassword('');Alert.alert('Check your email','Confirm your email, then return here to sign in.');}))}</>:<>
 <Text style={s.text}>{cloud.cloudUser} · {status}</Text>
 {notes.map(n=><View key={n.id}>{button(n.title,()=>{if(dirty){Alert.alert('Unsaved changes','Save your draft before opening another note.');return;}setSelected(n);setTitle(n.title);setBody(n.body);setPeople([]);})}</View>)}
 {button('New shared note',()=>{if(dirty)return Alert.alert('Unsaved changes','Save your draft first.');setSelected(null);setTitle('');setBody('');setPeople([]);})}
 <TextInput style={s.input} value={title} placeholder="Note title" placeholderTextColor={colors.textMuted} onChangeText={v=>{setTitle(v);setDirty(true);}}/>
 <TextInput style={[s.input,{minHeight:220,textAlignVertical:'top'}]} multiline value={body} placeholder="Write or edit your note" placeholderTextColor={colors.textMuted} onChangeText={v=>{setBody(v);setDirty(true);}}/>
 {button('Copy or send this draft',()=>void run(async()=>{await Share.share({message:title+'\n\n'+body});}))}
 {selected&&button('Reload latest saved version',()=>Alert.alert('Reload note?', 'This replaces the draft on this screen. Copy or send your draft first if you want to keep it.',[{text:'Cancel',style:'cancel'},{text:'Reload',onPress:()=>void run(async()=>{const rows=await cloud.listShared();const n=rows.find(x=>x.id===selected.id);if(!n)throw new Error('This note is no longer available.');setSelected(n);setTitle(n.title);setBody(n.body);setDirty(false);})}]))}
 {button(busy?'Working…':'Save shared note',()=>void run(async()=>{if(!title.trim())throw new Error('Enter a title.');if(selected){const n=await cloud.saveShared(selected,title.trim(),body);setSelected(n);}else{const rows=await cloud.createShared(title.trim(),body);setSelected(rows[0]);}setDirty(false);setNotes(await cloud.listShared());setStatus('Saved online. Others receive changes when connected.');}))}
 {selected&&<><Text style={s.text}>Owner sharing controls · Add one email at a time. Recipients create and confirm an account with that email; no invitation email is sent yet.</Text><TextInput style={s.input} value={recipient} onChangeText={setRecipient} placeholder="Recipient email" placeholderTextColor={colors.textMuted} autoCapitalize="none"/>{button(role==='viewer'?'View only ✓ · Tap to allow editing':'Can edit ✓ · Tap for view only',()=>setRole(role==='viewer'?'editor':'viewer'))}{button('Give access',()=>void run(async()=>{await cloud.invite(selected.id,recipient,role);setRecipient('');setPeople(await cloud.members(selected.id));}))}{button('Show people with access',()=>void run(async()=>setPeople(await cloud.members(selected.id))))}{people.map(p=><View key={p.email}><Text style={s.text}>{p.email} · {p.role}</Text>{button('Remove access',()=>void run(async()=>{await cloud.revoke(selected.id,p.email);setPeople(await cloud.members(selected.id));}))}</View>)}</>}
 <Text style={s.text}>Updates refresh every 8 seconds while this screen is open. Unsaved drafts stay on this screen; save before leaving. If someone else saves first, your save is blocked so their changes are protected. Copy your draft before reloading.</Text>
 {button('Sign out',()=>{if(dirty)return Alert.alert('Unsaved changes','Save your draft first.');cloud.signOut();setSigned(false);setNotes([]);setSelected(null);setTitle('');setBody('');setPeople([]);})}
 </>}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:20,gap:12,backgroundColor:colors.background},heading:{color:colors.gold,fontSize:26,fontWeight:'800'},text:{color:colors.textMuted},input:{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:14},button:{padding:14,backgroundColor:colors.blueSoft,borderRadius:12},label:{color:colors.text,fontWeight:'700'}});
