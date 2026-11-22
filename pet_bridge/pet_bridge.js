/* ===== IM•LOGIC ⇄ PET messages · PET Station side (added by pet_bridge/apply_to_pet.py) =====
   A recorded message thread for every PET case that IM•LOGIC linked. The thread lives in the PET database
   (bridge_links / bridge_msgs, see im_pet_bridge.py — the same file IM•LOGIC uses). Shown as an "IM•LOGIC" card in the case;
   new IM•LOGIC messages show a note and are written to the case history ("Message from IM•LOGIC"); messages sent from
   PET are written as "Message to IM•LOGIC". Nothing else in PET changes. */
let BRP={since:0,page:false,busy:false,t:0,msgs:{},links:{},err:'',sending:false,boot:false};
const brpOn=()=>typeof window.__bridge==='function'&&typeof DBON!=='undefined'&&DBON&&!SIMON;
function brpSeen(id){try{return +localStorage.getItem('pet_br_seen_'+id)||0}catch(e){return 0}}
function brpMark(id){const L=BRP.msgs[id]||[],t=L.length?L[L.length-1].ts:0;if(t>brpSeen(id))try{localStorage.setItem('pet_br_seen_'+id,String(t))}catch(e){}}
function brpAdd(list){const fresh=[];(list||[]).forEach(m=>{if(!m||!m.id||!m.pet)return;const L=BRP.msgs[m.pet]||(BRP.msgs[m.pet]=[]);if(L.some(x=>x.id===m.id))return;L.push(m);L.sort((a,b)=>a.ts-b.ts);fresh.push(m)});return fresh}
function brpRedraw(){try{if(typeof caseRedraw==='function')caseRedraw();else renderCase()}catch(e){}}
function brpScroll(){setTimeout(()=>{const l=document.getElementById('brp-list');if(l)l.scrollTop=l.scrollHeight},60)}
function brpLogIn(fresh){fresh.filter(m=>m.from==='IM'&&m.ts>APP_T0-600000).forEach(m=>{const c=getCase(m.pet);if(!c)return;logc(c,'Message from IM•LOGIC',(m.by||'IM•LOGIC')+' (IM•LOGIC)',m.text,{id:'brm_'+m.id,nosave:true});if(BRP.boot&&openId!==c.id)note('💬 IM•LOGIC · '+dispNo(c)+' · '+(m.by||'IM•LOGIC')+': '+m.text.slice(0,90))})}
async function brpLoad(id){if(!brpOn()||!id)return;try{const r=await window.__bridge('bridge_thread',{pet:id});brpLogIn(brpAdd(r&&r.items));if(r&&r.link)BRP.links[id]=r.link;BRP.err='';if(openId===id){brpMark(id);brpRedraw();brpScroll()}}catch(e){BRP.err='Messages: '+String(e&&e.message||e).slice(0,140)}}
async function brpTick(){if(BRP.busy||!brpOn()||!GOT.cases)return;const o=openId&&getCase(openId);if(Date.now()-BRP.t<(o&&(BRP.links[o.id]||BRP.msgs[o.id])?2000:5000))return;BRP.busy=true;BRP.t=Date.now();
try{const r=await window.__bridge('bridge_feed',{since:BRP.page?BRP.since:Math.max(0,BRP.since-120000),links:true}),it=r&&r.items||[];BRP.err='';
let ch=false;(r&&r.links||[]).forEach(l=>{if(l&&l.id&&JSON.stringify(BRP.links[l.id])!==JSON.stringify(l)){BRP.links[l.id]=l;ch=true}});const fresh=brpAdd(it);
BRP.page=it.length>=300;BRP.since=BRP.page?it[it.length-1].ts:(r&&r.now)||BRP.since;
brpLogIn(fresh);
BRP.boot=true;if((fresh.length||ch)&&openId&&(fresh.some(m=>m.pet===openId)||BRP.links[openId])){brpMark(openId);brpRedraw();if(fresh.some(m=>m.pet===openId))brpScroll()}}catch(e){BRP.err='Messages: '+String(e&&e.message||e).slice(0,140)}finally{BRP.busy=false}}
async function brpSend(cid){const c=getCase(cid),e=document.getElementById('brp-in');if(!c||!e)return;const t=String(e.value||'').trim();if(!t){note('Write a message first');return}if(!brpOn()){note('Messages to IM•LOGIC need the shared database');return}if(BRP.sending)return;BRP.sending=true;
try{const r=await window.__bridge('bridge_send',{pet:cid,text:t,by:SIM_USER});e.value='';const m=r&&r.msg;if(m)brpAdd([m]);logc(c,'Message to IM•LOGIC',SIM_USER,t,{id:'brm_'+(m&&m.id||uid())});brpMark(cid);brpRedraw();brpScroll()}catch(x){note('Message not sent: '+String(x&&x.message||x).slice(0,120))}finally{BRP.sending=false}}
function brCard(c){const ln=BRP.links[c.id],L=BRP.msgs[c.id]||[];if(!ln&&!L.length)return '';
const head=ln?`Linked to IM•LOGIC case <b>${esc(ln.imNo||ln.im||'')}</b>${ln.station?' · station <b>'+esc(ln.station)+'</b>':''}${ln.owner?' · '+esc(ln.owner):''}`:'Messages with IM•LOGIC';
return cc('swap','IM•LOGIC',`<div class="text-xs sm:text-sm text-gray-700 mb-2">${head}</div><div class="rounded-xl border border-gray-200 overflow-hidden"><div id="brp-list" class="overflow-y-auto p-3 space-y-2 bg-white" style="max-height:260px">${L.length?L.map(m=>{const me=m.from==='PET';return `<div class="flex ${me?'justify-end':''}"><div class="rounded-xl px-3 py-2 text-xs sm:text-sm" style="max-width:85%;background:${me?'#eef8f0':'#e6f6f4'};border:1px solid ${me?'#cdebd5':'#bfe9e3'}"><div class="text-[10.5px] font-bold" style="color:${me?'#2b9348':'#0d9488'}">${me?'PET':'IM•LOGIC'} · ${esc(m.by||'')} <span class="font-medium text-gray-400">· ${esc(fmtDT(m.ts))}</span></div><div class="whitespace-pre-wrap break-words mt-0.5">${esc(m.text)}</div></div></div>`}).join(''):'<div class="text-xs text-gray-400 text-center py-3">No messages yet.</div>'}</div>
<div class="p-2 border-t flex gap-2 items-end"><textarea id="brp-in" rows="2" maxlength="2000" placeholder="Message to IM•LOGIC · Enter sends, Shift+Enter adds a line" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();brpSend('${c.id}')}"></textarea><button onclick="brpSend('${c.id}')" class="px-4 py-2 rounded-lg font-bold text-xs sm:text-sm text-white" style="background:#0d9488">Send</button></div>${BRP.err?`<div class="px-3 pb-2 text-[11px] text-amber-700">${esc(BRP.err)}</div>`:''}</div>`)}
{const _o=openCaseModal;openCaseModal=function(id){const r=_o.apply(this,arguments);try{brpMark(id);brpLoad(id)}catch(e){}return r}}
setInterval(()=>{try{brpTick()}catch(e){}},1000);
/* ===== end of IM•LOGIC ⇄ PET messages ===== */
