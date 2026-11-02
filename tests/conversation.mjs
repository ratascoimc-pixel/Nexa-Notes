import assert from 'node:assert/strict';
import { conversationTurns } from '../server/conversation.js';
const turns=conversationTurns({segments:[
 {speaker:'A',start:0,end:2,text:' Hello. '},
 {speaker:'B',start:2,end:4,text:'Good morning.'},
 {speaker:'A',start:4,end:5,text:'How are you?'}
]});
assert.deepEqual(turns.map(x=>x.speaker),['Speaker 1','Speaker 2','Speaker 1']);
assert.equal(turns[0].text,'Hello.');assert.equal(turns[2].start,4);
assert.equal(conversationTurns({segments:[{speaker:'B',start:0,end:1,text:'Another part'}]})[0].speaker,'Speaker 1');
assert.throws(()=>conversationTurns({text:'No speaker metadata'}),/not returned/);
assert.throws(()=>conversationTurns({segments:[]}),/No speech/);
assert.throws(()=>conversationTurns({segments:[{speaker:'',start:0,end:1,text:'Hello'}]}),/Invalid speaker/);
assert.throws(()=>conversationTurns({segments:[{speaker:'A',start:5,end:1,text:'Hello'}]}),/Invalid speaker/);
console.log('PASS: speaker continuity within audio part, timestamps, text preservation, per-part labels, missing and invalid segment rejection.');

const continuous = conversationTurns({segments:[
 {speaker:'A',start:0,end:1,text:'First sentence.'},
 {speaker:'A',start:2,end:3,text:'Second sentence.'},
 {speaker:'A',start:9,end:10,text:'Still the same person after a pause.'},
 {speaker:'B',start:11,end:12,text:'Now a different person.'},
 {speaker:'B',start:12,end:13,text:'Continuing their answer.'},
 {speaker:'A',start:14,end:15,text:'The first person replies.'}
]});
assert.equal(continuous.length,3);
assert.equal(continuous[0].text,'First sentence. Second sentence. Still the same person after a pause.');
assert.equal(continuous[0].start,0); assert.equal(continuous[0].end,10);
assert.equal(continuous[1].text,'Now a different person. Continuing their answer.');
assert.equal(continuous[2].speaker,'Speaker 1');
console.log('PASS: consecutive same-speaker chunks merge across pauses; actual speaker changes preserve separate turns.');
