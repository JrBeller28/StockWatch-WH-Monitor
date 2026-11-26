import {
  ALL_BRANCHES,
  BRANCH_CONFIGS,
  isExcludedLocatorForCategory,
} from './sheetConfig';
import type {
  BranchAggregatedItem,
  BranchHealth,
  BranchName,
  BranchTransaction,
  CategoryType,
  Mts2Item,
  OutstandingDoc,
  PokAnalysisSummary,
  PokAuditStatus,
  PokBranchBreakdown,
  PokItem,
  ReconciliationItem,
  StockStatus,
} from './types';

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  mei: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  agu: 7,
  ags: 7,
  sep: 8,
  oct: 9,
  okt: 9,
  nov: 10,
  dec: 11,
  des: 11,
};

/**
 * Parses common Google Sheets date strings into epoch ms (-1 if unparseable):
 * - "18-Nov-2026", "25-Nov-26", "2-Jun-26", "19-Okt-26"
 * - "25/11/26", "25/11/2026" (DMY) or "11/21/26", "11/12/26" (MDY)
 * - "2026-11-25"
 */
export function parseFlexibleDateMs(
  raw: string | undefined | null,
  preferMdy = false
): number {
  if (!raw) return -1;
  const s = raw.trim();
  if (!s || s === '-' || s.toLowerCase() === 'tidak ditemukan') return -1;

  // YYYY-MM-DD (optionally with time)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const dt = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt) ? -1 : dt;
  }

  // DD-MMM-YYYY or DD-MMM-YY (or with spaces/slashes)
  const dmyText = /^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{2,4})$/.exec(s);
  if (dmyText) {
    const day = Number(dmyText[1]);
    const mon = MONTH_MAP[dmyText[2].slice(0, 3).toLowerCase()];
    let year = Number(dmyText[3]);
    if (year < 100) year += 2000;
    if (mon !== undefined && day >= 1 && day <= 31) {
      return Date.UTC(year, mon, day);
    }
  }

  // Numeric DD/MM/YY or MM/DD/YY (slash or hyphen)
  const num = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (num) {
    const p1 = Number(num[1]);
    const p2 = Number(num[2]);
    let year = Number(num[3]);
    if (year < 100) year += 2000;

    if (p2 > 12 && p1 >= 1 && p1 <= 12 && p2 <= 31) {
      return Date.UTC(year, p1 - 1, p2);
    }
    if (p1 > 12 && p2 >= 1 && p2 <= 12 && p1 <= 31) {
      return Date.UTC(year, p2 - 1, p1);
    }
    if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 12) {
      const dmyMs = Date.UTC(year, p2 - 1, p1);
      const mdyMs = Date.UTC(year, p1 - 1, p2);
      if (preferMdy) return mdyMs;
      // Avoid interpreting a past MDY date (e.g., 11/12/26 = Nov 12) as a future DMY date (Dec 11)
      const nowPlusBuffer = Date.now() + 2 * 86400_000;
      if (dmyMs > nowPlusBuffer && mdyMs <= nowPlusBuffer) return mdyMs;
      return dmyMs;
    }
  }

  const fallback = Date.parse(s);
  return Number.isNaN(fallback) ? -1 : fallback;
}

function pickLatestDate(current: string, candidate: string, preferMdy = false): string {
  const cand = candidate.trim();
  if (!cand) return current;
  const curr = current.trim();
  if (!curr) return cand;

  const currMs = parseFlexibleDateMs(curr, preferMdy);
  const candMs = parseFlexibleDateMs(cand, preferMdy);
  if (currMs >= 0 && candMs >= 0) {
    return candMs >= currMs ? cand : curr;
  }
  if (candMs >= 0 && currMs < 0) return cand;
  if (currMs >= 0 && candMs < 0) return curr;
  return cand;
}

/**
 * Parses numeric values from mixed Indonesian & US Google Sheets CSV formats:
 * - "1,199.00" -> 1199
 * - "25,000.00" -> 25000
 * - "180,75" -> 180.75
 * - "20,00" -> 20
 * - "1,000" -> 1000
 * - "258." -> 258
 * - "1.199,50" -> 1199.5
 * - "" / "#N/A" / "-" -> 0
 */
