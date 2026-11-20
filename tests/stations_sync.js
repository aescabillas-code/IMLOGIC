// IM•LOGIC: stations, station moves, activity updates, SLA settings and templates sync between two screens.
// Based on the end-to-end check of web/shim.js + the real Python Bridge (tests/bridge_server.py, in-memory store, no MongoDB/Streamlit needed).
// Two simulated browsers run the real app script. Verifies: a case created on one screen is saved and appears on the other,
// edits propagate back, and an uploaded shared audio file can be loaded by the second screen.
const vm = require('vm'), fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/im_logic.html'), 'utf8');
const shim = fs.readFileSync(path.join(root, 'web/shim.js'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const app = scripts[scripts.length - 1].replace(/renderUser\(\);render\(\);initDb\(\);setInterval[\s\S]*$/, '');

// ---- the Python side
const py = cp.spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'bridge_server.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', waiters = [], lastDump = {};
py.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim() && waiters.length) waiters.shift()(JSON.parse(line)); } });
const askPy = (sid, value) => new Promise(r => { waiters.push(r); py.stdin.write(JSON.stringify({ sid, value }) + '\n'); });

let SID = 0;
function client(me) {
  const sid = 's' + (++SID), handlers = [];
  const els = {};
  const mk = () => { const hid = { v: true }; return new Proxy({ value: '', checked: false, style: {}, classList: { add(c) { if (c === 'hidden') hid.v = true; }, remove(c) { if (c === 'hidden') hid.v = false; }, toggle() {}, contains(c) { return c === 'hidden' ? hid.v : false; } }, focus() {}, select() {}, pause() {}, play() { return Promise.resolve(); }, remove() {}, appendChild() {}, setAttribute() {}, textContent: '' }, { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } }); };
  const ls = { pet_me: JSON.stringify(me) };
  const wrapT = fn => (f, ms) => fn(() => { try { f(); } catch (e) {} }, ms);
  // Streamlit's side of the postMessage protocol, backed by the Python bridge
  let chain = Promise.resolve();
  const render = reply => handlers.forEach(h => h({ data: { type: 'streamlit:render', args: { reply } } }));
  const run = value => { chain = chain.then(async () => { const r = await askPy(sid, value); lastDump = r.dump; r.renders.forEach(render); }); };
  const parent = {
    innerHeight: 900,
    postMessage(m) {
      if (m.type === 'streamlit:componentReady') run(null);
      else if (m.type === 'streamlit:setComponentValue') run(m.value);
    }
  };
  const ctx = vm.createContext({
    console, URL, FormData, Blob, Promise, Date, JSON, Math, Set, Map, Object, Array, String, Number, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, TextEncoder, Uint8Array,
    setTimeout: wrapT(setTimeout), setInterval: wrapT(setInterval), clearTimeout, clearInterval,
    localStorage: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
    Audio: function () { return mk(); }, XLSX: undefined,
    FileReader: function () { this.readAsDataURL = function (b) { setTimeout(() => { this.result = 'data:' + (b.type || 'x') + ';base64,QUJD'; this.onload(); }, 0); }; },
    document: { head: { appendChild() {} }, documentElement: { appendChild() {} }, getElementById: id => els[id] || (els[id] = mk()), querySelector: () => ({ value: 'all' }), querySelectorAll: () => [], activeElement: null, hidden: false, addEventListener() {}, createElement: () => mk(), body: mk() },
    crypto: require('crypto').webcrypto, parent, addEventListener: (t, f) => { if (t === 'message') handlers.push(f); }, removeEventListener() {}
  });
  ctx.window = ctx;
  vm.runInContext(shim, ctx);
  vm.runInContext(app, ctx);
  // the app always opens on the profile page and does not restore a saved profile; the test signs in as `me` directly
  vm.runInContext('ME=' + JSON.stringify(me) + ';applyMe();', ctx);
  return { ctx, run: c => vm.runInContext(c, ctx), els };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let ok = true; const check = (l, v) => { console.log((v ? 'PASS ' : 'FAIL ') + l); if (!v) ok = false; };
  const A = client({ role: 'manager', name: 'Jeff Bote' });
  await A.run('initDb()'); await sleep(2500);
  A.run('openAdd()'); A.run("document.getElementById('add-id').value='IM-TEST-1';document.getElementById('add-recv').value='2026-11-06T09:00'");
  A.run('addCase()'); await sleep(2500);
  const B = client({ role: 'manager', name: 'Jeff Bote' });
  await B.run('initDb()'); await sleep(3000);
  check('new case starts in WFM on the other screen', B.run("(getCase('IM-TEST-1')||{}).station") === 'WFM' && B.run("!!getCase('IM-TEST-1').stAt"));
  A.run("openCaseModal('IM-TEST-1');document.getElementById('stn-note').value='parts ordered';stnMove('IM-TEST-1')"); await sleep(3500);
  check('station move reaches the other screen with its history', B.run("getCase('IM-TEST-1').station") === 'CARE' && B.run("getCase('IM-TEST-1').stH.length") === 1 && B.run("getCase('IM-TEST-1').stH[0].s") === 'WFM');
  A.run("document.getElementById('upd-in').value='Called the customer';logUpdate('IM-TEST-1')"); await sleep(3500);
  check('activity update is in the case history of the other screen', B.run("getCase('IM-TEST-1').log.some(l=>l.action==='Activity update'&&/Called the customer/.test(l.details))"));
  check('station transfer is in the case history', B.run("getCase('IM-TEST-1').log.some(l=>l.action==='Station transfer'&&/WFM → CARE/.test(l.details))"));
  A.run("stnSetSla('PET',50)"); await sleep(3000);
  check('station SLA change is shared', B.run("stnSla('PET')") === 50);
  A.run("ATPL_ED={id:'',cat:'Closing',name:'',st:'',text:''};document.getElementById('tp-name').value='Closed ok';document.getElementById('tp-text').value='Closed {case}';document.getElementById('tp-cat').value='Closing';document.getElementById('tp-st').value='';atplSave()"); await sleep(3000);
  check('a new template is shared', B.run("atplList().some(t=>t.name==='Closed ok'&&t.cat==='Closing')"));
  check('template placeholders are filled', B.run("atplFill('{case} @ {station}','IM-TEST-1')") === 'IM-TEST-1 @ CARE');
  A.run("stnOwnerSet('IM-TEST-1','WFM','Maria Santos');stnOwnerSet('IM-TEST-1','SUPPLY CHAIN','Leo Cruz')"); await sleep(3500);
  check('station owners reach the other screen', B.run("stnOwn(getCase('IM-TEST-1'),'WFM')") === 'Maria Santos' && B.run("stnOwn(getCase('IM-TEST-1'),'SUPPLY CHAIN')") === 'Leo Cruz');
  A.run("petApply(getCase('IM-TEST-1'),{id:'AR-1',caseType:'aruba',arubaNo:'AR-1',sfdc:['5001'],ritm:'RITM1',sev:'Sev 2',model:'AP-1',owner:'PET Owner',closed:false,chk:[1,2],pOrd:1700000000000,pDel:1700003600000,ceArr:1700007200000,mw:{s:1700000000000,e:1700009000000},mwUp:[{s:1700000000000,e:1700012600000}],items:[{id:'p1',text:'Required reminder',req:true,done:true,rem:{at:1,text:'x',done:{text:'ok',by:'K',at:2}}},{id:'p2',text:'Call the store',done:false,rem:{at:Date.now()+3600000,text:'call the store',setAt:Date.now()}}]},'link')"); await sleep(3500);
  check('PET information copied on one screen is saved for the other', B.run("getCase('IM-TEST-1').ritm") === 'RITM1' && B.run("getCase('IM-TEST-1').petRef.owner") === 'PET Owner' && B.run("getCase('IM-TEST-1').sfdc[0]") === '5001');
  check('PET part ordered / delivered, CE arrival and maintenance window are pulled', B.run("(c=>c.pOrd===1700000000000&&c.pDel===1700003600000&&c.ceArr===1700007200000&&c.mw.e===1700009000000&&c.mwUp.length===1)(getCase('IM-TEST-1'))") === true);
  check('the PET checklist and its alarms are pulled, view only (kept apart from the IM checklist)', B.run("(c=>{const a=c.petChk.find(i=>i.id==='p1'),b=c.petChk.find(i=>i.id==='p2');return !!(a&&b&&a.req&&a.done&&!b.done&&b.rem&&b.rem.text==='call the store'&&!c.items.some(i=>/^pet_/.test(i.id)||i.text==='Call the store'))})(getCase('IM-TEST-1'))") === true);
  check('PET alarms are not reminders in IM•LOGIC (no due / upcoming alarm from PET)', B.run("rems(getCase('IM-TEST-1')).every(x=>x.r.text!=='call the store')") === true);
  check('the PET card shows the PET checklist as view only', /View only/.test(B.run("petCard(getCase('IM-TEST-1'))")) && /does not ring|do not ring/.test(B.run("petCard(getCase('IM-TEST-1'))")));
  A.run("petApply(getCase('IM-TEST-1'),{id:'AR-1',caseType:'aruba',arubaNo:'AR-1',owner:'PET Owner',items:[{id:'p2',text:'Call the store',done:true,rem:{at:5,text:'call the store',done:{text:'called',by:'K',at:6}}}]},'refresh')"); await sleep(3000);
  check('a PET refresh updates the view-only PET checklist, IM items stay', B.run("(c=>c.petChk.length===1&&c.petChk[0].done===true&&c.items.length>=1)(getCase('IM-TEST-1'))") === true);
  A.run("(()=>{const c=getCase('IM-TEST-1');c.items.push({id:'pet_old',pet:true,petReq:false,text:'Old PET copy',done:false,rem:{at:Date.now()-1000,text:'old',setAt:Date.now()}});remQueue=[];SEENT.clear();remCheck()})()");
  check('PET items saved by the previous version are moved out before any alarm rings', A.run("!getCase('IM-TEST-1').items.some(i=>i.pet)&&!remQueue.some(q=>q.iid==='pet_old')") === true);
  // Customer Hold: pause the station clock until the alarm of the linked checklist item goes off
  A.run("cdSet('IM-TEST-1','cstatus','Ongoing')"); await sleep(2500);
  A.run("cdSet('IM-TEST-1','cstatus','Customer Hold')");
  check('choosing Customer Hold asks for a checklist item with an alarm first', A.run("!!HOLDM&&getCase('IM-TEST-1').cstatus==='Ongoing'") === true);
  A.run("HOLDM.mode='new';document.getElementById('hd-text').value='Call the customer back';document.getElementById('hd-at').value=toLI(simNow().getTime()+3*3600000);document.getElementById('hd-note').value='after store hours';holdApply()"); await sleep(3500);
  check('Customer Hold reaches the other screen with its linked alarm', B.run("getCase('IM-TEST-1').cstatus") === 'Customer Hold' && B.run("holdActive(getCase('IM-TEST-1'))") === true && B.run("holdIt(getCase('IM-TEST-1')).text") === 'Call the customer back');
  const s1 = B.run("stnSecs(getCase('IM-TEST-1'))"); await sleep(2600); const s2 = B.run("stnSecs(getCase('IM-TEST-1'))");
  check('the station clock is paused on both screens', s1 === s2 && A.run("stnSecs(getCase('IM-TEST-1'))") === s2);
  A.run("(()=>{const c=getCase('IM-TEST-1');holdIt(c).rem.at=Date.now()-400;queueSave(c);holdCheck()})()"); await sleep(4000);
  check('when the alarm goes off the status goes back to Ongoing (other screen)', B.run("getCase('IM-TEST-1').cstatus") === 'Ongoing' && B.run("holdOn(getCase('IM-TEST-1'))") === false && B.run("getCase('IM-TEST-1').stP") > 2000);
  check('hold start and end are in the case history', B.run("(c=>c.log.some(l=>l.action==='Customer hold started')&&c.log.some(l=>l.action==='Customer hold ended'&&/Alarm went off/.test(l.details)))(getCase('IM-TEST-1'))") === true);
  const s3 = B.run("stnSecs(getCase('IM-TEST-1'))"); await sleep(2200);
  check('the station clock runs again', B.run("stnSecs(getCase('IM-TEST-1'))") > s3);
  A.run("['PSE','ARCH','PET','SUPPLY CHAIN','FULFILLMENT','x'].forEach(()=>stnMove('IM-TEST-1'))"); await sleep(3500);
  check('transfers follow WFM › CARE › PSE › ARCH › PET › SUPPLY CHAIN › FULFILLMENT and stop at the last station', B.run("getCase('IM-TEST-1').stH.map(h=>h.s).concat([getCase('IM-TEST-1').station]).join('>')") === 'WFM>CARE>PSE>ARCH>PET>SUPPLY CHAIN>FULFILLMENT');
  check('time on hold is kept in the CARE stay and not counted', B.run("(h=>h.s==='CARE'&&h.p>2000&&segSecs(h)*1000<h.e-h.a)(getCase('IM-TEST-1').stH[1])") === true);
  console.log('RESULT: ' + (ok ? 'PASS' : 'FAIL'));
  py.kill(); process.exit(ok ? 0 : 1);
})();
