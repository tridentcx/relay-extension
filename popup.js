'use strict';

// ─────────────────────────────────────────────────────────────────────
// Password generator
// ─────────────────────────────────────────────────────────────────────
const WORDS = [
  'apple','amber','atlas','azure','blaze','bloom','breeze','bridge',
  'cedar','cloud','coral','crane','dawn','delta','drift','dune',
  'eagle','echo','ember','epoch','fern','field','flame','flint',
  'forest','frost','glade','gleam','grove','haven','hawk','haze',
  'hollow','horizon','inlet','island','jade','jasper','lake','lark',
  'lemon','light','linden','maple','marsh','meadow','mist','moon',
  'moss','mountain','nova','oak','ocean','olive','opal','orbit',
  'peak','pine','prism','quartz','rain','rapid','raven','reef',
  'ridge','river','rock','rose','rush','sage','sand','sierra',
  'silver','sky','slate','snow','solar','spark','spring','star',
  'stone','storm','stream','summit','swift','terra','tide','timber',
  'vale','violet','wave','willow','wind','winter','zenith','zephyr'
];

function genPass() {
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(n => WORDS[n % WORDS.length]).join('-');
}

// ─────────────────────────────────────────────────────────────────────
// Username guardrails
// ─────────────────────────────────────────────────────────────────────
const RESERVED = new Set([
  'relay','admin','administrator','root','system','superuser','mod','moderator',
  'support','help','helpdesk','staff','team','official','ops','operations',
  'test','demo','null','undefined','anonymous','user','username','account',
  'guest','bot','spam','abuse','noreply','no-reply',
  'me','you','we','us','everyone','all','public','private','global',
  'relayapp','relay-app','relaysync','relay-sync','getrelay',
]);

function validateUsername(u) {
  if (!u)              return { ok:false, msg:'' };
  if (u.length < 3)   return { ok:false, msg:'At least 3 characters.' };
  if (u.length > 24)  return { ok:false, msg:'Max 24 characters.' };
  if (!/^[a-z0-9_-]+$/.test(u)) return { ok:false, msg:'Only letters, numbers, - and _.' };
  if (RESERVED.has(u)) return { ok:false, msg:`"${u}" is reserved.` };
  if (/^[_-]|[_-]$|[_-]{2}/.test(u)) return { ok:false, msg:"Can't start/end with - or _ or use them twice." };
  return { ok:true, msg:'' };
}

// ─────────────────────────────────────────────────────────────────────
// Password strength
// ─────────────────────────────────────────────────────────────────────
const COMMON = new Set([
  'password','password1','123456','12345678','qwerty','abc123','letmein',
  'monkey','dragon','master','sunshine','princess','welcome','shadow',
  'passw0rd','password123','pass','1234','test','123','relay123','iloveyou',
]);

function pwStrength(p) {
  if (!p) return 0;
  if (COMMON.has(p.toLowerCase())) return 1;
  let s = 0;
  if (p.length >= 8)  s++;
  if (p.length >= 12) s++;
  if (/[^a-zA-Z0-9]/.test(p) || (/[A-Z]/.test(p) && /[a-z]/.test(p))) s++;
  if (p.length >= 16 || (/[^a-zA-Z0-9]/.test(p) && p.length >= 12)) s++;
  return Math.min(s, 4);
}

function pwHint(p) {
  if (!p) return '';
  if (COMMON.has(p.toLowerCase())) return 'Too common — try something unique.';
  if (p.length < 8) return `${8-p.length} more character${8-p.length===1?'':'s'} needed.`;
  if (pwStrength(p) < 3) {
    const h=[];
    if (p.length < 12)              h.push('make it longer');
    if (!/[A-Z]/.test(p))           h.push('add uppercase');
    if (!/[0-9]/.test(p))           h.push('add a number');
    if (!/[^a-zA-Z0-9]/.test(p))   h.push('add a symbol');
    return h.length ? `Try: ${h.slice(0,2).join(', ')}.` : '';
  }
  return '';
}

function renderStrength(p) {
  const s=pwStrength(p);
  const cols=['#2a2a3a','#f26d6d','#f5a623','#3ecf6e','#3ecf6e'];
  const lbls=['','Weak — not accepted','Almost — a bit stronger','Strong ✓','Very strong ✓'];
  for(let i=1;i<=4;i++){const b=q(`sb${i}`);if(b) b.style.background=i<=s?cols[s]:'rgba(255,255,255,.07)';}
  const l=q('strLbl');
  if(l){const h=pwHint(p);l.textContent=p?(h||lbls[s]):'';l.style.color=cols[s];}
}