export function parseSmartNumber(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned || cleaned === '-' || cleaned.startsWith('#')) return 0;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  let normalized = cleaned;

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      // European / Indonesian format: 1.234,56
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = cleaned.split(',');
    const lastPart = parts[parts.length - 1];
    // If multiple commas (1,000,000) or exactly 3 trailing digits (1,000), treat comma as thousands
    if (parts.length > 2 || lastPart.length === 3) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      // Otherwise decimal comma (e.g., "180,75", "20,00", "4,5")
      normalized = cleaned.replace(',', '.');
    }
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * RFC 4180 CSV parser supporting embedded newlines, quotes, and escaped double quotes.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r') {
      if (i + 1 < len && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export function extractPubHtmlTabs(html: string): Record<string, string> {
  const tabs: Record<string, string> = {};
  const regex = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    tabs[match[1].trim()] = match[2].trim();
  }
  return tabs;
}

export function parseBotInfoCsv(csvText: string): {
  lastUpdatedOut1: string;
  totalRowsOut1: number;
  sourceOut1: string;
} {
  const rows = parseCsv(csvText);
  let lastUpdatedOut1 = '';
  let totalRowsOut1 = 0;
  let sourceOut1 = '';

  for (const row of rows) {
    const key = (row[0] ?? '').trim().toLowerCase();
    const val = (row[1] ?? '').trim();
    if (key.includes('last updated')) lastUpdatedOut1 = val;
    else if (key.includes('total rows')) totalRowsOut1 = Math.round(parseSmartNumber(val));
    else if (key.includes('source')) sourceOut1 = val;
  }

  return { lastUpdatedOut1, totalRowsOut1, sourceOut1 };
}

export function parseMts2Csv(csvText: string): {
  period: string;
  pulledAt: string;
  items: Mts2Item[];
  nameToCode: Map<string, string>;
} {
  const rows = parseCsv(csvText);
  let period = '';
  let pulledAt = '';
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if ((row[0] ?? '').toLowerCase().includes('periode')) {
      period = (row[1] ?? '').trim();
    }
    for (const cell of row) {
      if (cell.includes('Terakhir Ditarik:')) {
        pulledAt = cell.replace('Terakhir Ditarik:', '').trim();
      }
    }
    if ((row[0] ?? '').trim() === 'WH Group' && (row[1] ?? '').trim() === 'WH Type') {
      headerRowIdx = i;
    }
  }

  const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 3;
  const items: Mts2Item[] = [];
  const nameToCode = new Map<string, string>();

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 24) continue;
    const searchKey = (r[7] ?? '').trim();
    const locator = (r[4] ?? '').trim();
    const name = (r[8] ?? '').trim();
    if (!searchKey || !locator) continue;

    const item: Mts2Item = {
      whGroup: (r[0] ?? '').trim(),
      whType: (r[1] ?? '').trim(),
      area: (r[3] ?? '').trim(),
      locator,
      parentGroup: (r[5] ?? '').trim(),
      classification: (r[6] ?? '').trim(),
      searchKey,
      name,
      uom: (r[9] ?? '').trim(),
      startQty: parseSmartNumber(r[10]),
      mrExternal: parseSmartNumber(r[11]),
      mrInternal: parseSmartNumber(r[12]),
      prodPlus: parseSmartNumber(r[15]),
      shipExtMinus: parseSmartNumber(r[16]),
      shipIntMinus: parseSmartNumber(r[17]),
      adjPlus: parseSmartNumber(r[21]),
      internalUse: parseSmartNumber(r[22]),
      lastQty: parseSmartNumber(r[23]),
    };

    items.push(item);

    if (name && !nameToCode.has(name.toUpperCase())) {
      nameToCode.set(name.toUpperCase(), searchKey);
    }
  }

  return { period, pulledAt, items, nameToCode };
}

export function parseTarikanCsv(csvText: string): {
  pulledAt: string;
  docs: OutstandingDoc[];
} {
  const rows = parseCsv(csvText);
  let pulledAt = '';
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = rows[i];
    if ((r[0] ?? '').trim() === 'Menu' && (r[1] ?? '').trim() === 'Document Status') {
      headerRowIdx = i;
      break;
    }
  }

  const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 2;
  const docs: OutstandingDoc[] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 5) continue;
    const menu = (r[0] ?? '').trim();
    const status = (r[1] ?? '').trim();
    let createdBy = (r[2] ?? '').trim();
    const docNo = (r[3] ?? '').trim();
    const docDate = (r[4] ?? '').trim();
    const area = (r[5] ?? '').trim();

    if (createdBy.includes('Terakhir Ditarik:')) {
      if (!pulledAt) {
        pulledAt = createdBy.replace('Terakhir Ditarik:', '').trim();
      }
      createdBy = 'System / Draft';
    }

    if (!menu && !docNo) continue;

    docs.push({
      menu,
      status,
      createdBy,
      docNo,
      docDate,
      area: area || 'Pusat / Tidak Terpetakan',
    });
  }

  return { pulledAt, docs };
}

