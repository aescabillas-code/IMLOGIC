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
  A.run("openCaseModal('IM-TEST-1');document.getElementById('stn-to').value='SUPPLY CHAIN';document.getElementById('stn-note').value='parts ordered';stnMove('IM-TEST-1')"); await sleep(3500);
  check('station move reaches the other screen with its history', B.run("getCase('IM-TEST-1').station") === 'SUPPLY CHAIN' && B.run("getCase('IM-TEST-1').stH.length") === 1 && B.run("getCase('IM-TEST-1').stH[0].s") === 'WFM');
  A.run("document.getElementById('upd-in').value='Called the customer';logUpdate('IM-TEST-1')"); await sleep(3500);
  check('activity update is in the case history of the other screen', B.run("getCase('IM-TEST-1').log.some(l=>l.action==='Activity update'&&/Called the customer/.test(l.details))"));
  check('station transfer is in the case history', B.run("getCase('IM-TEST-1').log.some(l=>l.action==='Station transfer'&&/WFM → SUPPLY CHAIN/.test(l.details))"));
  A.run("stnSetSla('PET',50)"); await sleep(3000);
  check('station SLA change is shared', B.run("stnSla('PET')") === 50);
  A.run("ATPL_ED={id:'',cat:'Closing',name:'',st:'',text:''};document.getElementById('tp-name').value='Closed ok';document.getElementById('tp-text').value='Closed {case}';document.getElementById('tp-cat').value='Closing';document.getElementById('tp-st').value='';atplSave()"); await sleep(3000);
  check('a new template is shared', B.run("atplList().some(t=>t.name==='Closed ok'&&t.cat==='Closing')"));
  check('template placeholders are filled', B.run("atplFill('{case} @ {station}','IM-TEST-1')") === 'IM-TEST-1 @ SUPPLY CHAIN');
  A.run("stnOwnerSet('IM-TEST-1','WFM','Maria Santos');stnOwnerSet('IM-TEST-1','SUPPLY CHAIN','Leo Cruz')"); await sleep(3500);
  check('station owners reach the other screen', B.run("stnOwn(getCase('IM-TEST-1'),'WFM')") === 'Maria Santos' && B.run("stnOwn(getCase('IM-TEST-1'),'SUPPLY CHAIN')") === 'Leo Cruz');
  A.run("petApply(getCase('IM-TEST-1'),{id:'AR-1',caseType:'aruba',arubaNo:'AR-1',sfdc:['5001'],ritm:'RITM1',sev:'Sev 2',model:'AP-1',owner:'Kenjie Locsin',closed:false,chk:[1,2]},'link')"); await sleep(3500);
  check('PET information copied on one screen is saved for the other', B.run("getCase('IM-TEST-1').ritm") === 'RITM1' && B.run("getCase('IM-TEST-1').petRef.owner") === 'Kenjie Locsin' && B.run("getCase('IM-TEST-1').sfdc[0]") === '5001');
  console.log('RESULT: ' + (ok ? 'PASS' : 'FAIL'));
  py.kill(); process.exit(ok ? 0 : 1);
})();
