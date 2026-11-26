import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAiToolCall, type AiQueryableStore } from './aiTools';

const sampleStore: AiQueryableStore = {
  branchHealth: [
    {
      branch: 'Jakarta',
      hasAccessories: true,
      hasRawMaterial: true,
      hasManufacturing: false,
      totalSku: 3,
      matchedSku: 1,
      discrepancySku: 2,
      discrepancyAccessories: 1,
      discrepancyRawMaterial: 1,
      discrepancyManufacturing: 0,
      surplusSku: 1,
      minusSku: 1,
      totalInputQty: 15,
      totalSystemQty: 25,
      totalAbsSelisih: 12,
      txTotal: 4,
      outstandingDocsCount: 1,
      lastTxDate: '25/11/2026',
      locators: ['PRT-JKT', 'AMT-JKT'],
      fetchErrors: [],
    },
  ],
  reconciliation: [
    {
      id: 'jkt-acc-1',
      branch: 'Jakarta',
      category: 'accessories',
      locator: 'PRT-JKT',
      kode: 'SKU-01',
      namaBahan: 'Kertas Stiker',
      uom: 'PCS',
      awal: 10,
      masuk: 5,
      keluar: 0,
      stokInput: 15,
      stokSistem: 10,
      selisih: 5,
      absSelisih: 5,
      status: 'surplus_input',
      whType: 'PRT',
      whGroup: 'PRT',
      txCount: 2,
      lastDate: '25/11/2026',
    },
    {
      id: 'jkt-rm-1',
      branch: 'Jakarta',
      category: 'raw_material',
      locator: 'AMT-JKT',
      kode: 'RM-99',
      namaBahan: 'Aluminium Roll',
      uom: 'MTR',
      awal: 0,
      masuk: 0,
      keluar: 0,
      stokInput: 0,
      stokSistem: 15,
      selisih: -15,
      absSelisih: 15,
      status: 'minus_input',
      whType: 'AMT',
      whGroup: 'AMT',
      txCount: 0,
      lastDate: '',
    },
  ],
  pokItems: [
    {
      id: 'pok-1',
      locator: 'POK-JKT',
      searchKey: 'SKU-01',
      name: 'Kertas Stiker',
      uom: 'PCS',
      startQty: 10,
      mr: 0,
      crPlus: 0,
      matToPlus: 0,
      prodPlus: 0,
      shipMinus: 0,
      vendRetMinus: 0,
      matFromMinus: 0,
      pMinus: 0,
      adjPlus: 0,
      lastQty: 10,
      moveQty: 0,
      selisih: 10,
      absSelisih: 10,
      docNo: '',
      cabang: 'Jakarta',
      movementDate: '2026-11-01',
      auditStatus: 'tanpa_dokumen',
      agingDays: 24,
    },
  ],
  outstandingDocs: [
    {
      menu: 'Material Movement',
      status: 'Draft',
      createdBy: 'budi',
      docNo: 'MM-001',
      docDate: '2026-11-24',
      area: 'Jakarta',
    },
  ],
  transactions: [
    {
      branch: 'Jakarta',
      category: 'accessories',
      date: '25/11/2026',
      namaBahan: 'Kertas Stiker',
      qty: 5,
      uom: 'PCS',
      ioType: 'IN',
      locator: 'PRT-JKT',
      locatorTo: '',
      docNo: 'DOC-1',
      keterangan: 'Masuk',
      kode: 'SKU-01',
    },
  ],
};

test('query_reconciliation separates INPUT_ONLY vs MTS2_ONLY cleanly', () => {
  const inputOnly = executeAiToolCall(sampleStore, 'query_reconciliation', {
    source: 'INPUT_ONLY',
  });
  assert.equal(inputOnly.responsePayload.totalMatched, 1);
  assert.equal(inputOnly.dataset?.rows.length, 1);
  assert.equal(inputOnly.dataset?.rows[0].kode, 'SKU-01');

  const mts2Only = executeAiToolCall(sampleStore, 'query_reconciliation', {
    source: 'MTS2_ONLY',
  });
  assert.equal(mts2Only.responsePayload.totalMatched, 1);
  assert.equal(mts2Only.dataset?.rows[0].kode, 'RM-99');
});

test('query_branch_health separates inputted SKUs and MTS2-only SKUs', () => {
  const res = executeAiToolCall(sampleStore, 'query_branch_health', { branch: 'Jakarta' });
  const rows = res.responsePayload.rows as Array<Record<string, unknown>>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].inputSkuCount, 1);
  assert.equal(rows[0].mts2OnlySkuCount, 1);
  assert.equal(rows[0].totalSystemForInputQty, 10);
  assert.equal(rows[0].totalAbsMts2OnlySelisih, 15);
});

test('query_pok, query_outstanding_docs, and query_transactions return matching datasets', () => {
  const pokRes = executeAiToolCall(sampleStore, 'query_pok', {
    auditStatus: 'tanpa_dokumen',
    minAgingDays: 14,
  });
  assert.equal(pokRes.responsePayload.totalMatched, 1);
  assert.equal(pokRes.dataset?.kind, 'pok');

  const outRes = executeAiToolCall(sampleStore, 'query_outstanding_docs', {
    area: 'Jakarta',
    status: 'Draft',
  });
  assert.equal(outRes.responsePayload.totalMatched, 1);
  assert.equal(outRes.dataset?.kind, 'outstanding');

  const txRes = executeAiToolCall(sampleStore, 'query_transactions', {
    branch: 'Jakarta',
    ioType: 'IN',
  });
  assert.equal(txRes.responsePayload.totalMatched, 1);
  assert.equal(txRes.dataset?.kind, 'transactions');
});
