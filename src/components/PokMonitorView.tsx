import { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Download,
  Search,
} from 'lucide-react';
import { formatNumber, formatSignedNumber } from '../lib/formatters';
import { ALL_BRANCHES } from '../lib/sheetConfig';
import type {
  BranchName,
  PokAnalysisSummary,
  PokAuditStatus,
  PokItem,
} from '../lib/types';

interface PokMonitorViewProps {
  selectedBranch: BranchName | 'ALL';
  onChangeBranch: (branch: BranchName | 'ALL') => void;
  initialSummary: PokAnalysisSummary;
}

function pokStatusLabel(status: PokAuditStatus): string {
  if (status === 'tanpa_dokumen') return 'Tanpa Dokumen MM';
  if (status === 'selisih_parsial') return 'Selisih Parsial';
  if (status === 'siap_terima') return 'Siap Diterima';
  return 'Selesai (Clear)';
}

function buildPokCsv(items: PokItem[]): string {
  const header = [
    'Cabang',
    'Locator POK',
    'Search Key',
    'Nama Barang',
    'UOM',
    'Start Qty',
    'MR',
    'MatTO+',
    'MatFrom-',
    'Last Qty',
    'Move Qty',
    'Selisih',
    'No. Document',
    'Movement Date',
    'Aging (Hari)',
    'Status Audit',
  ];

  const escape = (val: string | number | null) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = items.map((item) =>
    [
      item.cabang,
      item.locator,
      item.searchKey,
      item.name,
      item.uom,
      item.startQty,
      item.mr,
      item.matToPlus,
      item.matFromMinus,
      item.lastQty,
      item.moveQty,
      item.selisih,
      item.docNo,
      item.movementDate,
      item.agingDays ?? '-',
      pokStatusLabel(item.auditStatus),
    ]
      .map(escape)
      .join(',')
  );

  return '\uFEFF' + [header.join(','), ...rows].join('\r\n');
}

