import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react';
import {
  buildReconciliationCsv,
  categoryShortLabel,
  filterReconciliation,
  formatNumber,
  formatSignedNumber,
  statusLabel,
  type ReconciliationSortBy,
  type ReconciliationSourceFilter,
} from '../lib/formatters';
import { ALL_BRANCHES } from '../lib/sheetConfig';
import type {
  BranchName,
  BranchTransaction,
  CategoryType,
  DashboardSummaryResponse,
  ReconciliationItem,
  StockStatus,
} from '../lib/types';

interface ReconciliationViewProps {
  data: DashboardSummaryResponse;
  selectedBranch: BranchName | 'ALL';
  onChangeBranch: (branch: BranchName | 'ALL') => void;
  lockedCategory?: CategoryType;
  initialSourceFilter?: ReconciliationSourceFilter;
  onInspectSku: (item: ReconciliationItem) => void;
}

const PAGE_SIZE = 50;

export function ReconciliationView({
  data,
  selectedBranch,
  onChangeBranch,
  lockedCategory,
  initialSourceFilter,
  onInspectSku,
}: ReconciliationViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryType | 'ALL'>(
    lockedCategory ?? 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'ALL' | 'DISCREPANCY'>(
    lockedCategory ? 'ALL' : 'DISCREPANCY'
  );
  const [locatorFilter, setLocatorFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<ReconciliationSourceFilter>(
    initialSourceFilter ?? 'INPUT_ONLY'
  );
  const [sortBy, setSortBy] = useState<ReconciliationSortBy>('absSelisih');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [subTab, setSubTab] = useState<'compare' | 'log'>('compare');

  // Transaction log state (when subTab === 'log')
  const [txItems, setTxItems] = useState<BranchTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [ioTypeFilter, setIoTypeFilter] = useState<'ALL' | 'AWAL' | 'IN' | 'OUT'>('ALL');

  const effectiveCategory = lockedCategory ?? categoryFilter;

  useEffect(() => {
    setCategoryFilter(lockedCategory ?? 'ALL');
    setStatusFilter(lockedCategory ? 'ALL' : 'DISCREPANCY');
    setLocatorFilter('ALL');
    setSourceFilter(initialSourceFilter ?? 'INPUT_ONLY');
    setSortBy('absSelisih');
    setPage(1);
    setSubTab('compare');
  }, [lockedCategory, initialSourceFilter]);

  useEffect(() => {
    setLocatorFilter('ALL');
    setPage(1);
  }, [selectedBranch]);

  const availableLocators = useMemo(() => {
    const locs = new Set<string>();
    for (const item of data.reconciliation) {
      if (selectedBranch !== 'ALL' && item.branch !== selectedBranch) continue;
      if (effectiveCategory !== 'ALL' && item.category !== effectiveCategory) continue;
      locs.add(item.locator);
    }
    return Array.from(locs).sort();
  }, [data.reconciliation, selectedBranch, effectiveCategory]);

  const filteredItems = useMemo(
    () =>
      filterReconciliation(data.reconciliation, {
        branch: selectedBranch,
        category: effectiveCategory,
        status: statusFilter,
        locator: locatorFilter,
        search,
        source: sourceFilter,
        sortBy,
      }),
    [
      data.reconciliation,
      selectedBranch,
      effectiveCategory,
      statusFilter,
      locatorFilter,
      search,
      sourceFilter,
      sortBy,
    ]
  );

  const bothSourcesCount = useMemo(() => {
    const allForFilters = filterReconciliation(data.reconciliation, {
      branch: selectedBranch,
      category: effectiveCategory,
      status: statusFilter,
      locator: locatorFilter,
      search,
      source: 'ALL',
      sortBy: 'absSelisih',
    });
    let inputCount = 0;
    let mts2OnlyCount = 0;
    for (const item of allForFilters) {
      if (item.txCount > 0) inputCount++;
      else mts2OnlyCount++;
    }
    return { inputCount, mts2OnlyCount };
  }, [data.reconciliation, selectedBranch, effectiveCategory, statusFilter, locatorFilter, search]);

  const summary = useMemo(() => {
    let totalInput = 0;
    let totalSistem = 0;
    let totalAbs = 0;
    let mismatchCount = 0;

    for (const item of filteredItems) {
      totalInput += item.stokInput;
      totalSistem += item.stokSistem;
      totalAbs += item.absSelisih;
      if (item.status !== 'sesuai') mismatchCount++;
    }

    return { totalInput, totalSistem, totalAbs, mismatchCount };
  }, [filteredItems]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredItems, safePage]
  );

  useEffect(() => {
    if (subTab !== 'log') return;
    let cancelled = false;
    setTxLoading(true);

    const params = new URLSearchParams({
      branch: selectedBranch,
      category: effectiveCategory,
      ioType: ioTypeFilter,
      search,
      limit: '250',
    });
    if (locatorFilter !== 'ALL') params.set('locator', locatorFilter);

    fetch(`/api/transactions?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setTxItems(json.items || []);
          setTxTotal(json.total || 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTxItems([]);
          setTxTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setTxLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subTab, selectedBranch, effectiveCategory, locatorFilter, ioTypeFilter, search]);

  const handleDownloadCsv = () => {
    const csv = buildReconciliationCsv(filteredItems);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const branchSlug = selectedBranch === 'ALL' ? 'semua-cabang' : selectedBranch.toLowerCase();
    const catSlug = effectiveCategory === 'ALL' ? 'semua-kategori' : effectiveCategory;
    a.href = url;
    a.download = `rekonsiliasi-${branchSlug}-${catSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedBranchHealth =
    selectedBranch !== 'ALL'
      ? data.branchHealth.find((b) => b.branch === selectedBranch)
      : undefined;

  const missingMfgNotice =
    lockedCategory === 'manufacturing' &&
    selectedBranchHealth &&
    !selectedBranchHealth.hasManufacturing;

  return (
    <div className="space-y-5">
      {/* Sub-navigation on category pages + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {lockedCategory ? (
          <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSubTab('compare')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
                subTab === 'compare'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vs Bot MTS2
            </button>
            <button
              type="button"
              onClick={() => setSubTab('log')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
                subTab === 'log'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Log Inputan
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-600">
            Menampilkan perbandingan otomatis <span className="font-medium text-slate-900">Stok Inputan (AWAL + IN - OUT)</span> terhadap <span className="font-medium text-slate-900">Last Qty Bot MTS2</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={filteredItems.length === 0}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Unduh CSV ({formatNumber(filteredItems.length)})</span>
        </button>
      </div>

      {/* Filter Bar */}
      <section
        aria-label="Filter Laporan Stok"
        className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3"
      >
        <div className="lg:col-span-2">
          <label htmlFor="report-branch-filter" className="block text-xs font-medium text-slate-600 mb-1">
            Cabang
          </label>
          <select
            id="report-branch-filter"
            value={selectedBranch}
            onChange={(e) => onChangeBranch(e.target.value as BranchName | 'ALL')}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">Semua Cabang</option>
            {ALL_BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {!lockedCategory && (
          <div className="lg:col-span-2">
            <label htmlFor="report-cat-filter" className="block text-xs font-medium text-slate-600 mb-1">
              Kategori Sheet
            </label>
            <select
              id="report-cat-filter"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value as CategoryType | 'ALL');
                setPage(1);
              }}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="accessories">Accessories (INPUT)</option>
              <option value="raw_material">Raw Material (INPUT RM)</option>
              <option value="manufacturing">Manufacturing (INPUT MFG)</option>
            </select>
          </div>
        )}

        <div className={lockedCategory ? 'lg:col-span-3' : 'lg:col-span-2'}>
          <label htmlFor="report-locator-filter" className="block text-xs font-medium text-slate-600 mb-1">
            Locator
          </label>
          <select
            id="report-locator-filter"
            value={locatorFilter}
            onChange={(e) => {
              setLocatorFilter(e.target.value);
              setPage(1);
            }}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">Semua Locator ({availableLocators.length})</option>
            {availableLocators.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {subTab === 'compare' ? (
          <div className={lockedCategory ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <label htmlFor="report-status-filter" className="block text-xs font-medium text-slate-600 mb-1">
              Status Selisih
            </label>
            <select
              id="report-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StockStatus | 'ALL' | 'DISCREPANCY');
                setPage(1);
              }}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="DISCREPANCY">Hanya Ada Selisih</option>
              <option value="ALL">Semua Status</option>
              <option value="surplus_input">Surplus Input (+)</option>
              <option value="minus_input">Minus Input (-)</option>
              <option value="sesuai">Sesuai (0)</option>
            </select>
          </div>
        ) : (
          <div className="lg:col-span-3">
            <label htmlFor="report-io-filter" className="block text-xs font-medium text-slate-600 mb-1">
              Tipe Input (I/O/A)
            </label>
            <select
              id="report-io-filter"
              value={ioTypeFilter}
              onChange={(e) => setIoTypeFilter(e.target.value as 'ALL' | 'AWAL' | 'IN' | 'OUT')}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="ALL">Semua Tipe (AWAL / IN / OUT)</option>
              <option value="AWAL">AWAL (Saldo Awal)</option>
              <option value="IN">IN (Masuk)</option>
              <option value="OUT">OUT (Keluar)</option>
            </select>
          </div>
        )}

        <div className="lg:col-span-4">
          <label htmlFor="report-search" className="block text-xs font-medium text-slate-600 mb-1">
            Cari SKU / Nama Bahan / Locator
          </label>
          <div className="relative">
            <Search
              className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="report-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Contoh: BB-PE-BENANG atau AMT-JKT..."
              className="w-full h-9 rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {subTab === 'compare' && (
          <div className="col-span-full pt-3 mt-0.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-3">
              <label htmlFor="report-source-filter" className="block text-xs font-medium text-slate-600 mb-1">
                Sumber Data
              </label>
              <select
                id="report-source-filter"
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value as ReconciliationSourceFilter);
                  setPage(1);
                }}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="INPUT_ONLY">Sesuai yang Diinput (Input Cabang)</option>
                <option value="MTS2_ONLY">Yang Tidak Ada di Inputan</option>
                <option value="ALL">Semua (Inputan + Tidak Ada di Inputan)</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label htmlFor="report-sort-by" className="block text-xs font-medium text-slate-600 mb-1">
                Urutkan Berdasarkan
              </label>
              <select
                id="report-sort-by"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as ReconciliationSortBy);
                  setPage(1);
                }}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="absSelisih">Selisih Terbesar (Absolut)</option>
                <option value="lastDate">Tgl Input Terbaru</option>
                <option value="stokInput">Stok Input Terbesar</option>
                <option value="stokSistem">Stok MTS2 Terbesar</option>
                <option value="name">Nama Bahan (A–Z)</option>
              </select>
            </div>

            <div className="lg:col-span-6 flex flex-wrap items-center sm:justify-end gap-2 text-xs font-mono tabular-nums h-9">
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('INPUT_ONLY');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md border transition-colors ${
                  sourceFilter === 'INPUT_ONLY'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Sesuai Input ({formatNumber(bothSourcesCount.inputCount)})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('MTS2_ONLY');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md border transition-colors ${
                  sourceFilter === 'MTS2_ONLY'
                    ? 'border-red-700 bg-red-700 text-white'
                    : 'border-slate-200 bg-slate-50 text-red-700 hover:bg-red-50'
                }`}
              >
                Yang Tidak Ada di Inputan ({formatNumber(bothSourcesCount.mts2OnlyCount)})
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Summary Strip for Current Filter */}
      {subTab === 'compare' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500">Baris Terfilter</div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-slate-900">
              {formatNumber(filteredItems.length)} SKU
            </div>
            <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-600">
              <span
                className={
                  summary.mismatchCount > 0 ? 'font-semibold text-red-700' : 'text-emerald-700'
                }
              >
                {formatNumber(summary.mismatchCount)} SKU selisih
              </span>
              {' · '}
              {formatNumber(filteredItems.length - summary.mismatchCount)} sesuai
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500">Total Stok Inputan</div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-slate-900">
              {formatNumber(summary.totalInput)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500">
              {sourceFilter === 'INPUT_ONLY'
                ? 'Stok MTS2 (Sesuai Input)'
                : sourceFilter === 'MTS2_ONLY'
                  ? 'Stok MTS2 (Tidak Diinput)'
                  : 'Total Stok Sistem (MTS2)'}
            </div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-slate-900">
              {formatNumber(summary.totalSistem)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500">Akumulasi Selisih Absolut</div>
            <div
              className={`mt-0.5 text-lg font-semibold font-mono tabular-nums ${
                summary.totalAbs > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {formatNumber(summary.totalAbs)}
            </div>
          </div>
        </div>
      )}

      {/* Missing MFG sheet notice */}
      {missingMfgNotice && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-center space-y-2">
          <div className="text-sm font-semibold text-slate-900">
            Cabang {selectedBranch} tidak memiliki sheet INPUT MFG aktif
          </div>
          <p className="text-xs text-slate-600 max-w-lg mx-auto">
            Saat ini tab INPUT MFG tersedia untuk cabang Jember, Banjarmasin, Pekanbaru, Medan, dan Surabaya. Pilih cabang lain atau tampilkan semua cabang.
          </p>
          <button
            type="button"
            onClick={() => onChangeBranch('ALL')}
            className="mt-2 h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
          >
            Tampilkan Semua Cabang
          </button>
        </div>
      )}

      {/* Main Content Table */}
      {!missingMfgNotice && subTab === 'compare' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {pageItems.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="h-6 w-6 text-slate-400 mx-auto" aria-hidden="true" />
              <div className="text-sm font-medium text-slate-900">
                Tidak ada data yang cocok dengan filter saat ini
              </div>
              <p className="text-xs text-slate-500">
                Coba ubah filter Status Selisih ke "Semua Status" atau hapus kata kunci pencarian.
              </p>
              {statusFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className="mt-1 h-8 px-3 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  Tampilkan Semua Status
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-2.5 py-3 font-semibold">Cabang / Kategori</th>
                      <th className="px-2.5 py-3 font-semibold">Tgl Input</th>
                      <th className="px-2.5 py-3 font-semibold">Locator</th>
                      <th className="px-2.5 py-3 font-semibold">Produk &amp; Kode SKU</th>
                      <th className="px-2 py-3 font-semibold text-right">Awal</th>
                      <th className="px-2 py-3 font-semibold text-right">IN</th>
                      <th className="px-2 py-3 font-semibold text-right">OUT</th>
                      <th className="px-2.5 py-3 font-semibold text-right">Stok Input</th>
                      <th className="px-2.5 py-3 font-semibold text-right">MTS2</th>
                      <th className="px-2.5 py-3 font-semibold text-right">Selisih</th>
                      <th className="px-2.5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageItems.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => onInspectSku(item)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{item.branch}</div>
                          <div className="text-[11px] text-slate-500">
                            {categoryShortLabel(item.category)}
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5 font-mono tabular-nums whitespace-nowrap">
                          {item.lastDate ? (
                            <span className="text-slate-600">{item.lastDate}</span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Belum diinput</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          {item.locator}
                        </td>
                        <td className="px-2.5 py-2.5 max-w-[185px]">
                          <div className="font-medium text-slate-900 truncate" title={item.namaBahan}>
                            {item.namaBahan}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 truncate" title={item.kode}>
                            {item.kode}
                            {item.uom ? ` · ${item.uom}` : ''}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatNumber(item.awal)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                          {formatNumber(item.masuk)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                          {formatNumber(item.keluar)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatNumber(item.stokInput)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatNumber(item.stokSistem)}
                        </td>
                        <td
                          className={`px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            item.status === 'sesuai'
                              ? 'text-emerald-700'
                              : item.status === 'surplus_input'
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }`}
                        >
                          {formatSignedNumber(item.selisih)}
                        </td>
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              item.status === 'sesuai'
                                ? 'text-emerald-700'
                                : item.status === 'surplus_input'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }`}
                          >
                            {item.status === 'sesuai' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            )}
                            {statusLabel(item.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/70 text-xs text-slate-600">
                <span className="font-mono tabular-nums">
                  Halaman {safePage} dari {totalPages} · {formatNumber(filteredItems.length)} item
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Sebelumnya</span>
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* Raw Input Transactions Log Tab */}
      {!missingMfgNotice && subTab === 'log' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Menampilkan 250 entri terbaru dari total{' '}
              <span className="font-mono font-semibold text-slate-900">
                {formatNumber(txTotal)}
              </span>{' '}
              baris inputan
            </span>
          </div>

          {txLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : txItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Tidak ada log transaksi ditemukan untuk filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3.5 py-3 font-semibold">Cabang</th>
                    <th className="px-3.5 py-3 font-semibold">Tanggal</th>
                    <th className="px-3.5 py-3 font-semibold">I/O/A</th>
                    <th className="px-3.5 py-3 font-semibold">Kode SKU</th>
                    <th className="px-3.5 py-3 font-semibold">Nama Bahan</th>
                    <th className="px-3.5 py-3 font-semibold text-right">Qty</th>
                    <th className="px-3.5 py-3 font-semibold">UOM</th>
                    <th className="px-3.5 py-3 font-semibold">Locator</th>
                    <th className="px-3.5 py-3 font-semibold">Locator To/From</th>
                    <th className="px-3.5 py-3 font-semibold">No. Dokumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txItems.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="px-3.5 py-2 font-medium text-slate-900 whitespace-nowrap">
                        {tx.branch}
                      </td>
                      <td className="px-3.5 py-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {tx.date || '-'}
                      </td>
                      <td
                        className={`px-3.5 py-2 font-semibold whitespace-nowrap ${
                          tx.ioType === 'IN'
                            ? 'text-emerald-700'
                            : tx.ioType === 'OUT'
                              ? 'text-rose-700'
                              : 'text-slate-700'
                        }`}
                      >
                        {tx.ioType}
                      </td>
                      <td className="px-3.5 py-2 font-mono text-slate-900 whitespace-nowrap">
                        {tx.kode}
                      </td>
                      <td className="px-3.5 py-2 text-slate-800 max-w-[220px] truncate">
                        {tx.namaBahan}
                      </td>
                      <td className="px-3.5 py-2 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatNumber(tx.qty)}
                      </td>
                      <td className="px-3.5 py-2 text-slate-500 whitespace-nowrap">
                        {tx.uom || '-'}
                      </td>
                      <td className="px-3.5 py-2 font-mono text-slate-700 whitespace-nowrap">
                        {tx.locator}
                      </td>
                      <td className="px-3.5 py-2 font-mono text-slate-600 whitespace-nowrap">
                        {tx.locatorTo || '-'}
                      </td>
                      <td className="px-3.5 py-2 font-mono text-slate-600 max-w-[180px] truncate">
                        {tx.docNo || tx.keterangan || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
