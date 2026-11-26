import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReconciliationCsv,
  filterReconciliation,
  formatNumber,
  formatSignedNumber,
  statusLabel,
} from './formatters';
import type { ReconciliationItem } from './types';

const sampleItems: ReconciliationItem[] = [
  {
    id: '1',
    branch: 'Jakarta',
    category: 'accessories',
    locator: 'AMT-JKT A2',
    kode: 'BB-PE-BENANG',
    namaBahan: 'BENANG',
    uom: 'Roll',
    awal: 794,
    masuk: 816,
    keluar: 300,
    stokInput: 1310,
    stokSistem: 1310,
    selisih: 0,
    absSelisih: 0,
    status: 'sesuai',
    whType: '21-RM ACC',
    whGroup: 'SCM',
    txCount: 3,
    lastDate: '25-Nov-2026',
  },
  {
    id: '2',
    branch: 'Surabaya',
    category: 'raw_material',
    locator: 'SBY-SBY A11',
    kode: 'BB-BBK-BHN1',
    namaBahan: 'Bubuk Bahan 1, Beige',
    uom: 'Kg',
    awal: 500,
    masuk: 100,
    keluar: 50,
    stokInput: 550,
    stokSistem: 500,
    selisih: 50,
    absSelisih: 50,
    status: 'surplus_input',
    whType: '30-WIP',
    whGroup: 'SCM',
    txCount: 4,
    lastDate: '25-Nov-2026',
  },
  {
    id: '3',
    branch: 'Surabaya',
    category: 'manufacturing',
    locator: 'SBY-SBY TIMBANG',
    kode: 'BB-BBK-HT',
    namaBahan: 'Bubuk Hitam',
    uom: 'Kg',
    awal: 100,
    masuk: 0,
    keluar: 20,
    stokInput: 80,
    stokSistem: 120,
    selisih: -40,
    absSelisih: 40,
    status: 'minus_input',
    whType: '30-WIP',
    whGroup: 'SCM',
    txCount: 2,
    lastDate: '25-Nov-2026',
  },
];

test('formatNumber and formatSignedNumber format cleanly', () => {
  assert.equal(formatNumber(1310), '1,310');
  assert.equal(formatNumber(180.75), '180.75');
  assert.equal(formatSignedNumber(50), '+50');
  assert.equal(formatSignedNumber(-40.25), '-40.25');
  assert.equal(formatSignedNumber(0), '0');
  assert.equal(statusLabel('surplus_input'), 'Surplus Input');
});

test('filterReconciliation filters by branch, category, status, and search query', () => {
  const sbyOnly = filterReconciliation(sampleItems, {
    branch: 'Surabaya',
    category: 'ALL',
    status: 'ALL',
    locator: 'ALL',
    search: '',
  });
  assert.equal(sbyOnly.length, 2);

  const discrepancies = filterReconciliation(sampleItems, {
    branch: 'ALL',
    category: 'ALL',
    status: 'DISCREPANCY',
    locator: 'ALL',
    search: '',
  });
  assert.equal(discrepancies.length, 2);

  const searchRes = filterReconciliation(sampleItems, {
    branch: 'ALL',
    category: 'ALL',
    status: 'ALL',
    locator: 'ALL',
    search: 'timbang',
  });
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].kode, 'BB-BBK-HT');
});

test('buildReconciliationCsv quotes commas and prepends UTF-8 BOM', () => {
  const csv = buildReconciliationCsv([sampleItems[1]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Bubuk Bahan 1, Beige"'));
  assert.ok(csv.includes('Surplus Input'));
});