function normalizeIoType(raw: string): 'AWAL' | 'IN' | 'OUT' | null {
  const val = raw.trim().toUpperCase();
  if (val === 'AWAL' || val === 'SA' || val === 'A') return 'AWAL';
  if (val === 'IN' || val === 'I') return 'IN';
  if (val === 'OUT' || val === 'O') return 'OUT';
  return null;
}

function isValidCode(raw: string, namaBahan?: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === '0' || trimmed.startsWith('#')) return false;
  if (namaBahan && trimmed.toUpperCase() === namaBahan.trim().toUpperCase()) {
    return false;
  }
  return true;
}

export function parseBranchInputCsv(
  csvText: string,
  branch: BranchName,
  category: CategoryType,
  globalNameToCode?: Map<string, string>
): {
  aggregated: BranchAggregatedItem[];
  transactions: BranchTransaction[];
  trackedLocators: Set<string>;
} {
  const rows = parseCsv(csvText);
  const localNameToCode = new Map<string, string>();
  let mdyEvidence = 0;
  let dmyEvidence = 0;

  // First pass: learn local Nama Bahan -> Kode mappings & detect numeric date locale (MDY vs DMY)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 6) continue;
    const rawDate = (r[0] ?? '').trim();
    const numDate = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(rawDate);
    if (numDate) {
      const p1 = Number(numDate[1]);
      const p2 = Number(numDate[2]);
      if (p2 > 12 && p1 <= 12) mdyEvidence++;
      else if (p1 > 12 && p2 <= 12) dmyEvidence++;
    }
    if (r.length < 10) continue;
    const locator = (r[5] ?? '').trim();
    if (locator && isExcludedLocatorForCategory(locator, category)) continue;
    const nama = (r[1] ?? '').trim();
    const kode = (r[9] ?? '').trim();
    if (nama && isValidCode(kode, nama) && !localNameToCode.has(nama.toUpperCase())) {
      localNameToCode.set(nama.toUpperCase(), kode);
    }
  }

  const preferMdy = mdyEvidence > dmyEvidence;
  const aggMap = new Map<string, BranchAggregatedItem>();
  const transactions: BranchTransaction[] = [];
  const trackedLocators = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 6) continue;

    const ioType = normalizeIoType(r[4] ?? '');
    if (!ioType) continue;

    const date = (r[0] ?? '').trim();
    const namaBahan = (r[1] ?? '').trim();
    const qty = parseSmartNumber(r[2]);
    const uomRaw = (r[3] ?? '').trim();
    const uom = uomRaw === '0' || uomRaw.startsWith('#') ? '' : uomRaw;
    const locator = (r[5] ?? '').trim();
    const locatorTo = (r[6] ?? '').trim();
    const docNo = (r[7] ?? '').trim();
    const keterangan = (r[8] ?? '').trim();
    const rawKode = (r[9] ?? '').trim();
    let kode = rawKode;

    if (!locator || isExcludedLocatorForCategory(locator, category)) continue;

    if (!isValidCode(kode, namaBahan)) {
      const upperName = namaBahan.toUpperCase();
      kode =
        localNameToCode.get(upperName) ??
        globalNameToCode?.get(upperName) ??
        (isValidCode(rawKode) ? rawKode : namaBahan ? `NAME:${upperName}` : '');
    }

    if (!kode) continue;

    trackedLocators.add(locator);

    transactions.push({
      branch,
      category,
      date,
      namaBahan,
      qty,
      uom,
      ioType,
      locator,
      locatorTo,
      docNo,
      keterangan,
      kode,
    });

    const key = `${locator.toUpperCase()}::${kode.toUpperCase()}`;
    let existing = aggMap.get(key);
    if (!existing) {
      existing = {
        branch,
        category,
        locator,
        kode,
        namaBahan,
        uom,
        awal: 0,
        masuk: 0,
        keluar: 0,
        stokInput: 0,
        txCount: 0,
        lastDate: date,
      };
      aggMap.set(key, existing);
    }

    if (!existing.namaBahan && namaBahan) existing.namaBahan = namaBahan;
    if (!existing.uom && uom) existing.uom = uom;
    if (date) existing.lastDate = pickLatestDate(existing.lastDate, date, preferMdy);
    existing.txCount += 1;

    if (ioType === 'AWAL') existing.awal = round2(existing.awal + qty);
    else if (ioType === 'IN') existing.masuk = round2(existing.masuk + qty);
    else if (ioType === 'OUT') existing.keluar = round2(existing.keluar + qty);
  }

  for (const item of aggMap.values()) {
    item.stokInput = round2(item.awal + item.masuk - item.keluar);
  }

  return {
    aggregated: Array.from(aggMap.values()),
    transactions,
    trackedLocators,
  };
}

