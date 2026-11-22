// Live check: three screens save the same case at the same moment (12 checklist adds, 3 field edits, a delete and an add): nothing is lost.
// Usage: python tests/live_host.py . 8765 & node tests/live_race.js 8765
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = 'http://127.0.0.1:' + process.argv[2] + '/';
  const b = await chromium.launch();
  const open = async () => { const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200))); await p.goto(url); await sleep(3500); const f = p.frames().find(x => x.url().includes('/app')); return { p, f, errs }; };
  let fails = 0; const check = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); if (!ok) fails++; };
  const S = [await open(), await open(), await open()];
  await S[0].f.evaluate(() => { ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); lpHide(); const c = mkCase('RC-1', STAFF.find(p => !isMgr(p)).name, { caseType: 'att', account: 'Account A', recv: Date.now() }); CASES.unshift(c); logc(c, 'Case created', 'Jeff Bote', 't'); render() });
  for (const X of S.slice(1)) { const t = Date.now(); while (Date.now() - t < 8000 && !(await X.f.evaluate(() => !!getCase('RC-1')))) await sleep(100); await X.f.evaluate(() => { ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); lpHide() }) }
  for (let r = 0; r < 4; r++) await Promise.all(S.map((X, i) => X.f.evaluate(([i, r]) => { const c = getCase('RC-1'); c.items.push({ id: 'r' + r + 's' + i, text: `round ${r} screen ${i}`, done: false, rem: null, by: 'x', at: Date.now() }); queueSave(c) }, [i, r])));
  await Promise.all([S[0].f.evaluate(() => cdSet('RC-1', 'model', 'M-1')), S[1].f.evaluate(() => cdSet('RC-1', 'store', '4321')), S[2].f.evaluate(() => { const c = getCase('RC-1'); c.items[0].text = 'edited first item'; queueSave(c) })]);
  await sleep(5000);
  for (const [i, X] of S.entries()) {
    const r = await X.f.evaluate(() => { const c = getCase('RC-1'); return { n: c.items.filter(x => /^round/.test(x.text)).length, model: c.model, store: c.store, first: c.items[0].text } });
    check(`screen ${i}: 12 items added at the same moment are all kept, and three different edits all kept`, r.n === 12 && r.model === 'M-1' && r.store === '4321' && r.first === 'edited first item', r);
  }
  // delete on one screen while another adds
  await Promise.all([S[0].f.evaluate(() => { const c = getCase('RC-1'); c.items = c.items.filter(x => x.id !== 'r0s0'); queueSave(c) }), S[1].f.evaluate(() => { const c = getCase('RC-1'); c.items.push({ id: 'late', text: 'late add', done: false, rem: null }); queueSave(c) })]);
  await sleep(4000);
  for (const [i, X] of S.entries()) check(`screen ${i}: a delete and an add at the same time both stick`, await X.f.evaluate(() => { const c = getCase('RC-1'); return !c.items.some(x => x.id === 'r0s0') && c.items.some(x => x.id === 'late') }));
  check('no browser errors', S.every(X => !X.errs.length), S.map(X => X.errs));
  console.log('RESULT: ' + (fails ? 'FAIL' : 'PASS')); await b.close(); process.exit(0);
})();
