import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePokData,
  buildOverviewInsights,
  buildReconciliation,
  classifyStockStatus,
  extractPubHtmlTabs,
  parseBotInfoCsv,
  parseBranchInputCsv,
  parseCsv,
  parseFlexibleDateMs,
  parseMts2Csv,
  parsePokCsv,
  parseSmartNumber,
  parseTarikanCsv,
} from './sheetParser';

test('parseSmartNumber handles US, Indonesian, trailing dot, and error strings', () => {
  assert.equal(parseSmartNumber('1,199.00'), 1199);
  assert.equal(parseSmartNumber('25,000.00'), 25000);
  assert.equal(parseSmartNumber('180,75'), 180.75);
  assert.equal(parseSmartNumber('20,00'), 20);
  assert.equal(parseSmartNumber('1,000'), 1000);
  assert.equal(parseSmartNumber('258.'), 258);
  assert.equal(parseSmartNumber('1.234,50'), 1234.5);
  assert.equal(parseSmartNumber('4,5'), 4.5);
  assert.equal(parseSmartNumber('#N/A'), 0);
  assert.equal(parseSmartNumber(''), 0);
});

test('parseCsv handles multiline headers and escaped quotes', () => {
  const sample = `WH Group,Name,UOM,"Start \n Qty"\nSCM,"1"" PVC ELBOW",Pcs,"3,409.00"\n`;
  const rows = parseCsv(sample);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][3], 'Start \n Qty');
  assert.equal(rows[1][1], '1" PVC ELBOW');
  assert.equal(rows[1][3], '3,409.00');
});

test('extractPubHtmlTabs extracts tab names and gids', () => {
  const html = `
    items.push({name: "INPUT", pageUrl: "...", gid: "1579556932"});
    items.push({name: "INPUT RM", pageUrl: "...", gid: "1980828468"});
    items.push({name: "MTS2", pageUrl: "...", gid: "263347272"});
  `;
  const tabs = extractPubHtmlTabs(html);
  assert.deepEqual(tabs, {
    INPUT: '1579556932',
    'INPUT RM': '1980828468',
    MTS2: '263347272',
  });
});

test('parseBotInfoCsv and parseTarikanCsv extract Bot metadata & docs', () => {
  const infoCsv = `Last Updated (OUT1),2026-11-26 10:05:34 WIB\nTotal Rows (OUT1),8787\nSource,Data OUT Detail 2026-11-26`;
  const info = parseBotInfoCsv(infoCsv);
  assert.equal(info.lastUpdatedOut1, '2026-11-26 10:05:34 WIB');
  assert.equal(info.totalRowsOut1, 8787);
  assert.equal(info.sourceOut1, 'Data OUT Detail 2026-11-26');

  const tarikanCsv = [
    'Monitor Status Dokumen Outstanding Detail,,,,,',
    'Menu,Document Status,Created By,Documentno,Document Date,Area',
    'Customer Return,Draft,Terakhir Ditarik: 2026-11-26 03:05:34,MR/00004/XVIII,2018-01-26 00:00:00,Jakarta',
    'Material Movement,In Progress,Budi,MM/1001/XI/XXVI,2026-11-25 00:00:00,Surabaya',
  ].join('\n');
  const tarikan = parseTarikanCsv(tarikanCsv);
  assert.equal(tarikan.pulledAt, '2026-11-26 03:05:34');
  assert.equal(tarikan.docs.length, 2);
  assert.equal(tarikan.docs[0].area, 'Jakarta');
  assert.equal(tarikan.docs[1].status, 'In Progress');
});