export function classifyStockStatus(selisih: number): StockStatus {
  if (Math.abs(selisih) < 0.01) return 'sesuai';
  return selisih > 0 ? 'surplus_input' : 'minus_input';
}

export interface BranchCategoryInputResult {
  branch: BranchName;
  category: CategoryType;
  aggregated: BranchAggregatedItem[];
  transactions: BranchTransaction[];
  trackedLocators: Set<string>;
  available: boolean;
  error?: string;
}

export function buildReconciliation(
  branchResults: BranchCategoryInputResult[],
  mts2Items: Mts2Item[],
  outstandingDocs: OutstandingDoc[]
): {
  reconciliation: ReconciliationItem[];
  branchHealth: BranchHealth[];
} {
  // Index MTS2 by (locator, searchKey) — aggregate if multiple rows share same locator+searchKey
  const mtsByLocKey = new Map<
    string,
    {
      area: string;
      locator: string;
      searchKey: string;
      name: string;
      uom: string;
      whType: string;
      whGroup: string;
      lastQty: number;
    }
  >();

  // Track which branch + category owns each locator so MTS2 items missing from branch sheet are surfaced without double-counting across categories
  const locatorBranches = new Map<
    string,
    { branch: BranchName; categories: Map<CategoryType, number> }
  >();

  for (const res of branchResults) {
    const countsByLoc = new Map<string, number>();
    for (const item of res.aggregated) {
      const upperLoc = item.locator.toUpperCase();
      countsByLoc.set(upperLoc, (countsByLoc.get(upperLoc) ?? 0) + 1);
    }

    for (const loc of res.trackedLocators) {
      if (isExcludedLocatorForCategory(loc, res.category)) continue;
      const upperLoc = loc.toUpperCase();
      let entry = locatorBranches.get(upperLoc);
      if (!entry) {
        entry = { branch: res.branch, categories: new Map<CategoryType, number>() };
        locatorBranches.set(upperLoc, entry);
      }
      if (entry.branch === res.branch) {
        entry.categories.set(res.category, countsByLoc.get(upperLoc) ?? 0);
      }
    }
  }

  for (const m of mts2Items) {
    const lk = `${m.locator.toUpperCase()}::${m.searchKey.toUpperCase()}`;
    const existing = mtsByLocKey.get(lk);
    if (existing) {
      existing.lastQty = round2(existing.lastQty + m.lastQty);
    } else {
      mtsByLocKey.set(lk, {
        area: m.area,
        locator: m.locator,
        searchKey: m.searchKey,
        name: m.name,
        uom: m.uom,
        whType: m.whType,
        whGroup: m.whGroup,
        lastQty: round2(m.lastQty),
      });
    }
  }

  const reconciliation: ReconciliationItem[] = [];
  // Track (branch, locator, kode) across ALL categories so shared locators never emit duplicate MTS2-only rows
  const seenBranchLocKey = new Set<string>();

  // 1. All items from Branch Input sheets matched against MTS2
  for (const res of branchResults) {
    for (const item of res.aggregated) {
      if (isExcludedLocatorForCategory(item.locator, res.category)) continue;
      const lk = `${item.locator.toUpperCase()}::${item.kode.toUpperCase()}`;
      const uniq = `${res.branch}::${res.category}::${lk}`;
      seenBranchLocKey.add(`${res.branch}::${lk}`);

      const mts = mtsByLocKey.get(lk);
      const stokSistem = mts ? mts.lastQty : 0;
      const selisih = round2(item.stokInput - stokSistem);
      const absSelisih = round2(Math.abs(selisih));

      reconciliation.push({
        id: uniq,
        branch: res.branch,
        category: res.category,
        locator: item.locator,
        kode: item.kode,
        namaBahan: item.namaBahan || mts?.name || item.kode,
        uom: item.uom || mts?.uom || '',
        awal: item.awal,
        masuk: item.masuk,
        keluar: item.keluar,
        stokInput: item.stokInput,
        stokSistem,
        selisih,
        absSelisih,
        status: classifyStockStatus(selisih),
        whType: mts?.whType || 'Belum Terpetakan di MTS2',
        whGroup: mts?.whGroup || '',
        txCount: item.txCount,
        lastDate: item.lastDate,
      });
    }
  }

  const pickCategoryForUnmatchedMts = (
    mts: { locator: string; searchKey: string; whType: string },
    categories: Map<CategoryType, number>
  ): CategoryType | null => {
    const validEntries = Array.from(categories.entries()).filter(
      ([cat]) => !isExcludedLocatorForCategory(mts.locator, cat)
    );
    if (validEntries.length === 0) return null;
    if (validEntries.length === 1) return validEntries[0][0];

    const upperKey = mts.searchKey.toUpperCase();
    const upperWh = mts.whType.toUpperCase();
    const upperLoc = mts.locator.toUpperCase();

    if (upperLoc.includes('TIMBANG') && categories.has('manufacturing')) {
      return 'manufacturing';
    }
    if (
      categories.has('raw_material') &&
      (upperKey.startsWith('BB-BBK') ||
        upperKey.startsWith('BB-BJ') ||
        upperKey.startsWith('BB-MASTER') ||
        upperWh.includes('WIP'))
    ) {
      return 'raw_material';
    }

    const priority: Record<CategoryType, number> = {
      raw_material: 3,
      manufacturing: 2,
      accessories: 1,
    };
    validEntries.sort((a, b) => b[1] - a[1] || priority[b[0]] - priority[a[0]]);
    return validEntries[0][0];
  };

  // 2. Items present in MTS2 on a locator tracked by a branch, with non-zero Last Qty, missing from all branch sheets
  for (const [lk, mts] of mtsByLocKey.entries()) {
    const owner = locatorBranches.get(mts.locator.toUpperCase());
    if (!owner) continue;
    if (seenBranchLocKey.has(`${owner.branch}::${lk}`)) continue;
    if (Math.abs(mts.lastQty) < 0.01) continue;

    const targetCategory = pickCategoryForUnmatchedMts(mts, owner.categories);
    if (!targetCategory) continue;

    const uniq = `${owner.branch}::${targetCategory}::${lk}`;
    seenBranchLocKey.add(`${owner.branch}::${lk}`);

    const selisih = round2(0 - mts.lastQty);
    reconciliation.push({
      id: uniq,
      branch: owner.branch,
      category: targetCategory,
      locator: mts.locator,
      kode: mts.searchKey,
      namaBahan: mts.name || mts.searchKey,
      uom: mts.uom,
      awal: 0,
      masuk: 0,
      keluar: 0,
      stokInput: 0,
      stokSistem: mts.lastQty,
      selisih,
      absSelisih: round2(Math.abs(selisih)),
      status: classifyStockStatus(selisih),
      whType: mts.whType,
      whGroup: mts.whGroup,
      txCount: 0,
      lastDate: '',
    });
  }

  // Sort largest discrepancy first, then branch/kode
  reconciliation.sort((a, b) => {
    if (b.absSelisih !== a.absSelisih) return b.absSelisih - a.absSelisih;
    return a.branch.localeCompare(b.branch) || a.kode.localeCompare(b.kode);
  });

  // Build per-branch health summary
  const outstandingByArea = new Map<string, number>();
  for (const doc of outstandingDocs) {
    const areaKey = doc.area.trim().toLowerCase();
    outstandingByArea.set(areaKey, (outstandingByArea.get(areaKey) ?? 0) + 1);
  }

  const branchHealth: BranchHealth[] = ALL_BRANCHES.map((branch) => {
    const cfg = BRANCH_CONFIGS.find((b) => b.branch === branch);
    const branchRes = branchResults.filter((r) => r.branch === branch);
    const items = reconciliation.filter((r) => r.branch === branch);

    let matchedSku = 0;
    let discrepancySku = 0;
    let discrepancyAccessories = 0;
    let discrepancyRawMaterial = 0;
    let discrepancyManufacturing = 0;
    let surplusSku = 0;
    let minusSku = 0;
    let totalInputQty = 0;
    let totalSystemQty = 0;
    let totalAbsSelisih = 0;

    for (const item of items) {
      if (item.status === 'sesuai') matchedSku++;
      else {
        discrepancySku++;
        if (item.category === 'accessories') discrepancyAccessories++;
        else if (item.category === 'raw_material') discrepancyRawMaterial++;
        else if (item.category === 'manufacturing') discrepancyManufacturing++;

        if (item.status === 'surplus_input') surplusSku++;
        else minusSku++;
      }
      totalInputQty = round2(totalInputQty + item.stokInput);
      totalSystemQty = round2(totalSystemQty + item.stokSistem);
      totalAbsSelisih = round2(totalAbsSelisih + item.absSelisih);
    }

    const locators = Array.from(
      new Set(branchRes.flatMap((r) => Array.from(r.trackedLocators)))
    ).sort();

    const txTotal = branchRes.reduce((sum, r) => sum + r.transactions.length, 0);
    let lastTxDate = '';
    for (const r of branchRes) {
      for (const a of r.aggregated) {
        if (a.lastDate) lastTxDate = pickLatestDate(lastTxDate, a.lastDate);
      }
    }

    const fetchErrors = branchRes.filter((r) => r.error).map((r) => r.error as string);

    const acc = branchRes.find((r) => r.category === 'accessories');
    const rm = branchRes.find((r) => r.category === 'raw_material');
    const mfg = branchRes.find((r) => r.category === 'manufacturing');

    return {
      branch,
      hasAccessories: Boolean(acc && acc.available && (acc.transactions.length > 0 || cfg?.fallbackGids.INPUT)),
      hasRawMaterial: Boolean(rm && rm.available && rm.transactions.length > 0),
      hasManufacturing: Boolean(mfg && mfg.available && mfg.transactions.length > 0),
      totalSku: items.length,
      matchedSku,
      discrepancySku,
      discrepancyAccessories,
      discrepancyRawMaterial,
      discrepancyManufacturing,
      surplusSku,
      minusSku,
      totalInputQty,
      totalSystemQty,
      totalAbsSelisih,
      txTotal,
      outstandingDocsCount: outstandingByArea.get(branch.toLowerCase()) ?? 0,
      lastTxDate,
      locators,
      fetchErrors,
    };
  });

  return { reconciliation, branchHealth };
}

