// SLA report (Nov 23): Reports › SLA report shows per-station duration for each case and a station summary, and downloads an
// Excel file with three sheets (SLA Summary, Per-Station Duration, Station Visits). ExcelJS is replaced by a small recorder
// so the test runs offline; it checks what goes into each sheet.
const { chromium } = require('playwright'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', 'web', 'im_logic.html')); await p.waitForTimeout(2500);
  await p.evaluate(() => {
    ME = { role: 'manager', name: 'Jeff Bote' }; applyMe(); document.getElementById('landing').style.display = 'none';
    const M = 60000, now = stnNow(), o = STAFF[0] ? STAFF[0].name : 'Jeff Bote';
    CASES.length = 0;
    // A: WFM 10 min (met), CARE 20 min (missed), PSE 40 min with 15 min Customer Hold (25 min → met), ARCH now for 5 min
    const a = mkCase('SLA-A', o, {}); a.recv = a.ts = now - 80 * M; a.station = 'ARCH'; a.stAt = now - 5 * M;
    a.stH = [{ s: 'WFM', a: now - 80 * M, e: now - 70 * M, sla: 15, met: true, by: 'Jeff Bote' }, { s: 'CARE', a: now - 70 * M, e: now - 50 * M, sla: 15, met: false, by: 'Jeff Bote' }, { s: 'PSE', a: now - 50 * M, e: now - 10 * M, p: 15 * M, sla: 30, met: true, by: 'Jeff Bote' }];
    // B: troubleshooting only, WFM → CARE → PSE → FULFILLMENT, closed after 60 min in FULFILLMENT
    const bb = mkCase('SLA-B', o, {}); bb.recv = bb.ts = now - 200 * M; bb.tso = true; bb.station = 'FULFILLMENT'; bb.stAt = now - 70 * M; bb.stEnd = now - 10 * M; bb.closed = true; bb.closedAt = now - 10 * M;
    bb.stH = [{ s: 'WFM', a: now - 200 * M, e: now - 190 * M, sla: 15, met: true }, { s: 'CARE', a: now - 190 * M, e: now - 180 * M, sla: 15, met: true }, { s: 'PSE', a: now - 180 * M, e: now - 70 * M, sla: 30, met: false }];
    const r = mkCase('SLA-C', o, {}); r.recv = r.ts = now - 12 * M; r.station = 'CARE'; r.stAt = now - 12 * M; CASES.push(a, bb, r); rptWeek(0); RPT.view = 'sla'; render(); openSettings(); setTabTo('reports');
  });
  await p.waitForTimeout(300);
  const ui = await p.evaluate(() => { const t = document.getElementById('settings').innerText; return { tab: /SLA report/.test(t), sum: /Station summary/.test(t), per: /Per-station duration/.test(t), btn: /Download SLA Excel Report/.test(t), txt: t }; });
  ok(ui.tab && ui.sum && ui.per && ui.btn, 'Reports has an SLA report tab with a station summary, per-station durations and a download button');
  ok(/00:10:00/.test(ui.txt) && /00:20:00/.test(ui.txt) && /00:25:00/.test(ui.txt), 'per-station durations show (WFM 10 min, CARE 20 min, PSE 25 min after the Customer Hold pause)');
  ok(/skipped/.test(ui.txt), 'stations skipped by a troubleshooting-only case show as skipped');
  const R = await p.evaluate(() => { const A = slaCase(getCase('SLA-A')), B = slaCase(getCase('SLA-B')), S = slaSum(CASES), C = slaCase(getCase('SLA-C')); return { c: C.per, cr: C.risk, a: A.per, at: A.tot, am: A.missed, b: B.per, bt: B.tot, s: { CARE: [S.CARE.n, S.CARE.met, S.CARE.miss], ARCH: [S.ARCH.now, S.ARCH.n], PSE: [S.PSE.n, S.PSE.met, S.PSE.miss], FUL: [S.FULFILLMENT.n, S.FULFILLMENT.miss], CARErisk: S.CARE.risk } }; });
  ok(R.a.WFM.d === 600 && R.a.CARE.d === 1200 && R.a.PSE.d === 1500 && Math.abs(R.a.ARCH.d - 300) <= 2, 'case A: seconds per station are right ' + JSON.stringify([R.a.WFM.d, R.a.CARE.d, R.a.PSE.d, R.a.ARCH.d]));
  ok(R.a.CARE.res === 'Missed' && R.a.WFM.res === 'Met' && R.a.ARCH.res === 'In progress' && !R.a.PET, 'case A: results per station (met / missed / in progress; stations not reached are blank)');
  ok(Math.abs(R.at - 3600) <= 2 && R.am === 1, 'case A: total station time and stations missed ' + R.at);
  ok(R.c.CARE.res === 'At risk to miss' && R.cr.on && /CARE 80% of SLA used · 00:03:00 left/.test(R.cr.txt), 'case C (12 of 15 min in CARE) is at risk to miss: ' + R.cr.txt);
  ok(!R.c.WFM, 'a case that started in CARE shows nothing for WFM (not skipped)');
  ok(R.s.CARErisk === 1 && /At risk to miss/.test(ui.txt) && /Yes · CARE 80%/.test(ui.txt), 'the screen shows an At risk to miss column in the summary and per case');
  ok(R.b.ARCH.res === 'Skipped (troubleshooting only)' && R.b.PET.res === 'Skipped (troubleshooting only)' && R.b['SUPPLY CHAIN'].n === 0, 'case B: ARCH, PET and SUPPLY CHAIN show as skipped (troubleshooting only)');
  ok(R.b.FULFILLMENT.d === 3600 && R.b.FULFILLMENT.res === 'Met' && R.b.PSE.res === 'Missed', 'case B: closed case keeps its last station time (clock stopped at close)');
  ok(JSON.stringify(R.s) === JSON.stringify({ CARE: [2, 1, 1], ARCH: [1, 0], PSE: [2, 1, 1], FUL: [1, 0], CARErisk: 1 }), 'station summary counts visits, met, missed and cases in a station now ' + JSON.stringify(R.s));
  // Excel export with a recording ExcelJS stand-in
  const X = await p.evaluate(async () => {
    const book = { sheets: [] };
    const imgs = [];
    window.ExcelJS = { Workbook: function () { this.addImage = o => { imgs.push(o); return imgs.length - 1; }; this.addWorksheet = (name, op) => { const cells = {}, cols = {}, ws = { name, op, cells, merges: [], pics: [], addImage: (id, at) => ws.pics.push([id, at]), getColumn: i => cols[i] || (cols[i] = {}), mergeCells: (...a) => ws.merges.push(a), getCell: (r, c) => cells[r + ',' + c] || (cells[r + ',' + c] = {}), getRow: r => ({ set height(v) {}, getCell: c => ws.getCell(r, c) }) }; book.sheets.push(ws); return ws; }; this.xlsx = { writeBuffer: async () => new ArrayBuffer(8) }; } };
    let saved = ''; const sb = saveBlob; saveBlob = (bl, n) => { saved = n; };
    await exportSla(); saveBlob = sb;
    const val = (ws, r, c) => (ws.cells[r + ',' + c] || {}).value, row = (ws, r) => { const o = []; for (let c = 1; c < 80 && ws.cells[r + ',' + c]; c++)o.push(ws.cells[r + ',' + c].value); return o; };
    const [vz, s1, s2, s3] = book.sheets;
    return { imgs: imgs.map(i => i.base64), pics: vz.pics.length, kpi: [1, 3, 5, 7, 9, 11].map(c => [val(vz, 4, c), val(vz, 5, c)]), total: row(s1, 12), risk: row(s1, 4).indexOf('At Risk to Miss'), tabs: book.sheets.map(s => s.op && s.op.properties && s.op.properties.tabColor && s.op.properties.tabColor.argb), carefill: (s1.cells['6,6'] || {}).fill, saved, names: book.sheets.map(s => s.name), s1h: row(s1, 4), care: row(s1, 6), s2h: row(s2, 4), a: row(s2, 6), b: row(s2, 5), fmt: (s2.cells['6,15'] || {}).numFmt, s3h: row(s3, 4), s3n: Object.keys(s3.cells).filter(k => k.endsWith(',1') && +k.split(',')[0] >= 5).length, s3last: row(s3, 5 + 7), s3c: row(s3, 5 + 8) };
  });
  ok(/^IM_SLA_Report_\d{4}-\d\d-\d\d_to_\d{4}-\d\d-\d\d\.xlsx$/.test(X.saved), 'Excel file downloads as IM_SLA_Report_<from>_to_<to>.xlsx (' + X.saved + ')');
  ok(JSON.stringify(X.names) === JSON.stringify(['Visual Summary', 'SLA Summary', 'Per-Station Duration', 'Station Visits']), 'four sheets: Visual Summary (first), SLA Summary, Per-Station Duration, Station Visits');
  ok(X.imgs.length === 5 && X.pics === 5 && X.imgs.every(u => /^data:image\/png;base64,/.test(u) && u.length > 8000), 'Visual Summary has 5 charts placed as PNG pictures ' + X.imgs.map(u => u.length).join(','));
  ok(JSON.stringify(X.kpi.map(k => k[0])) === JSON.stringify(['CASES', 'FINISHED VISITS', 'MET SLA', 'MISSED', 'AT RISK TO MISS', 'BREACHED NOW']) && X.kpi[0][1] === 3 && X.kpi[4][1] === 1, 'KPI tiles at the top of the Visual Summary ' + JSON.stringify(X.kpi));
  ok(X.tabs.every(Boolean) && X.carefill && X.carefill.fgColor.argb === 'FFFDE3E8', 'sheets are formatted: coloured tabs, missed counts shaded red');
  ok(X.total[0] === 'ALL STATIONS' && X.total[3] === 7 && X.total[11] === 1, 'summary sheet ends with an all-stations total row ' + JSON.stringify(X.total));
  ok(X.risk === 11, 'summary sheet has an At Risk to Miss column');
  require('fs').mkdirSync('/tmp/slacharts', { recursive: true }); X.imgs.forEach((u, i) => require('fs').writeFileSync('/tmp/slacharts/c' + i + '.png', Buffer.from(u.split(',')[1], 'base64')));
  ok(X.care[0] === 'CARE' && X.care[3] === 2 && X.care[4] === 1 && X.care[5] === 1 && X.care[6] === 0.5, 'summary sheet: CARE has 2 visits, 1 met, 1 missed, 50% ' + JSON.stringify(X.care));
  const hi = X.s2h.indexOf('WFM Duration'), pi = X.s2h.indexOf('PET SLA');
  ok(hi === 14 && X.s2h[10] === 'SLA Profile' && X.s2h[11] === 'At Risk to Miss' && X.a[10] === 'Standard' && X.s2h.includes('FULFILLMENT Duration') && X.s2h.includes('Total Station Time') && X.s2h.includes('Stations Missed'), 'per-station sheet has a duration and SLA column for every station, plus totals');
  ok(Math.abs(X.a[hi] * 86400 - 600) < 1 && X.fmt === '[h]:mm:ss', 'durations are real Excel times ([h]:mm:ss) so they can be added up');
  ok(X.b[pi] === 'Skipped (troubleshooting only)' && X.b[8] === 'Yes' && X.a[11] === 'No' && X.b[11] === '—', 'troubleshooting-only case shows the skipped stations in the sheet');
  ok(X.s3h.join('|') === 'Case #|Account Name|Owner|Station|Entered|Left|Duration|Paused (Customer Hold)|SLA (min)|Result|Moved By|SLA Profile' && X.s3n === 9, 'station visits sheet lists every visit (9 for the three cases) ' + X.s3n);
  ok(X.s3last[3] === 'ARCH' && X.s3last[5] === '(still in station)' && X.s3last[9] === 'In progress' && X.s3c[9] === 'At risk to miss', 'an open visit shows as still in station / in progress ' + JSON.stringify(X.s3last));
  const bf = await p.evaluate(() => { RPT.view = 'builder'; setTabTo('reports'); const t = document.getElementById('settings').innerText; return /PET Duration/.test(t) && /Total Station Time/.test(t) && /At Risk to Miss/.test(t); });
  ok(bf, 'report builder also offers a duration field per station and Total Station Time');
  await p.evaluate(() => { RPT.view = 'sla'; setTabTo('reports'); window.scrollTo(0, 0); });
  await p.screenshot({ path: '/home/claude/build/s15_sla.png', fullPage: false });
  ok(!errs.length, 'no browser errors ' + errs.join(' | '));
  await b.close();
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS'); process.exit(fails ? 1 : 0);
})();