// ─────────────────────────────────────────────────────────────────────
// Session — chrome.storage.session (survives popup close, clears on browser close)
// ─────────────────────────────────────────────────────────────────────
let _u=null,_p=null;

async function loadSession(){
  try{const d=await chrome.storage.session.get(['relay_u','relay_p']);_u=d.relay_u||null;_p=d.relay_p||null;}
  catch{_u=null;_p=null;}
}
async function saveSession(u,p){
  _u=u;_p=p;
  try{await chrome.storage.session.set({relay_u:u,relay_p:p});}catch{}
}
async function clearSession(){
  _u=null;_p=null;
  try{await chrome.storage.session.remove(['relay_u','relay_p']);}catch{}
}
const getU=()=>_u, getP=()=>_p;

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────
const q=id=>document.getElementById(id);

function show(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  q(id)?.classList.add('active');
}

function eye(inpId,btnId){
  const i=q(inpId);
  i.type=i.type==='password'?'text':'password';
  q(btnId).textContent=i.type==='password'?'👁':'🙈';
}

const clrT=(id)=>{const e=q(id);if(e)e.className='toast';};
const toast=(id,msg,t)=>{const e=q(id);if(!e)return;e.textContent=msg;e.className=`toast ${t}`;};

function age(iso){
  if(!iso)return '—';
  const s=Math.round((Date.now()-new Date(iso))/1000);
  if(s<5)  return 'just now';
  if(s<60) return `${s}s ago`;
  if(s<120)return '1m ago';
  if(s<3600)return `${Math.floor(s/60)}m ago`;
  return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

// ─────────────────────────────────────────────────────────────────────
// Plan UI helpers
// ─────────────────────────────────────────────────────────────────────
const PRICING_URL='https://shahakshat14.github.io/relay-extension/pricing/';

function applyPlan(plan){
  const isPro = plan==='pro';

  // Update all chips
  ['mainChip','secChip'].forEach(id=>{
    const el=q(id);
    if(!el)return;
    el.textContent=isPro?'PRO':'FREE';
    el.className=`plan-badge${isPro?' pro':''}`;
  });

  // Update main screen hint
  const hint=q('mainPlanHint');
  if(hint)hint.textContent=isPro?'Pro plan · All features':'Free plan · 500 bookmarks';

  // Show/hide upgrade teaser
  const t=q('upgTeaser');
  if(t)t.style.display=isPro?'none':'flex';

  // Security screen plan details
  const pt=q('secPlanTitle');
  const pb=q('secPlanBody');
  const ub=q('btnUpgrade');
  if(pt)pt.textContent=isPro?'Relay Pro':'Free Plan';
  if(pb)pb.textContent=isPro?'Unlimited bookmarks & browsers, auto-sync, 30-day history.':'Up to 500 bookmarks, 2 browsers, manual sync.';
  if(ub)ub.style.display=isPro?'none':'flex';
}

// ─────────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────────
async function runSync(username, password){
  const btn=q('btnSync');
  btn.disabled=true;
  btn.classList.remove('done','error');btn.classList.add('syncing');
  const orb=q('mainOrb');if(orb)orb.className='orb syncing';
  q('orbIco').textContent='⇄';
  q('orbLabel').textContent='Syncing…';
  q('orbSub').textContent='Encrypting your bookmarks…';
  clrT('toastMain');

  try{
    const {pulled,count,plan}=await doSync(username,password);
    await chrome.storage.local.set({lastSync:new Date().toISOString(),plan,bmCount:count});
    chrome.action.setBadgeText({text:''}).catch(()=>{});

    btn.classList.remove('syncing');btn.classList.add('done');
    if(orb)orb.className='orb done';
    q('orbIco').textContent='✓';
    q('orbLabel').textContent=pulled>0?`${pulled} bookmark${pulled===1?'':'s'} added`:'All synced';
    q('orbSub').textContent=`${count} bookmarks synced`;

    // Show persistent stats
    showStats(count, new Date().toISOString());
    applyPlan(plan||'free');

    setTimeout(()=>{
      btn.disabled=false;btn.classList.remove('done');
      if(orb)orb.className='orb';
      q('orbIco').textContent='⇄';
      q('orbLabel').textContent='Sync Now';
      q('orbSub').textContent=`Synced · ${age(new Date().toISOString())}`;
    },3200);

  }catch(err){
    btn.disabled=false;
    btn.classList.remove('syncing','done');btn.classList.add('error');
    if(orb)orb.className='orb error';

    if(err.message.startsWith('FREE_LIMIT:')){
      const c=err.message.split(':')[1];
      q('orbIco').textContent='⚡';
      q('orbLabel').textContent='Upgrade to sync all';
      q('orbSub').textContent=`${c} bookmarks — limit is 500`;
      const al=q('upgradeAlert');if(al)al.classList.add('show');
      btn.classList.remove('error');
      setTimeout(()=>{btn.disabled=false;if(orb)orb.className='orb';q('orbIco').textContent='⇄';},1500);
      return;
    }

    q('orbIco').textContent='⚠';
    q('orbLabel').textContent='Sync failed';
    q('orbSub').textContent='';
    toast('toastMain',err.message,'err');
    if(err.message.includes('password'))clearSession();
    setTimeout(()=>{
      btn.classList.remove('error');
      if(orb)orb.className='orb';
      if(q('orbIco'))q('orbIco').textContent='⇄';
      if(q('orbLabel'))q('orbLabel').textContent='Try Again';
    },2200);
  }
}

function showStats(count, lastSync){
  const stats=q('syncStats');
  const scEl=q('statCount');
  const stEl=q('statTime');
  if(stats&&scEl&&stEl){
    scEl.textContent=count>=0?count.toLocaleString():'—';
    stEl.textContent=age(lastSync);
    stats.classList.add('visible');
  }
}

// ─────────────────────────────────────────────────────────────────────
// Go to main
// ─────────────────────────────────────────────────────────────────────
async function goMain(autoSync=false){
  const u=getU();
  show('vMain');
  if(q('mainUsername'))q('mainUsername').textContent=`@${u}`;
  await chrome.storage.local.set({hasAccount:true,username:u});

  const {lastSync,autoSync:aS,plan,bmCount}=
    await chrome.storage.local.get(['lastSync','autoSync','plan','bmCount']);

  q('chkAuto').checked=!!aS;
  applyPlan(plan||'free');

  if(lastSync&&bmCount!=null){
    showStats(bmCount,lastSync);
    q('orbLabel').textContent='Sync Now';
    q('orbSub').textContent=`Synced · ${age(lastSync)}`;
  }else{
    q('orbLabel').textContent='Sync Now';
    q('orbSub').textContent='Tap to sync your bookmarks';
  }

  const stale=!lastSync||(Date.now()-new Date(lastSync))>30_000;
  if(autoSync||(aS&&stale))
    setTimeout(()=>runSync(getU(),getP()),350);
}

async function goMainPending(autoSync=false){
  const u=getU();
  show('vMain');
  if(q('mainUsername'))q('mainUsername').textContent=`@${u}`;
  q('chkAuto').checked=false;
  q('orbLabel').textContent='Sync Now';
  q('orbSub').textContent='Verifying your credentials…';

  if(autoSync){
    setTimeout(async()=>{
      try{
        await runSync(getU(),getP());
        await chrome.storage.local.set({hasAccount:true,username:u});
      }catch{}
    },350);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Username check
// ─────────────────────────────────────────────────────────────────────
let uTimer=null,uGen=0,uValid=false;

async function checkUsername(username){
  const myGen=++uGen;
  const sEl=q('unameStatus'),mEl=q('unameMsg'),iEl=q('unameIcon'),inp=q('unameInput');
  // unameIcon is optional (removed in v4.6 redesign)
  const setIcon = (txt) => { if (iEl) iEl.textContent = txt; };
  const sugsEl=q('suggestions');

  sEl.style.opacity='0';
  sugsEl.style.display='none';
  inp.classList.remove('valid','taken');
  uValid=false;q('btnCreate').disabled=true;
  if(!username)return;

  const {ok,msg}=validateUsername(username);
  if(!ok){
    if(msg&&myGen===uGen){
      sEl.className='uname-status taken';sEl.style.opacity='1';
      mEl.textContent=msg;setIcon('✗');inp.classList.add('taken');
    }
    return;
  }

  sEl.className='uname-status checking';sEl.style.opacity='1';
  mEl.textContent='Checking…';setIcon('·');

  const avail=await checkUsernameAvailable(username);
  if(myGen!==uGen)return;

  if(avail){
    sEl.className='uname-status ok';mEl.textContent=`@${username} is available ✓`;
    setIcon('✓');inp.classList.add('valid');uValid=true;updateCreate();
  }else{
    sEl.className='uname-status taken';mEl.textContent=`@${username} is taken`;
    setIcon('✗');inp.classList.add('taken');
    // suggestions
    const ADJS=['swift','calm','bold','bright','cool','deep','free','glad','kind','lone','neat','pure'];
    const NOUNS=['panda','tiger','river','storm','cedar','ember','frost','grove','raven','stone','lark'];
    const clean=username.replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,10)||'user';
    const arr=new Uint32Array(4);crypto.getRandomValues(arr);
    const sugs=[
      `${clean}${(arr[0]%90)+10}`,
      `${ADJS[arr[1]%ADJS.length]}-${clean}`,
      `${clean}-${NOUNS[arr[2]%NOUNS.length]}`,
      `${ADJS[arr[3]%ADJS.length]}-${NOUNS[arr[0]%NOUNS.length]}`,
    ];
    sugsEl.innerHTML=sugs.map(s=>`<button class="sug-btn" data-n="${s}">@${s}</button>`).join('');
    sugsEl.style.display='flex';
    sugsEl.querySelectorAll('.sug-btn').forEach(b=>{
      b.addEventListener('click',()=>{
        q('unameInput').value=b.dataset.n;
        sugsEl.style.display='none';
        clearTimeout(uTimer);checkUsername(b.dataset.n);
      });
    });
  }
}

function updateCreate(){
  const pass=q('passInput')?.value||'';
  const conf=q('passConfirm')?.value||'';
  const match=pass&&conf&&pass===conf;
  q('btnCreate').disabled=!(uValid&&pwStrength(pass)>=3&&match);
}

// ─────────────────────────────────────────────────────────────────────
// Sign In events
// ─────────────────────────────────────────────────────────────────────
q('siEye').addEventListener('click',()=>eye('siPassword','siEye'));

// FIX [C4]: Keyboard navigation
q('siUsername').addEventListener('keydown',e=>{if(e.key==='Enter')q('siPassword').focus();});
q('siPassword').addEventListener('keydown',e=>{if(e.key==='Enter')q('btnSignIn').click();});

q('btnSignIn').addEventListener('click',async()=>{
  const username=q('siUsername').value.trim().toLowerCase();
  const password=q('siPassword').value.trim();
  if(!username){toast('toastSignIn','Enter your username.','err');return;}
  if(!password){toast('toastSignIn','Enter your password.','err');return;}

  q('btnSignIn').disabled=true;
  q('btnSignIn').innerHTML='<span class="sp"></span> Signing in…';

  await saveSession(username,password);
  q('siUsername').value='';q('siPassword').value='';
  await goMainPending(true);

  q('btnSignIn').disabled=false;
  q('btnSignIn').innerHTML='Sign In →';
});

q('btnNewUserSignIn').addEventListener('click',()=>{
  // FIX [C2]: Pre-generate password before showing setup
  const p=genPass();
  q('genText').textContent=p;
  q('passInput').value=p;
  renderStrength(p);
  show('vSetup');
});

// ─────────────────────────────────────────────────────────────────────
// Setup events
// ─────────────────────────────────────────────────────────────────────
// FIX [C3]: Back goes to sign in, not orphaned onboarding
q('btnBackSetup').addEventListener('click',()=>show('vSignIn'));

q('unameInput').addEventListener('input',()=>{
  const v=q('unameInput').value.toLowerCase().replace(/[^a-z0-9\-_]/g,'');
  if(q('unameInput').value!==v)q('unameInput').value=v;
  clearTimeout(uTimer);uTimer=setTimeout(()=>checkUsername(v),480);
  updateCreate();
});
q('unameInput').addEventListener('keydown',e=>{if(e.key==='Enter')q('passInput').focus();});

q('passEye').addEventListener('click',()=>eye('passInput','passEye'));
q('passConfirmEye').addEventListener('click',()=>eye('passConfirm','passConfirmEye'));

q('passInput').addEventListener('input',()=>{
  const p=q('passInput').value;
  q('genText').textContent=p||'…';
  renderStrength(p);
  updateCreate();
  checkPassMatch();
});

// FIX [C1]: Password confirm + live match check
q('passConfirm').addEventListener('input',()=>{
  checkPassMatch();updateCreate();
});
q('passConfirm').addEventListener('keydown',e=>{if(e.key==='Enter')q('btnCreate').click();});

function checkPassMatch(){
  const p=q('passInput').value, c=q('passConfirm').value;
  const el=q('passMatchStatus');
  if(!c){el.className='pass-match';return;}
  if(p===c){
    el.className='pass-match show ok';
    el.innerHTML='<span>✓</span> Passwords match';
  }else{
    el.className='pass-match show fail';
    el.innerHTML='<span>✗</span> Passwords don\'t match';
  }
}

q('btnRefresh').addEventListener('click',()=>{
  const p=genPass();
  q('genText').textContent=p;
  q('passInput').value=p;
  q('passConfirm').value='';
  q('passMatchStatus').className='pass-match';
  renderStrength(p);updateCreate();
});

q('btnCopyGen').addEventListener('click',async()=>{
  const pw = q('genText').textContent;
  await navigator.clipboard.writeText(pw);
  q('btnCopyGen').textContent='✓';
  setTimeout(()=>q('btnCopyGen').textContent='⎘',1400);

  // FIX [MED-4]: Auto-clear clipboard after 30s if it still has the password
  setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === pw) await navigator.clipboard.writeText('');
    } catch {} // permission denied is fine
  }, 30_000);
});