export function classifyPokAuditStatus(
  lastQty: number,
  selisih: number,
  docNo: string
): PokAuditStatus {
  const hasStock = Math.abs(lastQty) >= 0.01;
  const hasMismatch = Math.abs(selisih) >= 0.01;
  const normalizedDoc = docNo.trim();
  const hasDoc =
    normalizedDoc.length > 0 &&
    normalizedDoc.toLowerCase() !== 'tidak ditemukan';

  if (!hasStock && !hasMismatch) return 'clear';
  if (hasStock && !hasDoc) return 'tanpa_dokumen';
  if (hasMismatch) return 'selisih_parsial';
  return 'siap_terima';
}

function computeAgingDays(movementDate: string, referenceNow: Date): number | null {
  const raw = movementDate.trim();
  if (!raw || raw.toLowerCase() === 'tidak ditemukan') return null;
  const parsed = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = referenceNow.getTime() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function parsePokCsv(
  csvText: string,
  referenceNow: Date = new Date()
): PokItem[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const items: PokItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 18) continue;

    const locator = (r[0] ?? '').trim();
    const searchKey = (r[1] ?? '').trim();
    if (!locator || locator.toLowerCase() === 'sub total' || !searchKey) continue;

    const name = (r[2] ?? '').trim();
    const uom = (r[3] ?? '').trim();
    const startQty = parseSmartNumber(r[4]);
    const mr = parseSmartNumber(r[5]);
    const crPlus = parseSmartNumber(r[6]);
    const matToPlus = parseSmartNumber(r[7]);
    const prodPlus = parseSmartNumber(r[8]);
    const shipMinus = parseSmartNumber(r[9]);
    const vendRetMinus = parseSmartNumber(r[10]);
    const matFromMinus = parseSmartNumber(r[11]);
    const pMinus = parseSmartNumber(r[12]);
    const adjPlus = parseSmartNumber(r[13]);
    const lastQty = round2(parseSmartNumber(r[14]));
    const moveQty = round2(parseSmartNumber(r[15]));
    const rawSelisih = (r[16] ?? '').trim();
    const selisih = rawSelisih
      ? round2(parseSmartNumber(rawSelisih))
      : round2(lastQty - moveQty);
    const docNo = (r[17] ?? '').trim() || 'Tidak Ditemukan';
    const cabang = (r[18] ?? '').trim() || 'Tidak Terpetakan';
    const movementDate = (r[19] ?? '').trim() || 'Tidak Ditemukan';

    const auditStatus = classifyPokAuditStatus(lastQty, selisih, docNo);
    const agingDays = computeAgingDays(movementDate, referenceNow);

    items.push({
      id: `${locator}::${searchKey}::${i}`,
      locator,
      searchKey,
      name: name || searchKey,
      uom,
      startQty,
      mr,
      crPlus,
      matToPlus,
      prodPlus,
      shipMinus,
      vendRetMinus,
      matFromMinus,
      pMinus,
      adjPlus,
      lastQty,
      moveQty,
      selisih,
      absSelisih: round2(Math.abs(selisih)),
      docNo,
      cabang,
      movementDate,
      auditStatus,
      agingDays,
    });
  }

  // Sort critical/mismatched items first, then largest Last Qty
  const rank: Record<PokAuditStatus, number> = {
    tanpa_dokumen: 0,
    selisih_parsial: 1,
    siap_terima: 2,
    clear: 3,
  };

  items.sort((a, b) => {
    if (rank[a.auditStatus] !== rank[b.auditStatus]) {
      return rank[a.auditStatus] - rank[b.auditStatus];
    }
    if (b.absSelisih !== a.absSelisih) return b.absSelisih - a.absSelisih;
    return Math.abs(b.lastQty) - Math.abs(a.lastQty);
  });

  return items;
}

