const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('fs');
const vm = require('vm');
const calls=[]; let reply={}, ok=true;
const api={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/cloud.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
 exports:api, process:{env:{EXPO_PUBLIC_SUPABASE_URL:'https://example.supabase.co/',EXPO_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
 fetch:async(url,options)=>{calls.push({url,options});return {ok,json:async()=>reply};}
});
(async()=>{
 reply={access_token:'test-session',user:{email:'owner@example.com'}};
 await api.signIn('owner@example.com','example-password');
 assert.equal(api.cloudUser,'owner@example.com');
 reply=[]; await api.listShared();
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer test-session');
 await api.invite('note-id',' PERSON@EXAMPLE.COM ','viewer');
 assert.deepEqual(JSON.parse(calls.at(-1).options.body),{note_id:'note-id',email:'person@example.com',role:'viewer'});
 await api.saveShared({id:'note-id',revision:7},'Title','Edited text');
 assert.deepEqual(JSON.parse(calls.at(-1).options.body),{note:'note-id',expected_revision:7,new_title:'Title',new_body:'Edited text'});
 ok=false;reply={message:'This note changed'};
 await assert.rejects(()=>api.saveShared({id:'note-id',revision:7},'Title','Draft'),/This note changed/);
 ok=true;reply=[];await api.revoke('note-id','person+test@example.com');
 assert.equal(calls.at(-1).options.method,'DELETE');assert.match(calls.at(-1).url,/person%2Btest%40example.com/);
 api.signOut();assert.equal(api.cloudUser,'');await api.listShared();assert.equal(calls.at(-1).options.headers.Authorization,undefined);
 console.log('PASS: authenticated requests, invitation normalization, revision guards, conflict errors, encoded revocation, session clearing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