test('parseBranchInputCsv + buildReconciliation calculates AWAL + IN - OUT vs MTS2 Last Qty', () => {
  const mts2Csv = [
    'Material Transaction Summary With MR & Shipment Internal (Raw Data),,,,,,,,,,,,,,,,,,,,,,,',
    'Periode :,26 Nov 2026   s/d   26 Nov 2026,,,,,,,,,,,,,,,,,,,,,,',
    'WH Group,WH Type,Terakhir Ditarik: 2026-11-26 02:59:58,Area,Locator,Parent Group,Classification,Search Key,Name,UOM,"Start \n Qty",MR External,MR Internal,CR+,MatTO+,Prod +,Ship Ext -,Ship Int -,VendRet -,MatFrom -,P-,Adj+,Internal Use,Last Qty',
    'SCM,21-RM ACC,PT,Jakarta,LIT-JKT C1,,2010,BB-PE-BENANG,BENANG,Roll,794,0,0,0,0,0,0,0,0,0,0,0,0,"1,300.00"',
    'SCM,21-RM ACC,PT,Jakarta,LIT-JKT C1,,2010,BB-PE-KAINLAP,KAIN LAP,Kg,100,0,0,0,0,0,0,0,0,0,0,0,0,50.00',
  ].join('\n');

  const parsedMts = parseMts2Csv(mts2Csv);
  assert.equal(parsedMts.pulledAt, '2026-11-26 02:59:58');
  assert.equal(parsedMts.items.length, 2);

  const jktCsv = [
    'Tanggal,Nama Bahan,Qty,UOM,I/O/A,Locator,Locator To,No. Document,Keterangan,Kode',
    '01-Nov-2026,BENANG,794.00,Roll,AWAL,LIT-JKT C1,LIT-JKT C1,,,BB-PE-BENANG',
    '10-Nov-2026,BENANG,300.00,Roll,OUT,LIT-JKT C1,PRO-JKT,MM/2,,BB-PE-BENANG',
    '05-Nov-2026,BENANG,816.00,Roll,IN,LIT-JKT C1,LIT-JKT C1,MM/1,,BB-PE-BENANG',
    '01-Nov-2026,CUTTER,10.00,Pack,AWAL,LIT-JKT C1,LIT-JKT C1,,,BB-PE-CUTTER',
  ].join('\n');

  const parsedJkt = parseBranchInputCsv(jktCsv, 'Jakarta', 'accessories', parsedMts.nameToCode);
  assert.equal(parsedJkt.aggregated.length, 2);

  const benang = parsedJkt.aggregated.find((x) => x.kode === 'BB-PE-BENANG');
  assert.ok(benang);
  assert.equal(benang.stokInput, 1310); // 794 + 816 - 300

  const { reconciliation, branchHealth } = buildReconciliation(
    [
      {
        branch: 'Jakarta',
        category: 'accessories',
        aggregated: parsedJkt.aggregated,
        transactions: parsedJkt.transactions,
        trackedLocators: parsedJkt.trackedLocators,
        available: true,
      },
    ],
    parsedMts.items,
    []
  );

  // Should contain 3 items: BENANG (1310 vs 1300 = +10), CUTTER (10 vs 0 = +10), KAINLAP (0 vs 50 = -50)
  assert.equal(reconciliation.length, 3);

  const recBenang = reconciliation.find((r) => r.kode === 'BB-PE-BENANG');
  assert.ok(recBenang);
  assert.equal(recBenang.stokInput, 1310);
  assert.equal(recBenang.stokSistem, 1300);
  assert.equal(recBenang.selisih, 10);
  assert.equal(recBenang.status, 'surplus_input');

  const recKain = reconciliation.find((r) => r.kode === 'BB-PE-KAINLAP');
  assert.ok(recKain);
  assert.equal(recKain.stokInput, 0);
  assert.equal(recKain.stokSistem, 50);
  assert.equal(recKain.selisih, -50);
  assert.equal(recKain.status, 'minus_input');

  const jktHealth = branchHealth.find((h) => h.branch === 'Jakarta');
  assert.ok(jktHealth);
  assert.equal(jktHealth.totalSku, 3);
  assert.equal(jktHealth.discrepancySku, 3);
  assert.equal(jktHealth.discrepancyAccessories, 3);
  assert.equal(jktHealth.discrepancyRawMaterial, 0);
  assert.equal(jktHealth.discrepancyManufacturing, 0);
  assert.equal(jktHealth.totalAbsSelisih, 70);
  assert.equal(recBenang.lastDate, '10-Nov-2026');
});

test('classifyStockStatus handles floating point tolerances', () => {
  assert.equal(classifyStockStatus(0.0001), 'sesuai');
  assert.equal(classifyStockStatus(-0.001), 'sesuai');
  assert.equal(classifyStockStatus(1.5), 'surplus_input');
  assert.equal(classifyStockStatus(-2.25), 'minus_input');
});

