'use strict';
(() => {
 const base='https://nrkbhjqiagvxtcmyusne.supabase.co/auth/v1';
 const apikey='sb_publishable_7_cD6mH0q4PpRle9_MrTfQ_aZwqiAvt';
 const message=document.getElementById('message'),panel=document.getElementById('code-panel'),success=document.getElementById('success');
 const fragment=new URLSearchParams(location.hash.slice(1));
 // Never save, display, or forward session tokens received in a redirect.
 const confirmed=fragment.has('access_token')&&!fragment.has('error');
 const failed=fragment.has('error')||fragment.has('error_code');
 history.replaceState(null,'',location.pathname);
 function showSuccess(){message.textContent='Your email is confirmed.';success.hidden=false;panel.open=false;}
 if(confirmed)showSuccess();
 else {message.textContent=failed?'That confirmation link is invalid or expired. Request a new email below and use its code.':'Enter the confirmation code from your latest email, or request a fresh email below.';panel.open=true;}
 let working=false,cooldown=0;
 async function call(endpoint,data){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try {const response=await fetch(base+endpoint,{method:'POST',headers:{apikey,'Content-Type':'application/json'},body:JSON.stringify(data),signal:controller.signal});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.msg||result.error_description||result.message||'Verification failed. Request a new email and try again.');
   return result;
  } finally {clearTimeout(timer);}
 }
 async function perform(fn){if(working)return;working=true;document.getElementById('verify').disabled=true;document.getElementById('resend').disabled=true;
  try{await fn();}catch(error){message.textContent=error.name==='AbortError'?'The request timed out. Check your connection and try again.':error.message;}
  finally{working=false;document.getElementById('verify').disabled=false;document.getElementById('resend').disabled=false;}}
 document.getElementById('verify-form').addEventListener('submit',event=>{event.preventDefault();void perform(async()=>{
  const email=document.getElementById('email').value.trim().toLowerCase(),token=document.getElementById('code').value.trim();
  await call('/verify',{email,token,type:'email'});document.getElementById('code').value='';showSuccess();
 });});
 document.getElementById('resend').addEventListener('click',()=>{void perform(async()=>{
  const emailField=document.getElementById('email');if(!emailField.reportValidity())return;
  if(Date.now()<cooldown){message.textContent='Please wait one minute before requesting another email.';return;}
  await call('/resend',{type:'signup',email:emailField.value.trim().toLowerCase()});cooldown=Date.now()+60000;
  document.getElementById('code').value='';message.textContent='A new confirmation email was requested. Check your inbox and Spam, then enter the code from the newest message.';
 });});
})();
