import { CATEGORY_LABELS } from './sheetConfig';
import { parseFlexibleDateMs } from './sheetParser';
import type { BranchName, CategoryType, ReconciliationItem, StockStatus } from './types';

export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '0';
  const isWhole = Math.abs(value - Math.round(value)) < 0.005;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: maxDecimals,
  }).format(isWhole ? Math.round(value) : value);
}

export function formatSignedNumber(value: number): string {
  if (Math.abs(value) < 0.005) return '0';
  const prefix = value > 0 ? '+' : '-';
  return `${prefix}${formatNumber(Math.abs(value))}`;
}

export function statusLabel(status: StockStatus): string {
  if (status === 'sesuai') return 'Sesuai';
  if (status === 'surplus_input') return 'Surplus Input';
  return 'Minus Input';
}

export function categoryShortLabel(category: CategoryType): string {
  if (category === 'accessories') return 'Accessories';
  if (category === 'raw_material') return 'Raw Material';
  return 'Manufacturing';
}

export type ReconciliationSourceFilter = 'ALL' | 'INPUT_ONLY' | 'MTS2_ONLY';
export type ReconciliationSortBy =
  | 'absSelisih'
  | 'lastDate'
  | 'stokInput'
  | 'stokSistem'
  | 'name';

export interface ReconciliationFilterOptions {
  branch: BranchName | 'ALL';
  category: CategoryType | 'ALL';
  status: StockStatus | 'ALL' | 'DISCREPANCY';
  locator: string;
  search: string;
  source?: ReconciliationSourceFilter;
  sortBy?: ReconciliationSortBy;
}

export function filterReconciliation(
  items: ReconciliationItem[],
  filters: ReconciliationFilterOptions
): ReconciliationItem[] {
  const query = filters.search.trim().toLowerCase();
  const source = filters.source ?? 'ALL';
  const sortBy = filters.sortBy ?? 'absSelisih';

  const filtered = items.filter((item) => {
    if (filters.branch !== 'ALL' && item.branch !== filters.branch) return false;
    if (filters.category !== 'ALL' && item.category !== filters.category) return false;
    if (filters.locator && filters.locator !== 'ALL' && item.locator !== filters.locator) {
      return false;
    }
    if (source === 'INPUT_ONLY' && item.txCount === 0) return false;
    if (source === 'MTS2_ONLY' && item.txCount > 0) return false;
    if (filters.status === 'DISCREPANCY' && item.status === 'sesuai') return false;
    if (
      filters.status !== 'ALL' &&
      filters.status !== 'DISCREPANCY' &&
      item.status !== filters.status
    ) {
      return false;
    }
    if (query) {
      const hay = `${item.kode} ${item.namaBahan} ${item.locator} ${item.branch} ${item.whType}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  if (sortBy === 'absSelisih') return filtered;

  return [...filtered].sort((a, b) => {
    if (sortBy === 'lastDate') {
      const dA = parseFlexibleDateMs(a.lastDate);
      const dB = parseFlexibleDateMs(b.lastDate);
      if (dB !== dA) return dB - dA;
      return b.absSelisih - a.absSelisih;
    }
    if (sortBy === 'stokInput') {
      return b.stokInput - a.stokInput || b.absSelisih - a.absSelisih;
    }
    if (sortBy === 'stokSistem') {
      return b.stokSistem - a.stokSistem || b.absSelisih - a.absSelisih;
    }
    return a.namaBahan.localeCompare(b.namaBahan) || a.kode.localeCompare(b.kode);
  });
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildReconciliationCsv(items: ReconciliationItem[]): string {
  const header = [
    'Cabang',
    'Kategori',
    'Locator',
    'Kode SKU',
    'Nama Bahan',
    'UOM',
    'Saldo Awal',
    'Masuk (IN)',
    'Keluar (OUT)',
    'Stok Inputan',
    'Stok Sistem (MTS2)',
    'Selisih (Input - Sistem)',
    'Status',
    'WH Type MTS2',
    'Transaksi Terakhir',
  ];

  const rows = items.map((item) =>
    [
      item.branch,
      CATEGORY_LABELS[item.category],
      item.locator,
      item.kode,
      item.namaBahan,
      item.uom,
      item.awal,
      item.masuk,
      item.keluar,
      item.stokInput,
      item.stokSistem,
      item.selisih,
      statusLabel(item.status),
      item.whType,
      item.lastDate,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return '\uFEFF' + [header.join(','), ...rows].join('\r\n');
}