export function analyzePokData(items: PokItem[]): PokAnalysisSummary {
  let hangingSkuCount = 0;
  let noDocCount = 0;
  let partialMismatchCount = 0;
  let readyToReceiveCount = 0;
  let clearCount = 0;
  let totalHangingQty = 0;
  let totalAbsSelisih = 0;

  const agingBuckets = {
    over14Days: 0,
    days7To14: 0,
    under7Days: 0,
    noDate: 0,
  };

  const branchMap = new Map<string, PokBranchBreakdown>();

  for (const item of items) {
    if (item.auditStatus === 'clear') {
      clearCount++;
      continue;
    }

    if (Math.abs(item.lastQty) >= 0.01) {
      hangingSkuCount++;
      totalHangingQty = round2(totalHangingQty + item.lastQty);
    }
    totalAbsSelisih = round2(totalAbsSelisih + item.absSelisih);

    if (item.auditStatus === 'tanpa_dokumen') noDocCount++;
    else if (item.auditStatus === 'selisih_parsial') partialMismatchCount++;
    else if (item.auditStatus === 'siap_terima') readyToReceiveCount++;

    if (item.agingDays === null) agingBuckets.noDate++;
    else if (item.agingDays > 14) agingBuckets.over14Days++;
    else if (item.agingDays >= 7) agingBuckets.days7To14++;
    else agingBuckets.under7Days++;

    let br = branchMap.get(item.cabang);
    if (!br) {
      br = {
        cabang: item.cabang,
        hangingCount: 0,
        noDocCount: 0,
        partialCount: 0,
        readyCount: 0,
        totalLastQty: 0,
        totalAbsSelisih: 0,
      };
      branchMap.set(item.cabang, br);
    }

    if (Math.abs(item.lastQty) >= 0.01) br.hangingCount++;
    if (item.auditStatus === 'tanpa_dokumen') br.noDocCount++;
    else if (item.auditStatus === 'selisih_parsial') br.partialCount++;
    else if (item.auditStatus === 'siap_terima') br.readyCount++;

    br.totalLastQty = round2(br.totalLastQty + item.lastQty);
    br.totalAbsSelisih = round2(br.totalAbsSelisih + item.absSelisih);
  }

  const byBranch = Array.from(branchMap.values()).sort(
    (a, b) => b.totalAbsSelisih - a.totalAbsSelisih || b.hangingCount - a.hangingCount
  );

  const topInsights: string[] = [];
  if (hangingSkuCount === 0) {
    topInsights.push('Tidak ada stok POK menggantung pada cakupan cabang ini (seluruh saldo POK nol).');
  } else {
    topInsights.push(
      `Terdapat ${hangingSkuCount} item POK menggantung dengan total saldo ${totalHangingQty.toLocaleString('en-US')} unit yang belum tuntas proses penerimaan.`
    );
    if (noDocCount > 0) {
      topInsights.push(
        `${noDocCount} item memiliki stok menggantung tanpa dokumen Material Movement (MM) — perlu verifikasi segera apakah fisik sudah terkirim atau terjadi salah locator.`
      );
    }
    if (partialMismatchCount > 0) {
      topInsights.push(
        `${partialMismatchCount} item memiliki selisih antara Last Qty POK dan Move Qty dokumen MM (indikasi pengiriman parsial atau dokumen belum lengkap).`
      );
    }
    if (readyToReceiveCount > 0) {
      topInsights.push(
        `${readyToReceiveCount} item sudah memiliki dokumen MM yang cocok dengan Last Qty dan siap diselesaikan penerimaannya di cabang tujuan.`
      );
    }
    if (byBranch.length > 1) {
      const topBr = byBranch[0];
      topInsights.push(
        `Cabang dengan beban selisih POK tertinggi saat ini adalah ${topBr.cabang} (${topBr.hangingCount} item menggantung, total selisih ${topBr.totalAbsSelisih.toLocaleString('en-US')}).`
      );
    }
    if (agingBuckets.over14Days > 0) {
      topInsights.push(
        `${agingBuckets.over14Days} item transit POK telah berusia lebih dari 14 hari sejak Movement Date dan berisiko menjadi stok macet.`
      );
    }
  }

  return {
    totalActiveRows: items.length,
    hangingSkuCount,
    noDocCount,
    partialMismatchCount,
    readyToReceiveCount,
    clearCount,
    totalHangingQty,
    totalAbsSelisih,
    agingBuckets,
    byBranch,
    topInsights,
  };
}