export function PokMonitorView({
  selectedBranch,
  onChangeBranch,
  initialSummary,
}: PokMonitorViewProps) {
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('HANGING');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<PokItem[]>([]);
  const [total, setTotal] = useState(0);
  const [analysis, setAnalysis] = useState<PokAnalysisSummary>(initialSummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      branch: selectedBranch,
      auditStatus: auditStatusFilter,
      search,
      limit: '500',
    });

    fetch(`/api/pok?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setItems(json.items || []);
          setTotal(json.total || 0);
          if (json.analysis) setAnalysis(json.analysis);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBranch, auditStatusFilter, search]);

  const handleDownloadCsv = () => {
    const csv = buildPokCsv(items);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const branchSlug = selectedBranch === 'ALL' ? 'semua-cabang' : selectedBranch.toLowerCase();
    a.href = url;
    a.download = `data-pok-${branchSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxBranchHanging = Math.max(
    ...analysis.byBranch.map((b) => b.totalLastQty),
    1
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <section aria-label="Ringkasan Data POK" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Stok POK Menggantung</span>
            <ArrowLeftRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {formatNumber(analysis.hangingSkuCount)} SKU
          </div>
          <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
            Total saldo: {formatNumber(analysis.totalHangingQty)} unit
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tanpa Dokumen MM (Kritis)</span>
            <AlertOctagon className="h-4 w-4 text-red-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-red-700">
            {formatNumber(analysis.noDocCount)} SKU
          </div>
          <div className="mt-1.5 text-xs text-slate-600">
            Last Qty ada, No. Document tidak ditemukan
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Selisih Parsial (Last vs Move)</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-amber-700">
            {formatNumber(analysis.partialMismatchCount)} SKU
          </div>
          <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
            Total selisih abs: {formatNumber(analysis.totalAbsSelisih)} unit
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Siap Diterima (Cocok MM)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-emerald-700">
            {formatNumber(analysis.readyToReceiveCount)} SKU
          </div>
          <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
            {formatNumber(analysis.clearCount)} SKU selesai (saldo 0)
          </div>
        </div>
      </section>

      {/* Analisis Otomatis & Beban Cabang */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Analisis Audit Update MTS POK
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Evaluasi otomatis stok transit POK, kelengkapan dokumen MM, dan umur gantung
            </p>

            <ol className="mt-4 space-y-2.5 text-xs text-slate-700 leading-relaxed">
              {analysis.topInsights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="font-mono font-semibold text-slate-400 shrink-0">
                    0{idx + 1}.
                  </span>
                  <span>{insight}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>Distribusi Umur Dokumen Transit (Aging)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="rounded-md border border-slate-200 p-2.5">
                <div className="text-slate-500">&gt; 14 Hari</div>
                <div className="mt-0.5 font-mono font-semibold text-red-700 tabular-nums">
                  {formatNumber(analysis.agingBuckets.over14Days)} SKU
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-2.5">
                <div className="text-slate-500">7–14 Hari</div>
                <div className="mt-0.5 font-mono font-semibold text-amber-700 tabular-nums">
                  {formatNumber(analysis.agingBuckets.days7To14)} SKU
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-2.5">
                <div className="text-slate-500">&lt; 7 Hari</div>
                <div className="mt-0.5 font-mono font-semibold text-emerald-700 tabular-nums">
                  {formatNumber(analysis.agingBuckets.under7Days)} SKU
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-2.5">
                <div className="text-slate-500">Tanpa Tgl</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-700 tabular-nums">
                  {formatNumber(analysis.agingBuckets.noDate)} SKU
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Sebaran Stok POK Menggantung per Cabang
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik baris cabang untuk memfilter detail item Update MTS POK
              </p>
            </div>
          </div>

          {analysis.byBranch.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Tidak ada stok POK menggantung pada filter cabang ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Cabang</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Menggantung</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Tanpa MM</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Parsial</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Siap Terima</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Total Last Qty</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Selisih Abs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analysis.byBranch.map((br) => {
                    const isBranchOption = ALL_BRANCHES.includes(br.cabang as BranchName);
                    const pct = Math.min(100, (br.totalLastQty / maxBranchHanging) * 100);
                    return (
                      <tr
                        key={br.cabang}
                        onClick={() => {
                          if (isBranchOption) {
                            onChangeBranch(
                              selectedBranch === br.cabang ? 'ALL' : (br.cabang as BranchName)
                            );
                          }
                        }}
                        className={
                          isBranchOption
                            ? 'hover:bg-slate-50 cursor-pointer'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                          <div>{br.cabang}</div>
                          <div className="mt-1 h-1.5 w-24 rounded-sm bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-slate-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                          {formatNumber(br.hangingCount)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-red-700 font-medium">
                          {formatNumber(br.noDocCount)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-700">
                          {formatNumber(br.partialCount)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700">
                          {formatNumber(br.readyCount)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatNumber(br.totalLastQty)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-red-700">
                          {formatNumber(br.totalAbsSelisih)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Filter & Export Controls */}
      <section
        aria-label="Filter Data POK"
        className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
      >
        <div className="lg:col-span-3">
          <label htmlFor="pok-branch-filter" className="block text-xs font-medium text-slate-600 mb-1">
            Cabang
          </label>
          <select
            id="pok-branch-filter"
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

        <div className="lg:col-span-3">
          <label htmlFor="pok-status-filter" className="block text-xs font-medium text-slate-600 mb-1">
            Status Audit POK
          </label>
          <select
            id="pok-status-filter"
            value={auditStatusFilter}
            onChange={(e) => setAuditStatusFilter(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="HANGING">Semua Stok Menggantung (Last Qty ≠ 0)</option>
            <option value="tanpa_dokumen">Kritis: Tanpa Dokumen MM</option>
            <option value="selisih_parsial">Peringatan: Selisih Parsial</option>
            <option value="siap_terima">Siap Diterima (Cocok MM)</option>
            <option value="ALL">Semua Baris Termasuk Clear (Saldo 0)</option>
          </select>
        </div>

        <div className="lg:col-span-4">
          <label htmlFor="pok-search" className="block text-xs font-medium text-slate-600 mb-1">
            Cari Locator POK / SKU / No. Dokumen
          </label>
          <div className="relative">
            <Search
              className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="pok-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Contoh: PRM-KRW POK MDN atau MM/1007814..."
              className="w-full h-9 rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="lg:col-span-2 flex justify-end">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={items.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Unduh CSV ({formatNumber(items.length)})</span>
          </button>
        </div>
      </section>

      {/* Main POK Data Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>
            Menampilkan {formatNumber(items.length)} dari {formatNumber(total)} baris Data POK
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Tidak ada baris Data POK untuk filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">Cabang</th>
                  <th className="px-3 py-3 font-semibold">Locator POK</th>
                  <th className="px-3 py-3 font-semibold">Produk &amp; Search Key</th>
                  <th className="px-2.5 py-3 font-semibold text-right">Last Qty</th>
                  <th className="px-2.5 py-3 font-semibold text-right">Move Qty</th>
                  <th className="px-2.5 py-3 font-semibold text-right">Selisih</th>
                  <th className="px-3 py-3 font-semibold">No. Dokumen &amp; Tgl Movement</th>
                  <th className="px-3 py-3 font-semibold">Status Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                      {item.cabang}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                      {item.locator}
                    </td>
                    <td className="px-3 py-2.5 max-w-[230px]">
                      <div className="font-medium text-slate-900 truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate">
                        {item.searchKey}
                        {item.uom ? ` · ${item.uom}` : ''}
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatNumber(item.lastQty)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatNumber(item.moveQty)}
                    </td>
                    <td
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        Math.abs(item.selisih) < 0.01 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatSignedNumber(item.selisih)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-mono text-slate-800">{item.docNo}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {item.movementDate}
                        {item.agingDays !== null ? ` (${item.agingDays} hari)` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          item.auditStatus === 'tanpa_dokumen'
                            ? 'text-red-700'
                            : item.auditStatus === 'selisih_parsial'
                              ? 'text-amber-700'
                              : item.auditStatus === 'siap_terima'
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                        }`}
                      >
                        {item.auditStatus === 'tanpa_dokumen' && (
                          <AlertOctagon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {item.auditStatus === 'selisih_parsial' && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {(item.auditStatus === 'siap_terima' || item.auditStatus === 'clear') && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {pokStatusLabel(item.auditStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