test('parsePokCsv and analyzePokData classify transit statuses, skip Sub Total, and compute insights', () => {
  const pokCsv = [
    'Locator,Search Key,Name,UOM,Start Qty,MR,CR+,MatTO+,Prod +,Ship -,VendRet -,MatFrom -,P-,Adj+,Last Qty,Move Qty,Selisih,No. Document,Cabang,Movement Date',
    'Sub Total,,"1"" PVC ELBOW",,0,0,0,5200,0,0,0,-29200,0,24000,0,0,0,Tidak Ditemukan,,Tidak Ditemukan',
    'PSN-KRW POK JKT,AC-S-100,"1"" STRAIGHT CONNECTION",Pcs,0,0,0,0,0,0,0,0,0,0,330,0,330,Tidak Ditemukan,Jakarta,Tidak Ditemukan',
    'PRM-KRW POK MDN,BB-BBK-BHN1,Bubuk Bahan 1,Kg,0,0,0,2500,0,0,0,0,0,0,2500,2000,500,MM/1007814/XI/XXVI/PRM,Medan,2026-11-19 00:00:00',
    'PRM-JKT POK MDN,AC-S-100,"1"" STRAIGHT CONNECTION",Pcs,0,2413,0,0,0,0,0,-2408,0,0,5,5,0,MM/1007915/XI/XXVI/PRM,Medan,2026-11-24 00:00:00',
    'PRS-JKT POK SMG,AC-S-100,"1"" STRAIGHT CONNECTION",Pcs,0,100,0,0,0,0,0,-100,0,0,0,0,0,Tidak Ditemukan,Semarang,Tidak Ditemukan',
  ].join('\n');

  const refNow = new Date('2026-11-26T00:00:00');
  const items = parsePokCsv(pokCsv, refNow);
  assert.equal(items.length, 4); // Sub Total skipped

  assert.equal(items[0].auditStatus, 'tanpa_dokumen');
  assert.equal(items[0].cabang, 'Jakarta');
  assert.equal(items[1].auditStatus, 'selisih_parsial');
  assert.equal(items[1].agingDays, 7);
  assert.equal(items[2].auditStatus, 'siap_terima');
  assert.equal(items[2].agingDays, 2);
  assert.equal(items[3].auditStatus, 'clear');

  const analysis = analyzePokData(items);
  assert.equal(analysis.totalActiveRows, 4);
  assert.equal(analysis.hangingSkuCount, 3);
  assert.equal(analysis.noDocCount, 1);
  assert.equal(analysis.partialMismatchCount, 1);
  assert.equal(analysis.readyToReceiveCount, 1);
  assert.equal(analysis.clearCount, 1);
  assert.equal(analysis.totalHangingQty, 2835);
  assert.equal(analysis.totalAbsSelisih, 830);
  assert.equal(analysis.agingBuckets.days7To14, 1);
  assert.equal(analysis.agingBuckets.under7Days, 1);
  assert.equal(analysis.agingBuckets.noDate, 1);
  assert.ok(analysis.topInsights.length >= 3);
});