q('btnCreate').addEventListener('click',async()=>{
  const username=q('unameInput').value.trim();
  const password=q('passInput').value;
  const confirm=q('passConfirm').value;

  if(!uValid){toast('toastSetup','Choose an available username.','err');return;}
  if(pwStrength(password)<3){toast('toastSetup','Password is too weak — aim for Strong.','err');return;}
  if(password!==confirm){toast('toastSetup','Passwords don\'t match.','err');return;}

  q('btnCreate').disabled=true;
  q('btnCreate').innerHTML='<span class="sp"></span> Creating…';

  try{
    const avail=await checkUsernameAvailable(username);
    if(!avail){
      toast('toastSetup','That username was just taken. Try another.','err');
      q('btnCreate').disabled=false;q('btnCreate').innerHTML='Create Account →';return;
    }
    await saveSession(username,password);
    await chrome.storage.local.set({hasAccount:true,username});

    // FIX [H6]: Show welcome screen first
    show('vWelcome');
    setTimeout(async()=>{
      await goMain(true);
    },2200);
  }catch(err){
    toast('toastSetup',err.message,'err');
    q('btnCreate').disabled=false;q('btnCreate').innerHTML='Create Account →';
  }
});

// ─────────────────────────────────────────────────────────────────────
// Main events
// ─────────────────────────────────────────────────────────────────────
q('btnSync').addEventListener('click',()=>{
  const u=getU(),p=getP();
  if(!u||!p){show('vSignIn');return;}
  runSync(u,p);
});

