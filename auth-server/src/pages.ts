import { config } from "./config.js";

const brand = () => `<div class="brand" aria-label="Kosh — Bharosa, har kadam">
  <svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="22.5" fill="#111214" stroke="#e4e6ea" stroke-width="1.2"/>
    <circle cx="24" cy="24" r="19.6" fill="none" stroke="#d9b36a" stroke-width=".8"/>
    <path d="M24 11c6.2 7 6.2 16.8 0 24-6.2-7.2-6.2-17 0-24Z" fill="#e4e6ea"/>
    <path d="M13.5 18c8.7 2 13.2 9.2 10.5 17-7.5-2.8-11.4-9.5-10.5-17Zm21 0c-8.7 2-13.2 9.2-10.5 17 7.5-2.8 11.4-9.5 10.5-17Z" fill="#a9abb2"/>
    <path d="M13 37.5Q24 42.5 35 37.5" fill="none" stroke="#e4e6ea" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
  <span class="brand-copy"><span><strong>kosh</strong><b lang="hi">कोष</b></span><small>Bharosa, har kadam.</small></span>
</div>
<p class="demo-notice">Demo bank — not a real financial institution. Never enter real OTPs, PINs, passwords or card details here.</p>`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function shell(title: string, body: string, script = ""): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title><style>
:root{font-family:"Anek Devanagari","Mukta",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f2f2f0;background:#0a0a0c;color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;overflow-x:hidden;background:radial-gradient(circle at 18% 12%,#2a2c32 0,transparent 34%),radial-gradient(circle at 84% 82%,#221b10 0,transparent 27%),#0a0a0c}
body:before{content:"";position:fixed;inset:auto -12vw -36vw auto;width:min(78vw,920px);aspect-ratio:1;border-radius:50%;opacity:.13;pointer-events:none;background:repeating-radial-gradient(ellipse at center,transparent 0 22px,#d9b36a 23px 24px,transparent 25px 42px);transform:rotate(-14deg)}
main{position:relative;width:min(470px,100%);background:linear-gradient(160deg,#1c1d21,#121316);border:1px solid #34363d;border-radius:24px;padding:34px;box-shadow:0 34px 80px -30px #000;overflow:hidden}
main:before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,#d9b36a,transparent)}
.brand{display:flex;align-items:center;gap:12px}.mark{width:42px;height:42px;flex:0 0 auto}.brand-copy{display:grid;line-height:1}.brand-copy>span{display:flex;align-items:baseline}.brand-copy strong{font-size:25px;letter-spacing:-.04em}.brand-copy b{margin-left:7px;color:#d9b36a;font-size:14px}.brand-copy small{margin-top:5px;color:#9c9ea6;font-size:11px;font-weight:600;letter-spacing:.02em}
.demo-notice{margin-top:14px;padding:10px 12px;border:1px solid #71302b;background:#331614;color:#ff9b91;border-radius:11px;font-size:12px;line-height:1.5}
h1{font-size:clamp(32px,7vw,40px);line-height:1.05;letter-spacing:-1.4px;margin:32px 0 10px;text-wrap:balance}p{color:#a9abb2;font-size:14px;line-height:1.6;margin:0}.tabs{display:flex;gap:5px;background:#0e0f12;padding:5px;border:1px solid #2a2c32;border-radius:13px;margin:26px 0 20px}
button{border:1px solid transparent;border-radius:999px;padding:12px 16px;font:inherit;font-weight:700;cursor:pointer;transition:transform 140ms ease,background-color 160ms ease,border-color 160ms ease,color 160ms ease}button:active{transform:scale(.98)}button:focus-visible,input:focus-visible{outline:3px solid #d4a24c;outline-offset:3px}
.tabs button{flex:1;border-radius:9px;background:transparent;color:#9c9ea6;line-height:1.15}.tabs button.active{background:#e4e6ea;color:#0e0f12;box-shadow:0 8px 20px -14px #fff}
label{display:block;color:#d2d3d7;font-size:12px;font-weight:700;margin:15px 0}input{width:100%;margin-top:7px;border:1px solid #3a3d45;border-radius:12px;padding:12px 13px;background:#0e0f12;color:#f2f2f0;font:inherit;transition:border-color 160ms ease,box-shadow 160ms ease}input:focus{border-color:#d9b36a;box-shadow:0 0 0 3px #d9b36a22}
.primary{width:100%;background:#e4e6ea;color:#0e0f12;margin-top:11px}.primary:hover{background:#f4f5f7}.secondary{background:#24262c;color:#e4e6ea}.danger{background:#331614;color:#ff9b91;border-color:#71302b}.row{display:flex;gap:10px;margin-top:22px}.row>*{flex:1}.row .primary{margin-top:0}
.hidden{display:none}.error{color:#ff9b91;background:#331614;border:1px solid #71302b;padding:11px 13px;border-radius:11px;font-size:12px;margin:14px 0}.hint{font-size:11.5px;margin-top:14px;color:#8a8d96}.otp{font:700 24px ui-monospace,monospace;letter-spacing:8px;text-align:center}.scope{padding:12px 14px;border:1px solid #34363d;background:#17181c;border-radius:12px;margin:8px 0;font-size:13px;color:#d2d3d7}
@media(max-width:520px){body{padding:14px}main{padding:26px 20px;border-radius:20px}.tabs button{padding-inline:8px}.row{flex-direction:column}.row .primary{margin-top:0}}
</style></head><body><main>${body}</main>${script}</body></html>`;
}

export function signInPage(): string {
  const firebaseConfig = JSON.stringify({
    apiKey: config.firebaseWebApiKey,
    authDomain: config.firebaseAuthDomain,
    projectId: config.firebaseProjectId,
  }).replaceAll("<", "\\u003c");
  const publicRuntime = JSON.stringify({
    sentinelURL: config.sentinelWebURL,
    testPhone: config.localFirebaseTestPhone,
    testCode: config.localFirebaseTestCode,
  }).replaceAll("<", "\\u003c");
  return shell(
    "Sign in | Kosh (Demo)",
    `${brand()}
<h1>Secure sign in</h1><p>One trusted sign-in for Kosh banking, Mitra guidance and Kavach approvals.</p>
<div class="tabs"><button id="phoneTab" class="active">Mobile OTP</button><button id="staffTab">Net Banking / Password</button></div>
<section id="phonePane"><label>Registered mobile number<input id="phone" type="tel" autocomplete="tel" value="${config.localFirebaseTestPhone}"></label>
<div id="captcha"></div><button id="send" class="primary">Send verification code</button>
<div id="verifyPane" class="hidden"><label>Verification code<input id="code" class="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><button id="verify" class="primary">Verify and continue</button></div>
<p class="hint">Local development uses the configured Firebase test number. Real SMS requires the authorized HTTPS auth domain.</p></section>
<section id="staffPane" class="hidden"><label>Registered Username / Net Banking ID<input id="username" autocomplete="username" placeholder="e.g. sudhir56a7 or officer.mumbai"></label><label>Password<input id="password" type="password" autocomplete="current-password" placeholder="Enter Net Banking or Staff password"></label><button id="staffSignIn" class="primary">Sign in and continue</button>
<p class="hint">Approved retail banking customers & staff operations can sign in with their temporary or assigned credentials.</p></section>
<div id="error" class="error hidden" role="alert"></div>`,
    `<script type="module">
import {initializeApp} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {getAuth,RecaptchaVerifier,signInWithPhoneNumber} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
const firebaseConfig=${firebaseConfig}; const runtime=${publicRuntime};
const qs=new URLSearchParams(location.search); const oauthQuery=location.search.slice(1);
const errorBox=document.querySelector('#error'); let confirmation=null; let verifier=null;
const showError=(error)=>{errorBox.textContent=error?.message||String(error);errorBox.classList.remove('hidden')};
const clearError=()=>errorBox.classList.add('hidden');
function finishLogin(data){
  const destination=data?.redirect_uri||data?.url;
  if(destination){location.assign(destination);return;}
  if(oauthQuery){location.assign('/api/auth/oauth2/authorize?' + oauthQuery);return;}
  location.assign(runtime.sentinelURL);
}
document.querySelector('#phoneTab').onclick=()=>{document.querySelector('#phonePane').classList.remove('hidden');document.querySelector('#staffPane').classList.add('hidden');document.querySelector('#phoneTab').classList.add('active');document.querySelector('#staffTab').classList.remove('active')};
document.querySelector('#staffTab').onclick=()=>{document.querySelector('#staffPane').classList.remove('hidden');document.querySelector('#phonePane').classList.add('hidden');document.querySelector('#staffTab').classList.add('active');document.querySelector('#phoneTab').classList.remove('active')};
document.querySelector('#send').onclick=async()=>{clearError();try{
  let phone=document.querySelector('#phone').value.trim().replace(/[^+\\d]/g,'');
  if(!phone.startsWith('+')){
    if(phone.length===10) phone='+91'+phone;
    else phone='+'+phone;
  }
  const local=['localhost','127.0.0.1','::1'].includes(location.hostname);
  const auth=getAuth(initializeApp(firebaseConfig));
  auth.settings.appVerificationDisabledForTesting=(local || phone===runtime.testPhone) && phone===runtime.testPhone;
  if(verifier){ try { verifier.clear(); } catch(e){} }
  verifier=new RecaptchaVerifier(auth,'captcha',{size:'invisible'});
  confirmation=await signInWithPhoneNumber(auth,phone,verifier);
  document.querySelector('#verifyPane').classList.remove('hidden');
  if(phone===runtime.testPhone) document.querySelector('#code').value=runtime.testCode;
}catch(error){showError(error)}};
document.querySelector('#verify').onclick=async()=>{clearError();try{
  if(!confirmation)throw new Error('Request a verification code first'); const result=await confirmation.confirm(document.querySelector('#code').value.trim());
  const idToken=await result.user.getIdToken(); const response=await fetch('/api/auth/firebase/exchange',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({idToken,oauth_query:oauthQuery})});
  const data=await response.json().catch(()=>({message:'Server returned invalid response'}));
  if(!response.ok)throw new Error(data?.message||data?.error_description||data?.error||data?.code||'Unable to create auth session');
  finishLogin(data);
}catch(error){showError(error)}};
document.querySelector('#staffSignIn').onclick=async()=>{clearError();try{
  const response=await fetch('/api/auth/sign-in/username',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.querySelector('#username').value,password:document.querySelector('#password').value,oauth_query:oauthQuery})});
  const data=await response.json();if(!response.ok)throw new Error(data?.message||'Invalid username or password');finishLogin(data);
}catch(error){showError(error)}};
</script>`,
  );
}

export function consentPage(url: URL): string {
  const query = url.search.slice(1).replaceAll("<", "");
  const scopes = (url.searchParams.get("scope") ?? "banking.read banking.propose")
    .split(" ")
    .filter((scope) => scope.startsWith("banking."));
  const agent = config.agentClients.find((client) => client.id === url.searchParams.get("client_id"));
  const who = agent ? escapeHtml(agent.name) : "Mitra";
  return shell(
    "Authorize | Kosh (Demo)",
    `${brand()}<h1>Allow ${who} access?</h1>
<p>${agent ? "An assistant app outside Kosh" : "The banking assistant"} is asking to act for you. It cannot move money on its own: every payment it proposes waits for your approval in Kavach on the Kosh app, and it never sees your OTP, PIN or password.</p>
${scopes.map((scope) => `<div class="scope">${scope === "banking.read" ? "View balances, accounts and transactions" : "Prepare banking and service requests"}</div>`).join("")}
<div class="row"><button id="deny" class="danger">Deny</button><button id="allow" class="primary">Allow access</button></div><div id="error" class="error hidden"></div>`,
    `<script>const oauthQuery=${JSON.stringify(query)};const finish=async(accept)=>{try{const response=await fetch('/api/auth/oauth2/consent',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({accept,oauth_query:oauthQuery})});const data=await response.json();if(!response.ok)throw new Error(data?.message||data?.error_description||'Consent failed');const destination=data?.redirect_uri||data?.url;if(!destination)throw new Error('The authorization server did not return a continuation URL');location.assign(destination)}catch(error){const box=document.querySelector('#error');box.textContent=error.message;box.classList.remove('hidden')}};document.querySelector('#allow').onclick=()=>finish(true);document.querySelector('#deny').onclick=()=>finish(false);</script>`,
  );
}