test('excludes AMT-KRW, AMT-JKT, AMT-SMG from Accessories while keeping them in Raw Material and preventing cross-category duplicates', () => {
  const mts2Csv = [
    'Material Transaction Summary With MR & Shipment Internal (Raw Data),,,,,,,,,,,,,,,,,,,,,,,',
    'Periode :,26 Nov 2026   s/d   26 Nov 2026,,,,,,,,,,,,,,,,,,,,,,',
    'WH Group,WH Type,Terakhir Ditarik: 2026-11-26 02:59:58,Area,Locator,Parent Group,Classification,Search Key,Name,UOM,"Start \n Qty",MR External,MR Internal,CR+,MatTO+,Prod +,Ship Ext -,Ship Int -,VendRet -,MatFrom -,P-,Adj+,Internal Use,Last Qty',
    'SCM,90-SUPPLIES,PT,Karawang,AMT-KRW,,1010,BB-BJ-LLDPE,Biji LLDPE,Kg,500,0,0,0,0,0,0,0,0,0,0,0,0,500',
    'SCM,21-RM ACC,PT,Karawang,LIT-KRW C51,,2010,ACC-NUT,Hex Nut,Pcs,100,0,0,0,0,0,0,0,0,0,0,0,0,100',
    'SCM,30-WIP,PT,Pontianak,PRT-PTK,,1010,BB-BBK-BHN1,Bubuk Bahan 1,Kg,200,0,0,0,0,0,0,0,0,0,0,0,0,200',
  ].join('\n');
  const mts = parseMts2Csv(mts2Csv);

  const krwAccCsv = [
    'Tanggal,Nama Bahan,Qty,UOM,I/O/A,Locator,Locator To,No. Document,Keterangan,Kode',
    '25-Nov-26,Biji LLDPE,500,Kg,AWAL,AMT-KRW,AMT-KRW,,,BB-BJ-LLDPE',
    '25-Nov-26,Hex Nut,100,Pcs,AWAL,LIT-KRW C51,LIT-KRW C51,,,ACC-NUT',
  ].join('\n');
  const krwRmCsv = [
    'Tanggal,Nama Bahan,Qty,UOM,I/O/A,Locator,Locator To,No. Document,Keterangan,Kode',
    '25-Nov-26,Biji LLDPE,500,Kg,AWAL,AMT-KRW,AMT-KRW,,,Biji LLDPE',
  ].join('\n');
  const ptkAccCsv = [
    'Tanggal,Nama Bahan,Qty,UOM,I/O/A,Locator,Locator To,No. Document,Keterangan,Kode',
    '25-Nov-26,Baterai,5,Pcs,AWAL,PRT-PTK,PRT-PTK,,,EXP-BTR',
  ].join('\n');
  const ptkRmCsv = [
    'Tanggal,Nama Bahan,Qty,UOM,I/O/A,Locator,Locator To,No. Document,Keterangan,Kode',
    '25-Nov-26,Bubuk Bahan 1,200,Kg,AWAL,PRT-PTK,PRT-PTK,,,BB-BBK-BHN1',
  ].join('\n');

  const krwAcc = parseBranchInputCsv(krwAccCsv, 'Karawang', 'accessories', mts.nameToCode);
  const krwRm = parseBranchInputCsv(krwRmCsv, 'Karawang', 'raw_material', mts.nameToCode);
  const ptkAcc = parseBranchInputCsv(ptkAccCsv, 'Pontianak', 'accessories', mts.nameToCode);
  const ptkRm = parseBranchInputCsv(ptkRmCsv, 'Pontianak', 'raw_material', mts.nameToCode);

  assert.equal(krwAcc.trackedLocators.has('AMT-KRW'), false);
  assert.equal(krwAcc.aggregated.length, 1);
  assert.equal(krwRm.aggregated[0].kode, 'BB-BJ-LLDPE');

  const { reconciliation, branchHealth } = buildReconciliation(
    [
      { branch: 'Karawang', category: 'accessories', ...krwAcc, available: true },
      { branch: 'Karawang', category: 'raw_material', ...krwRm, available: true },
      { branch: 'Pontianak', category: 'accessories', ...ptkAcc, available: true },
      { branch: 'Pontianak', category: 'raw_material', ...ptkRm, available: true },
    ],
    mts.items,
    []
  );

  assert.equal(
    reconciliation.some((r) => r.category === 'accessories' && r.locator.startsWith('AMT-')),
    false
  );
  // PRT-PTK::BB-BBK-BHN1 must only appear once (in raw_material), not duplicated in accessories
  const bubukRows = reconciliation.filter((r) => r.kode === 'BB-BBK-BHN1');
  assert.equal(bubukRows.length, 1);
  assert.equal(bubukRows[0].category, 'raw_material');
  assert.equal(bubukRows[0].status, 'sesuai');

  assert.ok(parseFlexibleDateMs('25-Nov-26') > parseFlexibleDateMs('2-Jun-26'));
  assert.ok(parseFlexibleDateMs('25/11/26') === parseFlexibleDateMs('2026-11-25'));
  assert.ok(parseFlexibleDateMs('11/21/26') > parseFlexibleDateMs('11/12/26', true));

  const pkbCsv = [
    'Tanggal,Nama Bahan,Qty,UOM,I/O/A,Locator,Locator To,No. Document,Keterangan,Kode',
    '11/12/26,BENANG,10,Roll,AWAL,PRR-PKB C1,PRR-PKB C1,,,BB-PE-BENANG',
    '11/21/26,BENANG,5,Roll,IN,PRR-PKB C1,PRR-PKB C1,,,BB-PE-BENANG',
  ].join('\n');
  const pkbParsed = parseBranchInputCsv(pkbCsv, 'Pekanbaru', 'accessories');
  assert.equal(pkbParsed.aggregated[0].lastDate, '11/21/26');

  const insights = buildOverviewInsights(branchHealth, reconciliation, analyzePokData([]));
  assert.ok(insights.length >= 1);
});

