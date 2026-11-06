const ts = require('typescript');
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://test.invalid';
const code = ts.transpileModule(fs.readFileSync('services/api.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const output = {exports:{}};
let calls = 0;
let fail = true;
let gatewayErrors = 0;
const delays = [];
const context = {exports:output.exports,process,FormData:class {append(){}},setTimeout:(fn, delay)=>{
 delays.push(delay);
 fn();
},fetch:async()=> {
 calls++;
 if(fail && calls === 2) return {ok:false,status:400,text:async()=> 'part failed'};
 if(gatewayErrors > 0) {
  gatewayErrors--;
  return {ok:false,status:502,text:async()=> 'error code: 502'};
 }
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
 gatewayErrors=2;
 const result=await output.exports.transcribeRecording({...item,transcriptionParts:saved},async()=>{});
 assert.equal(calls,5);
 assert.deepEqual(delays,[3000,10000]);
 assert.equal(result,'first\n\nsecond');
 console.log('PASS: gateway retries and transcript recovery without repeating completed audio');
})().catch(e=>{console.error(e);process.exitCode=1;});
