// Live check: a linked PET case changed in PET (maintenance window start / end, CE arrival) shows in IM•LOGIC on its own.
//   PET_FAKE_FILE=/tmp/petcases.json python tests/live_host.py . 8782 &   then: node tests/live_pet_sync.js 8782 /tmp/petcases.json
const { chromium } = require('playwright'); const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const file = process.argv[3]; const put = d => { const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}; (db.cases = db.cases || {})[d._id] = d; fs.writeFileSync(file, JSON.stringify(db)); };
  put({ _id: 'AR-88', caseType: 'aruba', arubaNo: 'AR-88', owner: 'PET Owner', items: [], _updated: Date.now() });
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:' + process.argv[2] + '/'); await sleep(3500); const f = p.frames().find(x => x.url().includes('/app'));
  let fails = 0; const check = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); if (!ok) fails++; };
  await f.evaluate(() => { ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); lpHide(); try { hideWelcome() } catch (e) {} const c = mkCase('IM-88', (STAFF.find(p => !isMgr(p)) || { name: 'Test Agent' }).name, { caseType: 'aruba', account: 'Account A', recv: Date.now() }); CASES.unshift(c); logc(c, 'Case created', 'Jeff Bote', 't'); PETS = { cid: 'IM-88', q: 'AR-88', busy: false, items: [{ id: 'AR-88', caseType: 'aruba', arubaNo: 'AR-88', owner: 'PET Owner' }], err: '' }; petUse('IM-88', 0); openCaseModal('IM-88') });
  await sleep(1500);
  const S = Date.UTC(2026, 10, 22, 14, 0), E = Date.UTC(2026, 10, 22, 19, 30);
  put({ _id: 'AR-88', caseType: 'aruba', arubaNo: 'AR-88', owner: 'PET Owner', items: [], mw: { s: S, e: null, by: 'PET Owner', ts: Date.now() }, ceArr: S - 3600e3, _updated: Date.now() });
  const t = Date.now(); let ok = false; while (Date.now() - t < 12000) { ok = await f.evaluate(S => { const c = getCase('IM-88'); return !!(c.mw && c.mw.s === S) && document.getElementById('case-body').textContent.includes('Maintenance window') }, S); if (ok) break; await sleep(200); }
  check('a maintenance window set in PET after linking shows in IM•LOGIC on its own', ok, Date.now() - t);
  put({ _id: 'AR-88', caseType: 'aruba', arubaNo: 'AR-88', owner: 'PET Owner', items: [], mw: { s: S, e: E, by: 'PET Owner', ts: Date.now(), endBy: 'PET Owner' }, ceArr: S - 3600e3, _updated: Date.now() });
  const t2 = Date.now(); ok = false; while (Date.now() - t2 < 12000) { ok = await f.evaluate(E => getCase('IM-88').mw.e === E, E); if (ok) break; await sleep(200); }
  check('the maintenance window end set later in PET shows too', ok, Date.now() - t2);
  check('CE arrival is pulled as well', await f.evaluate(S => getCase('IM-88').ceArr === S - 3600e3, S));
  check('the open case shows start and end', await f.evaluate(() => /→/.test(document.getElementById('case-body').textContent.split('Maintenance window')[1] || '')));
  check('one history line per PET change', await f.evaluate(() => getCase('IM-88').log.filter(l => l.action === 'PET data refreshed').length) === 2, await f.evaluate(() => getCase('IM-88').log.filter(l => l.action === 'PET data refreshed').length));
  check('no browser errors', !errs.length, errs);
  console.log('RESULT: ' + (fails ? 'FAIL' : 'PASS')); await b.close(); process.exit(fails ? 1 : 0);
})();
