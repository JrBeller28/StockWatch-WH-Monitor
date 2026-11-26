import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileWarning,
  GitCompare,
  Layers,
} from 'lucide-react';
import {
  categoryShortLabel,
  formatNumber,
  formatSignedNumber,
  statusLabel,
  type ReconciliationSourceFilter,
} from '../lib/formatters';
import type {
  BranchHealth,
  BranchName,
  CategoryType,
  DashboardSummaryResponse,
  ReconciliationItem,
} from '../lib/types';
import type { NavTab } from './Sidebar';

interface OverviewViewProps {
  data: DashboardSummaryResponse;
  selectedBranch: BranchName | 'ALL';
  onSelectBranch: (branch: BranchName | 'ALL') => void;
  onNavigateTab: (tab: NavTab, sourcePreset?: ReconciliationSourceFilter) => void;
  onInspectSku: (item: ReconciliationItem) => void;
}

export function OverviewView({
  data,
  selectedBranch,
  onSelectBranch,
  onNavigateTab,
  onInspectSku,
}: OverviewViewProps) {
  const [viewScope, setViewScope] = useState<'INPUT_ONLY' | 'MTS2_ONLY'>('INPUT_ONLY');

  const scopeCounts = useMemo(() => {
    let inputCount = 0;
    let mts2OnlyCount = 0;
    for (const r of data.reconciliation) {
      if (r.txCount > 0) inputCount++;
      else mts2OnlyCount++;
    }
    return { inputCount, mts2OnlyCount };
  }, [data.reconciliation]);

  const scopedItems = useMemo(
    () =>
      data.reconciliation.filter((r) =>
        viewScope === 'INPUT_ONLY' ? r.txCount > 0 : r.txCount === 0
      ),
    [data.reconciliation, viewScope]
  );

  const scopedBranchHealth: BranchHealth[] = useMemo(() => {
    const byBranch = new Map<BranchName, ReconciliationItem[]>();
    for (const item of scopedItems) {
      const arr = byBranch.get(item.branch) ?? [];
      arr.push(item);
      byBranch.set(item.branch, arr);
    }

    return data.branchHealth.map((base) => {
      const items = byBranch.get(base.branch) ?? [];
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
        totalInputQty += item.stokInput;
        totalSystemQty += item.stokSistem;
        totalAbsSelisih += item.absSelisih;
      }

      return {
        ...base,
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
      };
    });
  }, [data.branchHealth, scopedItems]);

  const activeBranches: BranchHealth[] = useMemo(() => {
    if (selectedBranch === 'ALL') return scopedBranchHealth;
    return scopedBranchHealth.filter((b) => b.branch === selectedBranch);
  }, [scopedBranchHealth, selectedBranch]);

  const kpi = useMemo(() => {
    const totalSku = activeBranches.reduce((s, b) => s + b.totalSku, 0);
    const matchedSku = activeBranches.reduce((s, b) => s + b.matchedSku, 0);
    const discrepancySku = activeBranches.reduce((s, b) => s + b.discrepancySku, 0);
    const discrepancyAcc = activeBranches.reduce((s, b) => s + b.discrepancyAccessories, 0);
    const discrepancyRm = activeBranches.reduce((s, b) => s + b.discrepancyRawMaterial, 0);
    const discrepancyMfg = activeBranches.reduce((s, b) => s + b.discrepancyManufacturing, 0);
    const surplusSku = activeBranches.reduce((s, b) => s + b.surplusSku, 0);
    const minusSku = activeBranches.reduce((s, b) => s + b.minusSku, 0);
    const totalAbsSelisih = activeBranches.reduce((s, b) => s + b.totalAbsSelisih, 0);
    const matchRate = totalSku > 0 ? Math.round((matchedSku / totalSku) * 1000) / 10 : 0;

    return {
      totalSku,
      matchedSku,
      discrepancySku,
      discrepancyAcc,
      discrepancyRm,
      discrepancyMfg,
      surplusSku,
      minusSku,
      totalAbsSelisih,
      matchRate,
      outstandingCount: data.outstandingSummary.total,
    };
  }, [activeBranches, data.outstandingSummary.total]);

  const categorySummary = useMemo(() => {
    const categories: CategoryType[] = ['accessories', 'raw_material', 'manufacturing'];
    return categories.map((cat) => {
      const items = scopedItems.filter((r) => r.category === cat);
      const discrepancy = items.filter((r) => r.status !== 'sesuai').length;
      const totalInput = items.reduce((s, r) => s + r.stokInput, 0);
      const totalSistem = items.reduce((s, r) => s + r.stokSistem, 0);
      const absSelisih = items.reduce((s, r) => s + r.absSelisih, 0);
      return {
        category: cat,
        label: categoryShortLabel(cat),
        totalSku: items.length,
        discrepancy,
        totalInput,
        totalSistem,
        absSelisih,
      };
    });
  }, [scopedItems]);

  const topDiscrepancies = useMemo(
    () => scopedItems.filter((r) => r.status !== 'sesuai').slice(0, 10),
    [scopedItems]
  );

  const maxBranchSelisih = useMemo(() => {
    const maxVal = Math.max(...scopedBranchHealth.map((b) => b.totalAbsSelisih), 1);
    return maxVal;
  }, [scopedBranchHealth]);

  return (
    <div className="space-y-6">
      {/* Bot Sync Context Strip + Scope Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">
            {selectedBranch === 'ALL' ? 'Cakupan: 11 Cabang' : `Cabang Terpilih: ${selectedBranch}`}
          </span>
          <span aria-hidden="true">·</span>
          <span>Periode MTS2: {data.botInfo.mts2Period || '-'}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Tarikan MTS2: {data.botInfo.mts2PulledAt || '-'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            OUT1: {data.botInfo.lastUpdatedOut1 || '-'}
          </span>
          {selectedBranch !== 'ALL' && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onSelectBranch('ALL')}
                className="text-blue-700 hover:text-blue-900 font-medium whitespace-nowrap"
              >
                Tampilkan Semua Cabang
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewScope('INPUT_ONLY')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
              viewScope === 'INPUT_ONLY'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sesuai Input ({formatNumber(scopeCounts.inputCount)})
          </button>
          <button
            type="button"
            onClick={() => setViewScope('MTS2_ONLY')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
              viewScope === 'MTS2_ONLY'
                ? 'bg-white text-red-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tidak Ada di Inputan ({formatNumber(scopeCounts.mts2OnlyCount)})
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <section aria-label="Ringkasan Metrik Utama" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>
              {viewScope === 'INPUT_ONLY'
                ? 'SKU Sesuai Inputan Cabang'
                : 'SKU Tidak Ada di Inputan'}
            </span>
            <GitCompare className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {formatNumber(kpi.totalSku)}
          </div>
          <div className="mt-1.5 text-xs text-slate-600">
            {viewScope === 'INPUT_ONLY' ? (
              <>
                <span className="text-emerald-700 font-medium font-mono tabular-nums">
                  {kpi.matchRate}% sesuai
                </span>
                <span className="mx-1.5 text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums">{formatNumber(kpi.matchedSku)} SKU cocok</span>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateTab('reconciliation', 'MTS2_ONLY')}
                className="text-red-700 hover:underline font-medium inline-flex items-center gap-1"
              >
                <span>Buka daftar selisih tidak diinput</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>SKU Terdeteksi Selisih</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {formatNumber(kpi.discrepancySku)}
            </span>
            <span className="text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap">
              <span className="text-amber-700">+{formatNumber(kpi.surplusSku)}</span>
              <span className="mx-1 text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="text-red-700">-{formatNumber(kpi.minusSku)}</span>
            </span>
          </div>
          <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap">
            <span>Acc: {formatNumber(kpi.discrepancyAcc)}</span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">
              ·
            </span>
            <span>RM: {formatNumber(kpi.discrepancyRm)}</span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">
              ·
            </span>
            <span>MFG: {formatNumber(kpi.discrepancyMfg)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Ketimpangan Absolut</span>
            <Layers className="h-4 w-4 text-red-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {formatNumber(kpi.totalAbsSelisih)}
          </div>
          <div className="mt-1.5 text-xs text-slate-600">
            Akumulasi |Stok Inputan - Stok MTS2|
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Dokumen Outstanding (Bot)</span>
            <FileWarning className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {formatNumber(kpi.outstandingCount)}
          </div>
          <div className="mt-1.5 text-xs text-slate-600">
            <button
              type="button"
              onClick={() => onNavigateTab('bot')}
              className="text-blue-700 hover:underline font-medium inline-flex items-center gap-1"
            >
              <span>Periksa dokumen Tarikan</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* Automated Executive Insights */}
      {data.overviewInsights && data.overviewInsights.length > 0 && (
        <section
          aria-label="Analisis dan Rekomendasi Otomatis"
          className="bg-white border border-slate-200 rounded-lg p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Analisis &amp; Temuan Otomatis
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ringkasan anomali stok, item belum diinput cabang, kode SKU belum terpetakan, dan status transit POK
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('pok')}
              className="text-xs font-medium text-blue-700 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Buka Analisis Data POK</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-slate-700 leading-relaxed">
            {data.overviewInsights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="font-mono font-semibold text-slate-400 shrink-0">
                  0{idx + 1}.
                </span>
                <span>{insight}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Visual Branch Discrepancy Bar Chart + Category Breakdown */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Branch Comparison Chart */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Ketimpangan Stok per Cabang (Input vs MTS2)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik baris cabang untuk memfilter seluruh laporan ke cabang tersebut
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600 inline-block" />
                Sesuai
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500 inline-block" />
                Surplus Input
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-red-600 inline-block" />
                Minus Input
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {scopedBranchHealth.map((b) => {
              const total = Math.max(b.totalSku, 1);
              const pctMatch = (b.matchedSku / total) * 100;
              const pctSurplus = (b.surplusSku / total) * 100;
              const pctMinus = (b.minusSku / total) * 100;
              const isSelected = selectedBranch === b.branch;
              const volumeBar = Math.min(100, (b.totalAbsSelisih / maxBranchSelisih) * 100);

              return (
                <button
                  key={b.branch}
                  type="button"
                  onClick={() =>
                    onSelectBranch(selectedBranch === b.branch ? 'ALL' : b.branch)
                  }
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900 w-24 shrink-0">
                        {b.branch}
                      </span>
                      <span className="text-slate-500 font-mono tabular-nums whitespace-nowrap">
                        {formatNumber(b.discrepancySku)}/{formatNumber(b.totalSku)} SKU selisih
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="text-slate-500 hidden sm:inline">
                        Vol. ketimpangan:
                      </span>
                      <span
                        className={`font-semibold ${
                          b.totalAbsSelisih > 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatNumber(b.totalAbsSelisih)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-12 gap-2 items-center">
                    <div
                      className="col-span-8 h-2.5 rounded-sm bg-slate-100 overflow-hidden flex"
                      title={`Sesuai: ${b.matchedSku}, Surplus: ${b.surplusSku}, Minus: ${b.minusSku}`}
                    >
                      <div
                        className="bg-emerald-600 h-full"
                        style={{ width: `${pctMatch}%` }}
                      />
                      <div
                        className="bg-amber-500 h-full"
                        style={{ width: `${pctSurplus}%` }}
                      />
                      <div
                        className="bg-red-600 h-full"
                        style={{ width: `${pctMinus}%` }}
                      />
                    </div>
                    <div className="col-span-4 h-2.5 rounded-sm bg-slate-100 overflow-hidden">
                      <div
                        className="bg-slate-700 h-full rounded-sm"
                        style={{ width: `${volumeBar}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Ringkasan per Kategori Sheet
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Accessories (INPUT), Raw Material (INPUT RM), Manufacturing (INPUT MFG)
            </p>

            <div className="mt-4 divide-y divide-slate-200">
              {categorySummary.map((cat) => (
                <div key={cat.category} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateTab(cat.category, viewScope)}
                      className="text-sm font-semibold text-slate-900 hover:text-blue-700 inline-flex items-center gap-1"
                    >
                      <span>{cat.label}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <div className="text-xs font-mono tabular-nums whitespace-nowrap">
                      <span className="text-red-700 font-semibold">
                        {formatNumber(cat.discrepancy)} selisih
                      </span>
                      <span className="mx-1 text-slate-300" aria-hidden="true">
                        /
                      </span>
                      <span className="text-slate-500">{formatNumber(cat.totalSku)} SKU</span>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-500">Inputan</div>
                      <div className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                        {formatNumber(cat.totalInput)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Sistem MTS2</div>
                      <div className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                        {formatNumber(cat.totalSistem)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Selisih Abs.</div>
                      <div
                        className={`font-mono tabular-nums font-semibold mt-0.5 ${
                          cat.absSelisih > 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatNumber(cat.absSelisih)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('reconciliation', viewScope)}
            className="mt-5 w-full h-9 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
          >
            {viewScope === 'INPUT_ONLY'
              ? 'Buka Matriks Rekonsiliasi Lengkap'
              : 'Buka Daftar Yang Tidak Ada di Inputan'}
          </button>
        </div>
      </section>

      {/* Branch Health Summary Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Monitoring Inputan per Cabang
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Status ketersediaan sheet inputan, jumlah SKU, dan perbandingan total stok dengan Bot MTS2
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3.5 py-3 font-semibold">Cabang</th>
                <th className="px-3.5 py-3 font-semibold">Sheet Aktif</th>
                <th className="px-3 py-3 font-semibold text-right">SKU</th>
                <th className="px-3 py-3 font-semibold text-right">Selisih Acc</th>
                <th className="px-3 py-3 font-semibold text-right">Selisih RM</th>
                <th className="px-3 py-3 font-semibold text-right">Selisih MFG</th>
                <th className="px-3 py-3 font-semibold text-right">Total Selisih</th>
                <th className="px-3 py-3 font-semibold text-right">Stok Input</th>
                <th className="px-3 py-3 font-semibold text-right">Stok MTS2</th>
                <th className="px-3 py-3 font-semibold text-right">Selisih Abs.</th>
                <th className="px-3 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeBranches.map((b) => {
                const sheets = [
                  b.hasAccessories ? 'INPUT' : null,
                  b.hasRawMaterial ? 'RM' : null,
                  b.hasManufacturing ? 'MFG' : null,
                ]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <tr key={b.branch} className="hover:bg-slate-50/80">
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{b.branch}</div>
                      {b.lastTxDate && (
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          Update: {b.lastTxDate}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">
                      {sheets || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {formatNumber(b.totalSku)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {formatNumber(b.discrepancyAccessories)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {b.hasRawMaterial ? formatNumber(b.discrepancyRawMaterial) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {b.hasManufacturing ? formatNumber(b.discrepancyManufacturing) : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-red-700 font-semibold">
                      {formatNumber(b.discrepancySku)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {formatNumber(b.totalInputQty)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {formatNumber(b.totalSystemQty)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatNumber(b.totalAbsSelisih)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectBranch(b.branch);
                          onNavigateTab('reconciliation', viewScope);
                        }}
                        className="text-blue-700 hover:text-blue-900 font-medium"
                      >
                        Detail Stok
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top 10 Discrepancy Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Top 10 Ketimpangan Stok Terbesar
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik item untuk melihat rincian Saldo Awal, Masuk, Keluar, dan riwayat inputan cabang
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('reconciliation', viewScope)}
            className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
          >
            {viewScope === 'INPUT_ONLY'
              ? 'Lihat semua selisih input'
              : 'Lihat semua tidak diinput'}
          </button>
        </div>

        {topDiscrepancies.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600 flex flex-col items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            <span>Tidak ada selisih stok antara inputan cabang dan Bot MTS2 pada filter ini.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3.5 py-3 font-semibold">Cabang · Kategori</th>
                  <th className="px-3.5 py-3 font-semibold">Locator</th>
                  <th className="px-3.5 py-3 font-semibold">Tgl Input</th>
                  <th className="px-3.5 py-3 font-semibold">Kode SKU</th>
                  <th className="px-3.5 py-3 font-semibold">Nama Bahan</th>
                  <th className="px-3.5 py-3 font-semibold text-right">Inputan</th>
                  <th className="px-3.5 py-3 font-semibold text-right">MTS2</th>
                  <th className="px-3.5 py-3 font-semibold text-right">Selisih</th>
                  <th className="px-3.5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topDiscrepancies.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onInspectSku(item)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{item.branch}</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-600">{categoryShortLabel(item.category)}</span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                      {item.locator}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono tabular-nums whitespace-nowrap">
                      {item.lastDate ? (
                        <span className="text-slate-600">{item.lastDate}</span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Belum diinput</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {item.kode}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-800 max-w-[200px] truncate">
                      {item.namaBahan}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-900">
                      {formatNumber(item.stokInput)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-900">
                      {formatNumber(item.stokSistem)}
                    </td>
                    <td
                      className={`px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold ${
                        item.status === 'surplus_input' ? 'text-amber-700' : 'text-red-700'
                      }`}
                    >
                      {formatSignedNumber(item.selisih)}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          item.status === 'surplus_input' ? 'text-amber-700' : 'text-red-700'
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        {statusLabel(item.status)}
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
