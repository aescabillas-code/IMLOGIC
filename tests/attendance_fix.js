// Nov 26: agents who had signed in were still shown Absent with no log-in time. Each cause found is checked here:
// HPE e-mail names written differently from the schedule, a stale signed-in name, waiting for data that never arrives,
// a log-in write that did not reach the server, and the sign-in time (avail) used as proof of log-in on every screen.
const { chromium } = require('playwright'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', 'web', 'im_logic.html')); await p.waitForTimeout(2500);
  await p.evaluate(() => {
    const T = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }, n = minOf(simNow());
    const ag = (name, a, e) => ({ name, role: 'Incident Manager', start: T(n + a), end: T(n + e), days: [1, 1, 1, 1, 1, 1, 1], status: 'available' });
    STAFF = [ag('Karen Sabile', -30, 420), ag('Jonathan Gaspar', -60, 400), ag('Haina Azuela', -540, -5), { name: 'Jeff Bote', role: 'IM Manager', start: '00:00', end: '23:59', days: [1, 1, 1, 1, 1, 1, 1] }];
    STAFF.forEach(x => x.sch = mkSch(x)); ensureMgrs(STAFF); STAFFLOADED = true; document.getElementById('landing').style.display = 'none';
    window.__w = []; window.__fail = 0;
    DBON = true; GOT.att = 1; GOT.tz = 1; ATT_SINCE = Date.now() - 2 * 864e5; ATT = {}; AVAILIN = {};
    dbq = { doc: id => ({ set: d => { window.__w.push([id, JSON.parse(JSON.stringify(d))]); return window.__fail ? Promise.reject(new Error('down')) : Promise.resolve(); } }), collection: () => ({ where: () => ({ limit: () => ({ onSnapshot: () => {} }) }) }) };
  });
  // HPE e-mail names
  let r = await p.evaluate(() => ['Karen Sabile', 'Sabile, Karen', 'Ma. Karen Sabile', 'KAREN JOY SABILE', 'Karen'].map(n => (schedPerson(n) || {}).name || null));
  ok(JSON.stringify(r) === JSON.stringify(['Karen Sabile', 'Karen Sabile', 'Karen Sabile', 'Karen Sabile', null]), 'HPE account names written differently are matched to the schedule (Last, First / extra names) ' + JSON.stringify(r));
  r = await p.evaluate(() => [(schedByEmail('karen.sabile@hpe.com') || {}).name, (schedByEmail('jonathan_gaspar2@hpe.com') || {}).name, schedByEmail('kss@hpe.com')]);
  ok(r[0] === 'Karen Sabile' && r[1] === 'Jonathan Gaspar' && r[2] === null, 'the HPE e-mail address is used when the account name does not match ' + JSON.stringify(r));
  r = await p.evaluate(() => { ME = { role: null, name: '' }; pickMember({ name: 'KS', email: 'karen.sabile@hpe.com' }); return [ME.role, ME.name]; });
  ok(r[0] === 'agent' && r[1] === 'Karen Sabile', 'signing in with that e-mail signs in as the agent ' + JSON.stringify(r));
  // a "member" sign-in is re-checked and recorded
  r = await p.evaluate(() => { ATT = {}; __w.length = 0; ME = { role: 'member', name: 'Gaspar, Jonathan', email: 'jg@hpe.com' }; const done = recordAtt(); return { done, me: [ME.role, ME.name], w: __w.map(x => x[0]) }; });
  ok(r.done && r.me[0] === 'agent' && r.me[1] === 'Jonathan Gaspar' && r.w[0] === 'att/' + 'Jonathan_Gaspar_' + r.w[0].split('_').pop(), 'someone signed in as a "member" whose name matches the schedule becomes the agent and the log-in is written ' + JSON.stringify(r));
  // stale name after a schedule re-upload
  r = await p.evaluate(() => { ATT = {}; __w.length = 0; ME = { role: 'agent', name: 'Karen M. Sabile' }; const done = recordAtt(); return { done, me: ME.name, w: __w.length }; });
  ok(r.done && r.me === 'Karen Sabile' && r.w === 1, 'a signed-in name spelled differently from the schedule is matched again and recorded');
  // waiting for data that never arrives
  r = await p.evaluate(() => { ATT = {}; __w.length = 0; GOT.tz = 0; ATT_WAIT = 0; ME = { role: 'agent', name: 'Karen Sabile' }; const a = recordAtt(); ATT_WAIT = Date.now() - 16000; const b = recordAtt(); GOT.tz = 1; return [a, b, __w.length]; });
  ok(r[0] === false && r[1] === true && r[2] === 1, 'it waits for the team timezone / saved attendance, but at most 15 seconds');
  // a write that does not reach the server is sent again until the server copy is seen
  r = await p.evaluate(async () => { ATT = {}; ATT_OK = {}; __w.length = 0; __fail = 1; ME = { role: 'agent', name: 'Karen Sabile' }; recordAtt(); await new Promise(r => setTimeout(r, 50)); const id = Object.keys(ATT)[0], first = ATT[id].in; const t1 = Date.now() - ATT_TRY[id]; recordAtt(); const n1 = __w.length; ATT_TRY[id] = Date.now() - 31000; __fail = 0; recordAtt(); const n2 = __w.length, same = __w[1][1].in === first; ATT_OK[id] = 1; ATT_TRY[id] = Date.now() - 60000; recordAtt(); return { t1, n1, n2, same, n3: __w.length }; });
  ok(r.t1 >= 24000 && r.n1 === 1 && r.n2 === 2 && r.same, 'a failed log-in write is sent again (same log-in time) ' + JSON.stringify(r));
  ok(r.n3 === 2, 'once the server copy is seen it is not sent again');
  // sign-in time (avail) counts on every screen
  r = await p.evaluate(() => { ATT = {}; AVAILIN = {}; __w.length = 0; ME = { role: 'manager', name: 'Jeff Bote' }; const k = pers('Karen Sabile'), j = pers('Jonathan Gaspar'); const a0 = [isAbsentNow(k, simNow()), isAbsentNow(j, simNow())]; AVAILIN['Karen Sabile'] = Date.now() - 20 * 60000; AVAILIN['Jonathan Gaspar'] = Date.now() - 20 * 3600e3; const a1 = [isAbsentNow(k, simNow()), isAbsentNow(j, simNow())]; const n = attFill(); const doc = __w[0] && __w[0][1]; return { a0, a1, n, w: __w.map(x => x[0]), late: doc && doc.late, inOk: doc && Math.abs(doc.in - AVAILIN['Karen Sabile']) < 5, online: onlineAgents(simNow()).map(p => p.name) }; });
  ok(r.a0.join() === 'true,true' && r.a1.join() === 'false,true', 'an agent who signed in during this shift is not Absent on other screens; an old sign-in (yesterday) does not count ' + JSON.stringify(r.a1));
  ok(r.n === 1 && r.w.length === 1 && /Karen_Sabile/.test(r.w[0]) && r.inOk && (r.late === 10 || r.late === 11), 'the hand-over screen writes the missing log-in from the sign-in time (10 min late) ' + JSON.stringify(r));
  ok(r.online.includes('Karen Sabile'), 'and the agent gets cases again (no longer treated as absent)');
  r = await p.evaluate(() => { ATT_SINCE = Date.now() - 45 * 864e5; ATT = {}; __w.length = 0; const h = pers('Haina Azuela'); AVAILIN['Haina Azuela'] = Date.now() - 5 * 3600e3; attEosCheck(); const a = __w.filter(x => /Haina/.test(x[0])).map(x => x[1]); AVAILIN['Haina Azuela'] = 0; ATT = {}; __w.length = 0; attEosCheck(); const b = __w.filter(x => /Haina/.test(x[0])).map(x => x[1]); return { a: a.length, b: b.length && b[0].absent }; });
  ok(r.a === 0 && r.b === true, 'at EOS a shift is marked Absent only when there was no sign-in during it ' + JSON.stringify(r));
  ok(!errs.length, 'no browser errors ' + errs.join(' | '));
  await b.close(); console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS'); process.exit(fails ? 1 : 0);
})();