// Make whole account row clickable
q('accountRow')?.addEventListener('click',()=>show('vSecurity'));
q('btnSecurity')?.addEventListener('click',e=>{e.stopPropagation();show('vSecurity');});

q('chkAuto').addEventListener('change',e=>{
  chrome.storage.local.set({autoSync:e.target.checked});
});

q('upgradeAlertBtn')?.addEventListener('click',()=>chrome.tabs.create({url:PRICING_URL}));

// ─────────────────────────────────────────────────────────────────────
// Settings events
// ─────────────────────────────────────────────────────────────────────
q('btnBackMain').addEventListener('click',()=>show('vMain'));
q('btnUpgrade')?.addEventListener('click',()=>chrome.tabs.create({url:PRICING_URL}));
q('upgTeaser')?.addEventListener('click',()=>chrome.tabs.create({url:PRICING_URL}));

q('btnShowGift')?.addEventListener('click',()=>{
  clrT('toastGift');q('giftInput').value='';show('vGift');
});

q('btnLock').addEventListener('click',()=>{clearSession();show('vSignIn');});
q('btnDeleteAccount')?.addEventListener('click',()=>show('vDeleteConfirm'));

// ─────────────────────────────────────────────────────────────────────
// Gift code events
// ─────────────────────────────────────────────────────────────────────
q('btnBackGift')?.addEventListener('click',()=>show('vSecurity'));

