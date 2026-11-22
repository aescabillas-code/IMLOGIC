// Live check (three screens on tests/live_host.py): checklist adds from every role show live, typing is kept, a schedule change is never reverted,
// Settings keeps its scroll, an agent signing in with HPE email is detected.   Usage: python tests/live_host.py . 8765 & node tests/live_sync_fixes.js 8765
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = 'http://127.0.0.1:' + process.argv[2] + '/';
  const b = await chromium.launch();
  const open = async () => { const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200))); await p.goto(url); await sleep(3500); const f = p.frames().find(x => x.url().includes('/app')); return { p, f, errs }; };
  let fails = 0; const check = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); if (!ok) fails++; };
  const A = await open(), B = await open(), C = await open();
  const wait = async (X, fn, arg, max = 8000) => { const t = Date.now(); while (Date.now() - t < max) { if (await X.f.evaluate(fn, arg)) return Date.now() - t; await sleep(100); } return -1; };
  await A.f.evaluate(() => { ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); saveMe(); lpHide(); render() });
  // test data: a team with several incident managers (the app ships without one until a schedule is uploaded)
  await A.f.evaluate(() => { const WK = r => [0, 1, 2, 3, 4, 5, 6].map(d => r.includes(d) ? 0 : 1); STAFF = ['Kenjie Locsin', 'Karen Sabile', 'Jonathan Gaspar', 'Haina Azuela', 'Lucille Layug'].map(n => ({ name: n, role: 'Incident Manager', shift: 'Day', start: '00:00', end: '23:59', days: WK([]), status: 'available' })).concat([{ name: 'June John Cruz', role: 'Incident Manager', shift: 'Morning', start: '06:00', end: '14:00', days: WK([0, 1]) }, { name: 'Jeff Bote', role: 'IM Manager', shift: 'Day', start: '08:00', end: '17:00', days: WK([0, 6]) }]); STAFF.forEach(p => { p.sch = mkSch(p) }); ensureMgrs(STAFF); saveStaff(true, true) });
  await sleep(3000);
  const ag = await A.f.evaluate(() => STAFF.filter(p => !isMgr(p) && !isFA(p.name)).map(p => p.name));
  await A.f.evaluate(n => codSet(n), ag[0]); await sleep(1200);
  await B.f.evaluate(n => { lpEnter(n); try { hideWelcome() } catch (e) {} }, ag[1]);
  await C.f.evaluate(n => { lpEnter(n); try { hideWelcome() } catch (e) {} }, ag[0]);   // C is the IM POC
  await sleep(1200);
  await A.f.evaluate(n => { const c = mkCase('CK-1', n, { caseType: 'att', account: 'Account A', recv: Date.now() }); CASES.unshift(c); logc(c, 'Case created', 'Jeff Bote', 'test'); render() }, ag[1]);
  await wait(B, () => !!getCase('CK-1')); await wait(C, () => !!getCase('CK-1'));
  for (const X of [A, B, C]) await X.f.evaluate(() => openCaseModal('CK-1'));
  // B's cursor sits in the checklist box, C's cursor in "Log an update"
  await B.f.focus('#new-in'); await C.f.focus('#upd-in');
  // ---- checklist: added with the checklist's own Add button, by everyone
  const addBtn = X => X.f.click('#new-in ~ button');
  for (const [X, who] of [[B, 'agent'], [A, 'manager'], [C, 'POC']]) { await X.f.fill('#new-in', 'Item by ' + who); await addBtn(X); await sleep(150); }
  for (const [X, who] of [[A, 'manager'], [B, 'agent'], [C, 'POC']]) {
    const ms = await wait(X, () => { const t = getCase('CK-1').items.map(i => i.text); return ['agent', 'manager', 'POC'].every(w => t.includes('Item by ' + w)) && ['agent', 'manager', 'POC'].every(w => document.getElementById('case-body').textContent.includes('Item by ' + w)); });
    check(`checklist items from the agent, the manager and the POC show live on the ${who}'s open case`, ms >= 0, ms);
  }
  check('the three items are saved once each', await A.f.evaluate(() => getCase('CK-1').items.filter(i => /^Item by /.test(i.text)).length) === 3, await A.f.evaluate(() => getCase('CK-1').items.map(i => i.text)));
  // ---- typing is never interrupted
  await C.f.click('#upd-in'); await C.f.type('#upd-in', 'Typing while others change the case ', { delay: 60 });
  await A.f.evaluate(() => cdSet('CK-1', 'model', 'AP-777'));
  await C.f.type('#upd-in', 'and still typing', { delay: 60 }); await sleep(2500);
  check('text being typed is kept while the case updates', await C.f.evaluate(() => document.getElementById('upd-in').value) === 'Typing while others change the case and still typing', await C.f.evaluate(() => document.getElementById('upd-in').value));
  check('…and the change shows once typing pauses', await wait(C, () => /AP-777/.test(document.getElementById('case-body').innerHTML)) >= 0);
  check('the cursor is still in the box', await C.f.evaluate(() => document.activeElement && document.activeElement.id) === 'upd-in');
  // ---- schedule: a manager's change is never reverted by another screen
  await B.f.evaluate(() => { STAFF_BUSY = 1; STAFF_BUSY_T = Date.now() });          // B is busy saving: it ignores incoming lists
  await A.f.evaluate(() => { STAFF.push({ name: 'New Person', role: 'Incident Manager', shift: 'Day', start: '08:00', end: '17:00', days: [1, 1, 1, 1, 1, 1, 1], status: 'available' }); const k = STAFF.find(p => p.name === 'Karen Sabile'); if (k) { k.start = '09:00'; k.end = '18:00'; k.sch = mkSch(k) } saveStaff(true, true) });
  await sleep(2000);
  await B.f.evaluate(() => { const p = pers(ME.name); p.status = 'unavailable'; p.reason = 'Break'; saveStaff(true, true); STAFF_BUSY = Math.max(0, STAFF_BUSY - 1) });   // B writes its older list
  await sleep(3500);
  for (const [X, w] of [[A, 'manager'], [B, 'agent'], [C, 'POC']]) {
    const r = await X.f.evaluate(() => ({ np: STAFF.some(p => p.name === 'New Person'), ks: (STAFF.find(p => p.name === 'Karen Sabile') || {}).start, st: (STAFF.find(p => p.name === 'Karen Sabile') || {}).status }));
    check(`the manager's schedule change is kept on the ${w}'s screen (and the agent's status too)`, r.np && r.ks === '09:00' && r.st === 'unavailable', r);
  }
  check('the saved schedule has the change', await A.f.evaluate(() => STAFF_DOC.list.some(p => p.name === 'New Person') && STAFF_DOC.list.find(p => p.name === 'Karen Sabile').start === '09:00'));
  // ---- settings scroll position is kept while data arrives
  await A.f.evaluate(() => { closeCase(); openSettings() }); await sleep(800);
  const sc = await A.f.evaluate(() => { const L = [...document.querySelectorAll('#settings *')].filter(e => e.scrollWidth > e.clientWidth + 40 && /auto|scroll/.test(getComputedStyle(e).overflowX)); const e = L[0]; if (!e) return null; e.scrollLeft = 400; const v = [...document.querySelectorAll('#settings *')].find(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)); if (v) v.scrollTop = 300; window._sc = [e, v]; return [e.scrollLeft, v && v.scrollTop] });
  for (let i = 0; i < 3; i++) { await B.f.evaluate(i => { const p = pers(ME.name); p.status = i % 2 ? 'available' : 'unavailable'; saveStatus(p.name) }, i); await sleep(1500) }
  const sc2 = await A.f.evaluate(() => { const [e, v] = window._sc, cur = [...document.querySelectorAll('#settings *')].filter(x => x.scrollWidth > x.clientWidth + 40 && /auto|scroll/.test(getComputedStyle(x).overflowX))[0], cv = [...document.querySelectorAll('#settings *')].find(x => x.scrollHeight > x.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(x).overflowY)); return [cur && cur.scrollLeft, cv && cv.scrollTop, cur === e] });
  check('Settings keeps its sideways and up/down scroll while other screens save', sc && sc2[0] === sc[0] && sc2[1] === sc[1], { sc, sc2 });
  // ---- an agent who signs in with their HPE email is detected as the agent
  await B.f.evaluate(n => { signOut && 0; ME = { role: null, name: '' }; pickMember({ name: n.toUpperCase(), email: 'x@hpe.com' }) }, ag[3]);
  check('an agent signing in with HPE email is signed in as that agent', await B.f.evaluate(n => ME.role === 'agent' && ME.name === n, ag[3]), await B.f.evaluate(() => ME));
  check('…and the other screens see the sign-in', await wait(A, n => !!AVAILIN[n], ag[3]) >= 0);
  check('no browser errors', A.errs.length + B.errs.length + C.errs.length === 0, [A.errs, B.errs, C.errs]);
  console.log('RESULT: ' + (fails ? 'FAIL' : 'PASS')); await b.close(); process.exit(0);
})();
