import { useEffect, useState } from 'react';
import { Clock, Database, FileSpreadsheet, Search } from 'lucide-react';
import { formatNumber } from '../lib/formatters';
import { ALL_BRANCHES } from '../lib/sheetConfig';
import type {
  BranchName,
  DashboardSummaryResponse,
  Mts2Item,
  OutstandingDoc,
} from '../lib/types';

interface BotMonitorViewProps {
  data: DashboardSummaryResponse;
  selectedBranch: BranchName | 'ALL';
  onChangeBranch: (branch: BranchName | 'ALL') => void;
}

export function BotMonitorView({
  data,
  selectedBranch,
  onChangeBranch,
}: BotMonitorViewProps) {
  const [subTab, setSubTab] = useState<'outstanding' | 'mts2'>('outstanding');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [menuFilter, setMenuFilter] = useState('ALL');
  const [whTypeFilter, setWhTypeFilter] = useState('ALL');
  const [onlyNonZero, setOnlyNonZero] = useState(true);

  const [docs, setDocs] = useState<OutstandingDoc[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsLoading, setDocsLoading] = useState(false);

  const [mts2Items, setMts2Items] = useState<Mts2Item[]>([]);
  const [mts2Total, setMts2Total] = useState(0);
  const [mts2Loading, setMts2Loading] = useState(false);

  useEffect(() => {
    if (subTab !== 'outstanding') return;
    let cancelled = false;
    setDocsLoading(true);

    const params = new URLSearchParams({
      area: selectedBranch,
      status: statusFilter,
      menu: menuFilter,
      search,
      limit: '250',
    });

    fetch(`/api/outstanding?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setDocs(json.items || []);
          setDocsTotal(json.total || 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDocs([]);
          setDocsTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subTab, selectedBranch, statusFilter, menuFilter, search]);

  useEffect(() => {
    if (subTab !== 'mts2') return;
    let cancelled = false;
    setMts2Loading(true);

    const params = new URLSearchParams({
      area: selectedBranch,
      whType: whTypeFilter,
      onlyNonZero: onlyNonZero ? '1' : '0',
      search,
      limit: '250',
    });

    fetch(`/api/mts2?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setMts2Items(json.items || []);
          setMts2Total(json.total || 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMts2Items([]);
          setMts2Total(0);
        }
      })
      .finally(() => {
        if (!cancelled) setMts2Loading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subTab, selectedBranch, whTypeFilter, onlyNonZero, search]);

  return (
    <div className="space-y-5">
      {/* Bot Info Cards */}
      <section aria-label="Status Tarikan Bot" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Sheet Info (OUT1)</span>
            <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-base font-semibold font-mono tabular-nums text-slate-900">
            {data.botInfo.lastUpdatedOut1 || '-'}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              {formatNumber(data.botInfo.totalRowsOut1)} baris
            </span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">
              ·
            </span>
            <span>{data.botInfo.sourceOut1 || '-'}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Sheet Tarikan (Outstanding)</span>
            <FileSpreadsheet className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-base font-semibold font-mono tabular-nums text-slate-900">
            {formatNumber(data.botInfo.tarikanTotalRows)} dokumen
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Terakhir ditarik: {data.botInfo.tarikanPulledAt || '-'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Sheet MTS2 (Stok Sistem)</span>
            <Database className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-base font-semibold font-mono tabular-nums text-slate-900">
            {formatNumber(data.botInfo.mts2TotalRows)} baris
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Periode {data.botInfo.mts2Period || '-'} · {data.botInfo.mts2PulledAt || '-'}
          </div>
        </div>
      </section>

      {/* Segmented Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('outstanding')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
              subTab === 'outstanding'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dokumen Outstanding
          </button>
          <button
            type="button"
            onClick={() => setSubTab('mts2')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
              subTab === 'mts2'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stok Sistem (MTS2)
          </button>
        </div>

        <div className="text-xs text-slate-500 font-mono tabular-nums">
          {subTab === 'outstanding'
            ? `Menampilkan ${docs.length} dari ${formatNumber(docsTotal)} dokumen`
            : `Menampilkan ${mts2Items.length} dari ${formatNumber(mts2Total)} baris MTS2`}
        </div>
      </div>

      {/* Filter Bar */}
      <section
        aria-label="Filter Monitoring Bot"
        className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3"
      >
        <div className="lg:col-span-3">
          <label htmlFor="bot-branch-filter" className="block text-xs font-medium text-slate-600 mb-1">
            Cabang / Area
          </label>
          <select
            id="bot-branch-filter"
            value={selectedBranch}
            onChange={(e) => onChangeBranch(e.target.value as BranchName | 'ALL')}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">Semua Cabang / Area</option>
            {ALL_BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {subTab === 'outstanding' ? (
          <>
            <div className="lg:col-span-3">
              <label htmlFor="bot-status-filter" className="block text-xs font-medium text-slate-600 mb-1">
                Status Dokumen
              </label>
              <select
                id="bot-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="ALL">Semua Status</option>
                {data.outstandingSummary.byStatus.map((s) => (
                  <option key={s.status} value={s.status}>
                    {s.status} ({s.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <label htmlFor="bot-menu-filter" className="block text-xs font-medium text-slate-600 mb-1">
                Menu / Jenis Transaksi
              </label>
              <select
                id="bot-menu-filter"
                value={menuFilter}
                onChange={(e) => setMenuFilter(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="ALL">Semua Menu</option>
                {data.outstandingSummary.byMenu.map((m) => (
                  <option key={m.menu} value={m.menu}>
                    {m.menu} ({m.count})
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="lg:col-span-3">
              <label htmlFor="bot-whtype-filter" className="block text-xs font-medium text-slate-600 mb-1">
                WH Type
              </label>
              <select
                id="bot-whtype-filter"
                value={whTypeFilter}
                onChange={(e) => setWhTypeFilter(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="ALL">Semua WH Type</option>
                {data.mts2Summary.whTypes.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3 flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer h-9">
                <input
                  type="checkbox"
                  checked={onlyNonZero}
                  onChange={(e) => setOnlyNonZero(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>Hanya stok Last Qty &ne; 0</span>
              </label>
            </div>
          </>
        )}

        <div className="lg:col-span-3">
          <label htmlFor="bot-search" className="block text-xs font-medium text-slate-600 mb-1">
            Cari Dokumen / SKU / Locator
          </label>
          <div className="relative">
            <Search
              className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="bot-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kata kunci..."
              className="w-full h-9 rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Table Output */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {subTab === 'outstanding' ? (
          docsLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Tidak ada dokumen outstanding untuk cabang/filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Area</th>
                    <th className="px-4 py-3 font-semibold">Menu</th>
                    <th className="px-4 py-3 font-semibold">Status Dokumen</th>
                    <th className="px-4 py-3 font-semibold">No. Dokumen</th>
                    <th className="px-4 py-3 font-semibold">Tanggal Dokumen</th>
                    <th className="px-4 py-3 font-semibold">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map((d, idx) => (
                    <tr key={`${d.docNo}-${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                        {d.area}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{d.menu}</td>
                      <td
                        className={`px-4 py-2.5 font-medium whitespace-nowrap ${
                          d.status === 'Draft' ? 'text-amber-700' : 'text-blue-700'
                        }`}
                      >
                        {d.status}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-900 whitespace-nowrap">
                        {d.docNo}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {d.docDate}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{d.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : mts2Loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : mts2Items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Tidak ada baris MTS2 ditemukan untuk filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3.5 py-3 font-semibold">Area</th>
                  <th className="px-3.5 py-3 font-semibold">WH Type</th>
                  <th className="px-3.5 py-3 font-semibold">Locator</th>
                  <th className="px-3.5 py-3 font-semibold">Search Key</th>
                  <th className="px-3.5 py-3 font-semibold">Nama Produk</th>
                  <th className="px-3.5 py-3 font-semibold">UOM</th>
                  <th className="px-3.5 py-3 font-semibold text-right">Start Qty</th>
                  <th className="px-3.5 py-3 font-semibold text-right">Prod +</th>
                  <th className="px-3.5 py-3 font-semibold text-right">Ship -</th>
                  <th className="px-3.5 py-3 font-semibold text-right">Last Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mts2Items.map((m, idx) => (
                  <tr key={`${m.locator}-${m.searchKey}-${idx}`} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                      {m.area}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{m.whType}</td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                      {m.locator}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {m.searchKey}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-800 max-w-[220px] truncate">
                      {m.name}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap">{m.uom}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-600">
                      {formatNumber(m.startQty)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                      {formatNumber(m.prodPlus)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-rose-700">
                      {formatNumber(m.shipExtMinus + m.shipIntMinus)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatNumber(m.lastQty)}
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
