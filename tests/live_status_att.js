// Nov 26 (live, three screens): Incident Managers & Status counts, statuses saved by two agents at the same moment,
// and the first sign-in of a shift used as the log-in even when the agent's own log-in write never arrives.
// Run: python3 tests/live_host.py . 8765 & node tests/live_status_att.js 8765
const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const url = 'http://127.0.0.1:' + (process.argv[2] || 8765) + '/'; const b = await chromium.launch();
  const open = async () => { const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200))); await p.goto(url); await sleep(3500); const f = p.frames().find(x => x.url().includes('/app')); return { p, f, errs, ctx }; };
  const A = await open();
  await A.f.evaluate(() => { ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); saveMe(); lpHide(); });
  await A.f.evaluate(() => { const WK = r => [0, 1, 2, 3, 4, 5, 6].map(d => r.includes(d) ? 0 : 1); const n = minOf(simNow()), T = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
    STAFF = ['Karen Sabile', 'Jonathan Gaspar', 'Haina Azuela'].map(x => ({ name: x, role: 'Incident Manager', shift: 'Day', start: T(n - 60), end: T(n + 420), days: WK([]), status: 'available' })).concat([{ name: 'Jeff Bote', role: 'IM Manager', shift: 'Day', start: '00:00', end: '23:59', days: WK([]) }]);
    STAFF.forEach(p => { p.sch = mkSch(p) }); ensureMgrs(STAFF); saveStaff(true, true);
    const r = dbq.doc('config/att').set({ since: Date.now() - 45 * 864e5 }); });
  await sleep(3500);
  const B = await open(), C = await open();
  // Karen's own log-in write is lost (blocked on her screen); she signs in, then signs in again 20 s later
  await B.f.evaluate(() => { const d0 = dbq.doc; dbq.doc = p => p.startsWith('att/') ? { set: () => Promise.resolve(), get: () => Promise.resolve({ exists: false }) } : d0(p); window.__d0 = d0; lpEnter('Karen Sabile'); try { hideWelcome() } catch (e) {} window.__first = AVAILIN['Karen Sabile']; });
  await C.f.evaluate(() => { lpEnter('Jonathan Gaspar'); try { hideWelcome() } catch (e) {} });
  await sleep(4500);
  // both go unavailable at the same moment
  await Promise.all([B.f.evaluate(() => { const p = pers('Karen Sabile'); p.status = 'unavailable'; p.reason = 'Break'; p.reasonAt = Date.now(); saveStatus(p.name); render(); }), C.f.evaluate(() => { const p = pers('Jonathan Gaspar'); p.status = 'unavailable'; p.reason = 'Lunch'; p.reasonAt = Date.now(); saveStatus(p.name); render(); })]);
  await sleep(4500);
  const view = X => X.f.evaluate(() => { const g = n => { const p = pers(n); return p.status + (p.reason ? ':' + p.reason : ''); }; const sum = document.getElementById('agent-sum').innerText.replace(/\s+/g, ' '); return { k: g('Karen Sabile'), j: g('Jonathan Gaspar'), sum }; });
  let a = await view(A), bb = await view(B), cc = await view(C);
  ok(a.k === 'unavailable:Break' && a.j === 'unavailable:Lunch', 'two agents changing status at the same moment: both statuses are kept (manager screen) ' + JSON.stringify(a));
  ok(bb.j === 'unavailable:Lunch' && cc.k === 'unavailable:Break', 'each agent sees the other one\'s status too ' + JSON.stringify([bb.j, cc.k]));
  ok(/Available 0/.test(a.sum) && /Unavailable 3/.test(a.sum) && /incl\. 1 absent/.test(a.sum), 'counts match the list: 0 available, 3 unavailable incl. 1 absent (Haina not logged in) · ' + a.sum);
  await B.f.evaluate(() => { const p = pers('Karen Sabile'); p.status = 'available'; p.reason = ''; p.reasonAt = 0; p.availAt = Date.now(); saveStatus(p.name); render(); });
  await sleep(4000); a = await view(A);
  ok(a.k === 'available' && /Available 1/.test(a.sum) && /Unavailable 2/.test(a.sum), 'Karen back to Available: 1 available, 2 unavailable · ' + a.sum);
  // first sign-in becomes the log-in although her own write never arrived; a second sign-in later does not change it
  const first = await B.f.evaluate(() => window.__first);
  await sleep(16000);
  const B2 = await open(); await B2.f.evaluate(() => { lpEnter('Karen Sabile'); try { hideWelcome() } catch (e) {} }); await sleep(6000);
  const at = await A.f.evaluate(() => { const p = pers('Karen Sabile'), sh = shiftAt(p, simNow()), d = ATT[attId(p.name, sh.k)]; const row = [...document.querySelectorAll('#agent-list tr')].find(r => /Karen Sabile/.test(r.innerText)); return { in: d && d.in, by: d && d.by, row: row ? row.innerText.replace(/\s+/g, ' ') : '', abs: isAbsentNow(p, simNow()), ins: (AVAILINS['Karen Sabile'] || []).length, txt: d && d.in ? fmt12(new Date(d.in)) : '' }; });
  ok(at.ins >= 2, 'the server keeps every sign-in (' + at.ins + ')');
  ok(at.in && Math.abs(at.in - first) < 1500 && !at.abs, 'the log-in saved is her FIRST sign-in, not the later one ' + JSON.stringify({ in: at.in, first, by: at.by }));
  ok(at.row.includes('Logged in ' + at.txt), 'the Incident Managers list shows "Logged in ' + at.txt + '" · ' + at.row);
  const srv = await A.f.evaluate(async () => { const p = pers('Karen Sabile'), sh = shiftAt(p, simNow()); const s = await dbq.collection('att').get(); const d = s.docs.find(x => x.id === attId(p.name, sh.k)); return d ? d.data().in : null; });
  ok(Math.abs(srv - first) < 1500, 'and it is on the server');
  ok(![A, B, C, B2].some(x => x.errs.length), 'no browser errors ' + [A, B, C, B2].map(x => x.errs.join('|')).join(' '));
  await b.close(); console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS'); process.exit(fails ? 1 : 0);
})();