export function buildOverviewInsights(
  branchHealth: BranchHealth[],
  reconciliation: ReconciliationItem[],
  pokSummary: PokAnalysisSummary
): string[] {
  const insights: string[] = [];
  const mismatchItems = reconciliation.filter((r) => r.status !== 'sesuai');

  if (mismatchItems.length === 0) {
    insights.push(
      'Seluruh stok inputan cabang pada cakupan ini sudah sinkron 100% dengan Last Qty Bot MTS2.'
    );
  } else {
    if (branchHealth.length > 1) {
      const inputStats = new Map<
        string,
        { acc: number; rm: number; mfg: number; total: number; abs: number }
      >();
      for (const r of mismatchItems) {
        if (r.txCount === 0) continue;
        const cur = inputStats.get(r.branch) ?? {
          acc: 0,
          rm: 0,
          mfg: 0,
          total: 0,
          abs: 0,
        };
        cur.total += 1;
        cur.abs += r.absSelisih;
        if (r.category === 'accessories') cur.acc += 1;
        else if (r.category === 'raw_material') cur.rm += 1;
        else cur.mfg += 1;
        inputStats.set(r.branch, cur);
      }

      const topEntry = Array.from(inputStats.entries()).sort(
        (a, b) => b[1].abs - a[1].abs
      )[0];
      if (topEntry && topEntry[1].total > 0) {
        const [branchName, st] = topEntry;
        insights.push(
          `Cabang dengan ketimpangan inputan tertinggi adalah ${branchName} (${st.total} SKU selisih: Acc ${st.acc}, RM ${st.rm}, MFG ${st.mfg}; selisih abs ${round2(st.abs).toLocaleString('en-US')}).`
        );
      }
    }

    const mts2Only = mismatchItems.filter((r) => r.txCount === 0);
    if (mts2Only.length > 0) {
      const vol = round2(mts2Only.reduce((s, r) => s + r.absSelisih, 0));
      insights.push(
        `${mts2Only.length} SKU tercatat di Bot MTS2 (total ${vol.toLocaleString('en-US')} unit) namun belum pernah diinput di sheet cabang — kemungkinan saldo awal/masuk belum dicatat atau locator berbeda.`
      );
    }

    const unmappedInput = mismatchItems.filter(
      (r) =>
        r.txCount > 0 &&
        (r.whType === 'Belum Terpetakan di MTS2' || r.kode.startsWith('NAME:'))
    );
    if (unmappedInput.length > 0) {
      insights.push(
        `${unmappedInput.length} SKU yang diinput cabang belum cocok dengan Search Key Bot MTS2 (kode kosong, tertulis nama bahan, atau selisih penulisan kode) — periksa kolom Kode pada sheet cabang.`
      );
    }
  }

  if (pokSummary.noDocCount > 0 || pokSummary.agingBuckets.over14Days > 0) {
    insights.push(
      `Audit Update MTS POK mendeteksi ${pokSummary.hangingSkuCount} item transit menggantung, termasuk ${pokSummary.noDocCount} SKU tanpa dokumen MM dan ${pokSummary.agingBuckets.over14Days} SKU berusia > 14 hari.`
    );
  }

  return insights;
}

