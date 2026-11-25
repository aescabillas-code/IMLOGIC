// Nov 24: SLA profile per case (Standard, 4hr / 6hr Call to Repair, Next Business Day) with minutes per station,
// the hand-over Queue (EOS with nobody online, Customer Hold cases included) and the attendance log-in time.
const { chromium } = require('playwright'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SHOTS = process.env.SHOTS || '/home/claude/build';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', 'web', 'im_logic.html')); await p.waitForTimeout(2500);
  // team: Ann ended her shift 2 min ago, Ben starts in 3 hours, Cy is on shift but Unavailable; Jeff is the manager
  await p.evaluate(() => {
    const T = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }, n = minOf(simNow());
    const ag = (name, a, e, st) => ({ name, role: 'Incident Manager', start: T(n + a), end: T(n + e), days: [1, 1, 1, 1, 1, 1, 1], status: st || 'available' });
    STAFF = [ag('Ann Old', -480, -2), ag('Ben New', 180, 660), ag('Cy Busy', -60, 400, 'unavailable'), { name: 'Jeff Bote', role: 'IM Manager', start: '00:00', end: '23:59', days: [1, 1, 1, 1, 1, 1, 1] }];
    STAFF.forEach(x => x.sch = mkSch(x)); ensureMgrs(STAFF); STAFFLOADED = true;
    ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); SIM_USER = 'Jeff Bote'; document.getElementById('landing').style.display = 'none'; CASES.length = 0;
  });

  // ---------- SLA profiles ----------
  let r = await p.evaluate(() => { const c = mkCase('P-STD', 'Cy Busy', {}); CASES.push(c); return { k: c.slaP, sla: stnSla('WFM', c), std: stnSlaStd('WFM'), name: slaPName(slaPOf(c)) }; });
  ok(r.k === 'std' && r.sla === r.std && r.name === 'Standard', 'a new case gets the Standard profile by default (the station SLAs used until now)');
  r = await p.evaluate(() => { const c = getCase('P-STD'); c.stAt = stnNow() - 9 * 60000; const a = [stnLvl(c), stnSla('WFM', c)]; slaPCase('P-STD', 'ctr4'); return { std: a, ctr4: [stnLvl(c), stnSla('WFM', c), stnSla('FULFILLMENT', c)], log: c.log[0].action + ' · ' + c.log[0].details, tot: slaPTot('ctr4') }; });
  ok(r.std[1] === 15 && r.std[0] === 1 && r.ctr4[1] === 10 && r.ctr4[0] === 2, '9 min in WFM: Standard (15 min) is a warning, 4hr Call to Repair (10 min) is critical ' + JSON.stringify(r));
  ok(/SLA profile changed · Standard → 4hr Call to Repair · WFM SLA 15 → 10 min/.test(r.log), 'changing the profile is written to the case history: ' + r.log);
  ok(r.tot === 240 && await p.evaluate(() => slaPTot('ctr6') === 360), 'suggested minutes add up to 4 hours (4hr CTR) and 6 hours (6hr CTR)');
  r = await p.evaluate(() => { openSettings(); slaPSet('ctr4', 'WFM', 12); const c = getCase('P-STD'); let saved = null; try { saved = JSON.parse(localStorage.getItem('iml_stn')); } catch (e) {} return { sla: stnSla('WFM', c), saved: saved && saved.pm && saved.pm.ctr4 && saved.pm.ctr4.WFM, rest: saved && saved.pm.ctr4.PSE, others: stnSla('WFM', mkCase('X', 'Cy Busy', { slaP: 'ctr6' })) }; });
  ok(r.sla === 12 && r.saved === 12 && r.rest === 30 && r.others === 15, 'Settings: a profile minute is saved with the station settings and applies at once (other profiles unchanged) ' + JSON.stringify(r));
  await p.evaluate(() => setTabTo('stn')); await p.waitForTimeout(200);
  const st = await p.evaluate(() => document.getElementById('settings').innerText);
  ok(/Onsite \/ RMA SLA · minutes allowed in each station/.test(st) && /Troubleshooting only SLA · minutes allowed in each station/.test(st) && /4hr Call to Repair/.test(st) && /6hr Call to Repair/.test(st) && /Next Business Day/.test(st) && /Total \(all stations\)/.test(st) && /SLA profile for new cases/.test(st), 'Settings › Stations & SLA has the SLA profile table (minutes per station, totals, default for new cases)');
  await p.evaluate(() => { const el = [...document.querySelectorAll('#settings div')].find(d => /Onsite \/ RMA SLA · minutes/.test(d.textContent) && d.className.includes('border rounded-xl')); if (el) el.scrollIntoView(); });
  await p.screenshot({ path: SHOTS + '/s16_profiles.png' });
  r = await p.evaluate(() => { stnSetOpt('defP', 'ctr6'); const c = mkCase('P-DEF', 'Cy Busy', {}); const k = c.slaP; stnSetOpt('defP', 'std'); closeSettings(); return k; });
  ok(r === 'ctr6', 'the default profile for new cases can be changed (6hr Call to Repair)');
  // add form
  r = await p.evaluate(() => { openAdd(); addType('aruba'); const sel = document.getElementById('add-slap'); const opts = sel ? [...sel.options].map(o => o.value) : []; document.getElementById('add-id').value = 'ADD-NBD'; sel.value = 'nbd'; addCase(); const c = getCase('ADD-NBD'); return { opts, k: c && c.slaP, log: c && c.log.find(l => l.action === 'Case created') }; });
  ok(r.opts.join() === 'std,ctr4,ctr6,nbd' && r.k === 'nbd', 'the add-case form has an SLA profile choice and the case keeps it ' + JSON.stringify(r.opts) + ' ' + r.k);
  ok(r.log && /Next Business Day/.test(r.log.details), 'the case-created line names the profile');
  // case card + move keeps the profile minutes in the finished stay
  await p.evaluate(() => openCaseModal('P-STD')); await p.waitForTimeout(300);
  r = await p.evaluate(() => { const s = document.getElementById('slap-case'); return { v: s && s.value, n: s && s.options.length, txt: document.getElementById('case-body').innerText.includes('SLA 12 min') }; });
  ok(r.v === 'ctr4' && r.n === 4 && r.txt, 'the Station & SLA card shows the SLA profile picker and the profile minutes ' + JSON.stringify(r));
  await p.evaluate(() => { const el = document.getElementById('slap-case'); if (el) el.scrollIntoView({ block: 'center' }); });
  await p.screenshot({ path: SHOTS + '/s17_case_profile.png' });
  r = await p.evaluate(() => { stnMove('P-STD'); const c = getCase('P-STD'); const h = c.stH[c.stH.length - 1]; return { s: h.s, sla: h.sla, met: h.met, now: stnOf(c), nsla: stnSla(stnOf(c), c) }; });
  ok(r.s === 'WFM' && r.sla === 12 && r.met === true && r.now === 'CARE' && r.nsla === 15, 'moving to the next station: the finished stay keeps the profile SLA (12 min, met) and CARE uses the 4hr CTR minutes ' + JSON.stringify(r));
  await p.evaluate(() => closeCase());
  // SLA report filter
  r = await p.evaluate(() => { rptWeek(0); RPT.view = 'sla'; RPT.slaP = 'ctr4'; openSettings(); setTabTo('reports'); const t = document.getElementById('settings').innerText; RPT.slaP = 'all'; setTabTo('reports'); const t2 = document.getElementById('settings').innerText; closeSettings(); return { only: /P-STD/.test(t) && !/ADD-NBD/.test(t), all: /P-STD/.test(t2) && /ADD-NBD/.test(t2), varies: /varies/.test(t2), col: /SLA Profile/.test(t2) }; });
  ok(r.only && r.all && r.varies && r.col, 'SLA report: filter by profile, an SLA Profile column, and "varies" when profiles are mixed ' + JSON.stringify(r));
  ok(await p.evaluate(() => RFIELDS.some(f => f.k === 'slaP' && f.l === 'SLA Profile')), 'the report builder has an SLA Profile column');
  ok(await p.evaluate(() => /4H CTR/.test(slaPChip(getCase('P-STD'))) && slaPChip(mkCase('Z', 'Cy Busy', {})) === ''), 'the cases list shows a small profile tag next to the station (none for Standard)');

  // ---------- hand-over queue ----------
  r = await p.evaluate(async () => {
    CASES.length = 0; const c = mkCase('HOLD-1', 'Ann Old', {}); c.credit = { n: 'Ann Old', at: Date.now() - 36e5 }; CASES.push(c);
    const it = { id: uid(), text: 'Call back customer', done: false, rem: { at: Date.now() + 3 * 36e5, text: 'Call back customer', fired: false, by: 'Ann Old', setAt: Date.now() }, by: 'Ann Old', at: Date.now() };
    c.items.push(it); c.hold = { iid: it.id, at: stnNow(), by: 'Ann Old', set: Date.now() }; c.cstatus = 'Customer Hold';
    const n = mkCase('NEW-1', 'Queue', {}); n.credit = { n: 'Queue', at: Date.now(), q: 1 }; CASES.push(n);
    await new Promise(r => setTimeout(r, 2500)); render();
    return { own: c.owner, q: c.qho, held: holdActive(c), st: c.cstatus, log: c.log[0].details, strip: (document.getElementById('q-strip') || {}).innerText || '' };
  });
  ok(r.own === 'Queue' && r.q && r.q.from === 'Ann Old' && r.held && r.st === 'Customer Hold', 'Customer Hold case at its owner\'s EOS with nobody available goes to the Queue (still on hold) ' + JSON.stringify([r.own, r.q]));
  ok(/reached end of shift \(EOS\) and no agent is available: case moved to the Queue/.test(r.log), 'the history says why it is in the Queue');
  ok(/Queue · 2 cases waiting for an available agent/.test(r.strip) && /EOS of Ann Old/.test(r.strip) && /new case/.test(r.strip), 'the Queue is shown under the station tiles with the reason and waiting time');
  await p.evaluate(() => { const q = document.getElementById('q-strip'); if (q) q.scrollIntoView({ block: 'center' }); });
  await p.screenshot({ path: SHOTS + '/s18_queue.png' });
  r = await p.evaluate(async () => { pers('Cy Busy').status = 'available'; pers('Cy Busy').availAt = Date.now(); await new Promise(r => setTimeout(r, 2500)); const c = getCase('HOLD-1'), n = getCase('NEW-1'); return { own: c.owner, q: c.qho, ho: isHo(c), log: c.log[0].details, nown: n.owner, ncred: n.credit && n.credit.n, strip: (document.getElementById('q-strip') || {}).innerText || '' }; });
  ok(r.own === 'Cy Busy' && !r.q && r.ho, 'as soon as an agent is on shift and available, the queued EOS case is assigned to them (as a hand-over case) ' + JSON.stringify([r.own, r.q, r.ho]));
  ok(/Case waited in the Queue/.test(r.log), 'the history says it came from the Queue: ' + r.log);
  ok(r.nown === 'Cy Busy' && r.ncred === 'Cy Busy', 'the queued new case is assigned too (counts as a new case for them)');
  ok(r.strip === '', 'the Queue strip disappears when it is empty');
  // owner no longer on the schedule
  r = await p.evaluate(async () => { const c = mkCase('GONE-1', 'Left Company', {}); c.credit = { n: 'Left Company', at: Date.now() - 36e5 }; CASES.push(c); await new Promise(r => setTimeout(r, 2500)); return { own: c.owner, log: c.log[0].details }; });
  ok(r.own === 'Cy Busy' && /no longer on the shift schedule/.test(r.log), 'a case whose owner is no longer on the shift schedule is handed over too (it could never reach that owner\'s EOS) ' + r.own);
  r = await p.evaluate(async () => { const c = mkCase('MGR-1', 'Jeff Bote', {}); CASES.push(c); await new Promise(r => setTimeout(r, 2000)); return c.owner; });
  ok(r === 'Jeff Bote', 'a case held by a manager is not moved');
  // hand-over with someone online at EOS is unchanged
  r = await p.evaluate(async () => { const c = mkCase('EOS-2', 'Ann Old', {}); c.credit = { n: 'Ann Old', at: Date.now() - 36e5 }; CASES.push(c); await new Promise(r => setTimeout(r, 2000)); return [c.owner, !!c.qho]; });
  ok(r[0] === 'Cy Busy' && !r[1], 'with an agent online at EOS the case goes straight to them (no Queue)');

  // ---------- attendance log-in time ----------
  r = await p.evaluate(() => {
    const T = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }, n = minOf(simNow());
    const ag = { name: 'Att Ana', role: 'Incident Manager', start: T(n - 30), end: T(n + 420), days: [1, 1, 1, 1, 1, 1, 1], status: 'available' }; ag.sch = mkSch(ag); STAFF.push(ag);
    const db0 = DBON, g0 = GOT.att, q0 = dbq; const writes = []; DBON = true; dbq = { doc: id => ({ set: d => { writes.push([id, d]); return Promise.resolve(); } }) };
    ME = { role: 'agent', name: 'Att Ana' }; ATT = {}; GOT.att = 0; GOT.tz = 1; ATT_WAIT = 0; ATT_SIGNIN = srvNow() - 10 * 60000;   // signed in 10 minutes ago
    const before = recordAtt();
    GOT.att = 1; const first = recordAtt(); const k = Object.keys(ATT)[0], a = Object.assign({}, ATT[k]);
    ATT_SIGNIN = srvNow(); const again = recordAtt();                                    // signs in again later (reload)
    const out = { before, first, again, late: a.late, inAgo: Math.round((Date.now() - a.in) / 60000), writes: writes.length, id: writes[0] && writes[0][0] };
    DBON = db0; GOT.att = g0; dbq = q0; ME = { role: 'manager', name: 'Jeff Bote' }; return out;
  });
  ok(r.before === false, 'the log-in is not written before the saved attendance has loaded (so it cannot replace an earlier log-in)');
  ok(r.first === true && r.inAgo === 10 && (r.late === 20 || r.late === 21), 'the log-in time is when the agent signed in (10 min ago → 20 min late for a shift that started 30 min ago) ' + JSON.stringify(r));
  ok(r.again === false && r.writes === 1 && /^att\//.test(r.id), 'signing in again later does not change the first log-in of the shift');

  ok(!errs.length, 'no browser errors ' + errs.join(' | '));
  await b.close();
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS'); process.exit(fails ? 1 : 0);
})();
