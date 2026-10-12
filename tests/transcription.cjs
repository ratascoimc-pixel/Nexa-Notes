const ts = require('typescript');
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://test.invalid';
const code = ts.transpileModule(fs.readFileSync('services/api.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const output = {exports:{}};
let calls = 0;
let fail = true;
const context = {exports:output.exports,process,FormData:class {append(){}},setTimeout,fetch:async()=> {
 calls++;
 if(fail && calls === 2) return {ok:false,text:async()=> 'part failed'};
 return {ok:true,json:async()=>({text:calls===1?'first':'second'})};
}};
vm.runInNewContext(code,context);
(async()=>{
 const item={id:'test',segmentUris:['one','two']};
 let saved;
 await assert.rejects(output.exports.transcribeRecording(item,async parts=>{saved=JSON.parse(JSON.stringify(parts));}),/part failed/);
 assert.equal(saved.length,1);
 assert.equal(saved[0].text,'first');
 fail=false;
 const result=await output.exports.transcribeRecording({...item,transcriptionParts:saved},async()=>{});
 assert.equal(calls,3);
 assert.equal(result,'first\n\nsecond');
 console.log('PASS: partial transcript checkpoint and resume without repeating completed audio');
})().catch(e=>{console.error(e);process.exitCode=1;});