// FIX [M4]: Auto-format with dashes + paste detection
q('giftInput')?.addEventListener('input',()=>{
  let v=q('giftInput').value.replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,12);
  if(v.length>8)      v=v.slice(0,4)+'-'+v.slice(4,8)+'-'+v.slice(8);
  else if(v.length>4) v=v.slice(0,4)+'-'+v.slice(4);
  q('giftInput').value=v;
});
q('giftInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')q('btnRedeemGift').click();});

q('btnRedeemGift')?.addEventListener('click',async()=>{
  const code=q('giftInput').value.trim().toUpperCase();
  if(code.length<14){toast('toastGift','Enter a complete gift code (XXXX-XXXX-XXXX).','err');return;}

  const btn=q('btnRedeemGift');
  btn.disabled=true;btn.innerHTML='<span class="sp"></span> Redeeming…';
  clrT('toastGift');

  try{
    const u=getU(), vk=await vaultKey(u);
    const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_gift_code`,{
      method:'POST',
      headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_code:code,p_vault_key:vk}),
    });
    const data=await res.json();
    if(!data.success){
      toast('toastGift',data.error||'Invalid code.','err');
    }else{
      await chrome.storage.local.set({plan:'pro'});
      applyPlan('pro');
      toast('toastGift',`🎉 Pro activated for ${data.days} days!`,'ok');
      setTimeout(()=>show('vSecurity'),2000);
    }
  }catch{
    toast('toastGift','Something went wrong. Try again.','err');
  }finally{
    btn.disabled=false;btn.innerHTML='Redeem →';
  }
});

// ─────────────────────────────────────────────────────────────────────
// Delete account events
// ─────────────────────────────────────────────────────────────────────
q('btnDeleteCancel')?.addEventListener('click',()=>show('vSecurity'));
q('btnDeleteCancel2')?.addEventListener('click',()=>show('vSecurity'));

q('btnDeleteConfirm')?.addEventListener('click',async()=>{
  const btn=q('btnDeleteConfirm');
  btn.disabled=true;btn.innerHTML='<span class="sp"></span> Deleting…';

  try{
    const u = getU();
    const p = getP();
    if (!u || !p) throw new Error('Session expired. Sign in again.');

    const vk = await vaultKey(u);

    // FIX [MED-1]: Validate vault key format before any DB operation
    if (!isValidVaultKey(vk)) throw new Error('Invalid vault key.');

    // FIX [CRIT-1]: Verify password is correct BEFORE allowing delete.
    // Pull the encrypted blob and try to decrypt — only proceed if it works.
    // This prevents anyone-with-username from deleting other people's vaults.
    const remote = await pullFromCloud(vk);
    if (remote?.data) {
      try {
        await decrypt(remote.data, p);
      } catch {
        throw new Error('Password verification failed. Cannot delete.');
      }
    }
    // (If no remote data, vault is local-only — safe to clear)

    // Use ?Prefer header to get back the deleted rows so we can verify
    const res=await fetch(`${SUPABASE_URL}/rest/v1/vaults?vault_key=eq.${vk}`,{
      method:'DELETE',
      headers:{
        'apikey':SUPABASE_KEY,
        'Authorization':`Bearer ${SUPABASE_KEY}`,
        'Prefer':'return=representation',
      },
    });

    if(!res.ok){
      const err = await res.text().catch(() => '');
      // RLS blocks DELETE — that's actually correct behaviour now
      if (res.status === 401 || res.status === 403) {
        throw new Error('Server refused delete. Contact support.');
      }
      throw new Error('Delete failed: '+(err || res.status));
    }

    // Verify something was actually deleted (RLS might silently succeed with 0 rows)
    const deletedRows = await res.json().catch(() => []);
    if (Array.isArray(deletedRows) && deletedRows.length === 0 && remote?.data) {
      throw new Error('Server didn\'t delete the vault. Contact support.');
    }

    await clearSession();
    await chrome.storage.local.clear();
    show('vDeleted');
    setTimeout(()=>show('vSignIn'),3000);

  }catch(err){
    btn.disabled=false;btn.innerHTML='Delete my account';
    toast('toastDelete',err.message,'err');
  }
});

// ─────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────
async function init(){
  await loadSession();
  const {hasAccount}=await chrome.storage.local.get('hasAccount');
  if(!hasAccount){show('vSignIn');return;}
  const u=getU(),p=getP();
  if(!u||!p){show('vSignIn');return;}
  await goMain();
}

init();
