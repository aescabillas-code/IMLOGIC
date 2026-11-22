// Live check (tests/live_host.py): changes from another screen show within about a second, by updating the page in place
// (no element rebuilt, no scroll / focus / typing lost, no reload); typing is saved while typing.
// Usage: python tests/live_host.py . 8765 & node tests/live_realtime.js 8765
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = 'http://127.0.0.1:' + process.argv[2] + '/';
  const b = await chromium.launch();
  const open = async () => { const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200))); await p.goto(url); await sleep(3500); const f = p.frames().find(x => x.url().includes('/app')); return { p, f, errs, ctx }; };
  let fails = 0; const out = {}; const check = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); if (!ok) fails++; };
  const A = await open(), B = await open();
  const wait = async (X, fn, arg, max = 8000) => { const t = Date.now(); while (Date.now() - t < max) { if (await X.f.evaluate(fn, arg)) return Date.now() - t; await sleep(25); } return -1; };
  for (const X of [A, B]) await X.f.evaluate(() => { ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); saveMe(); lpHide(); try { hideWelcome() } catch (e) {} render() });
  await A.f.evaluate(() => { for (let i = 0; i < 25; i++) { const c = mkCase('RT-' + i, STAFF.find(p => !isMgr(p)).name, { caseType: 'att', account: 'Account A', recv: Date.now() - i * 1000 }); CASES.unshift(c); logc(c, 'Case created', 'Jeff Bote', 't') } render() });
  await wait(B, () => CASES.filter(c => /^RT-/.test(c.id)).length === 25);
  await B.p.mouse.move(700, 400);   // B is in use
  await B.f.evaluate(() => { openCaseModal('RT-3'); const m = document.querySelector('#case-modal .overflow-y-auto') || document.getElementById('case-body').parentElement; m.scrollTop = 600; window._m = m; window._mark = document.getElementById('new-in'); window._row = [...document.querySelectorAll('#rows tr')][0]; });
  await B.f.focus('#upd-in'); await B.f.type('#upd-in', 'typing on B', { delay: 30 }); await sleep(800);
  const st0 = await B.f.evaluate(() => window._m.scrollTop);
  // A changes the case B has open
  const t0 = Date.now();
  await A.f.evaluate(() => { cdSet('RT-3', 'model', 'LIVE-1'); const c = getCase('RT-3'); c.items.push({ id: 'live-it', text: 'Added on A', done: false, rem: null, by: 'A', at: Date.now() }); queueSave(c) });
  out.caseMs = await wait(B, () => document.getElementById('case-body').textContent.includes('Added on A') && /LIVE-1/.test(document.getElementById('case-body').innerHTML));
  check('a change on another screen shows in the open case within about a second', out.caseMs >= 0 && out.caseMs < 2000, out.caseMs);
  const r = await B.f.evaluate(() => ({ same: window._mark === document.getElementById('new-in') && window._mark.isConnected, scroll: window._m.scrollTop, focus: document.activeElement && document.activeElement.id, val: document.getElementById('upd-in').value }));
  check('the open case is updated in place (not rebuilt)', r.same, r);
  check('its scroll position is kept', Math.abs(r.scroll - st0) < 2, { st0, r });
  check('the box being typed in keeps the cursor and the text', r.focus === 'upd-in' && r.val === 'typing on B', r);
  // dashboard rows updated in place
  await B.f.evaluate(() => closeCase());
  await B.f.evaluate(() => { window._row = [...document.querySelectorAll('#rows tr')].find(t => t.textContent.includes('RT-5')); });
  await A.f.evaluate(() => cdSet('RT-5', 'account', 'Zed Live Co'));
  out.rowMs = await wait(B, () => [...document.querySelectorAll('#rows tr')].some(t => t.textContent.includes('Zed Live Co')));
  check('the dashboard shows the change within about a second', out.rowMs >= 0 && out.rowMs < 2000, out.rowMs);
  check('…by updating the row in place', await B.f.evaluate(() => !!window._row && window._row.isConnected && window._row.textContent.includes('Zed Live Co')));
  // station owner: saved while typing (before leaving the field)
  await A.f.evaluate(() => openCaseModal('RT-7'));
  await A.f.click('#sto-0'); await A.f.type('#sto-0', 'Typed Owner', { delay: 25 });
  out.ownerMs = await wait(B, () => (getCase('RT-7').stO || {}).WFM === 'Typed Owner');
  check('a station owner name is saved while it is typed', out.ownerMs >= 0, out.ownerMs);
  await A.f.press('#sto-0', 'Tab'); await sleep(1500);
  check('…and written to the history once when the field is left', await A.f.evaluate(() => getCase('RT-7').log.filter(l => l.action === 'Station owner set').length) === 1);
  // a typed update survives a refresh
  await A.f.click('#upd-in'); await A.f.type('#upd-in', 'half written update', { delay: 20 }); await sleep(400);
  await A.p.reload(); await sleep(4000); A.f = A.p.frames().find(x => x.url().includes('/app'));
  await A.f.evaluate(() => { try { hideWelcome() } catch (e) {} openCaseModal('RT-7') }); await sleep(400);
  check('a half-written update comes back after a refresh', await A.f.evaluate(() => document.getElementById('upd-in').value) === 'half written update');
  // settings: updated in place while other screens save
  await B.f.evaluate(() => { openSettings(); window._sb = document.querySelector('#set-body table') || document.getElementById('set-body').firstElementChild });
  for (let i = 0; i < 2; i++) { await A.f.evaluate(i => { const p = STAFF.find(q => !isMgr(q)); p.status = i % 2 ? 'available' : 'unavailable'; saveStatus(p.name) }, i); await sleep(1500) }
  check('Settings is updated in place while other screens save (not rebuilt)', await B.f.evaluate(() => !!window._sb && window._sb.isConnected));
  // clear cache refreshes the data in the background, no reload
  await B.f.evaluate(() => { window._alive = 42; closeSettings(); clearCache() }); await sleep(2500);
  check('"Clear cache" refreshes the data without reloading the page', await B.f.evaluate(() => window._alive === 42 && CASES.some(c => c.id === 'RT-3')));
  check('no browser errors', !A.errs.length && !B.errs.length, [A.errs, B.errs]);
  console.log(JSON.stringify(out)); console.log('RESULT: ' + (fails ? 'FAIL' : 'PASS')); await b.close(); process.exit(fails ? 1 : 0);
})();
