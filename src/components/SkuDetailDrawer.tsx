import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, X } from 'lucide-react';
import { categoryShortLabel, formatNumber, formatSignedNumber, statusLabel } from '../lib/formatters';
import type { BranchTransaction, ReconciliationItem } from '../lib/types';

interface SkuDetailDrawerProps {
  item: ReconciliationItem | null;
  onClose: () => void;
}

export function SkuDetailDrawer({ item, onClose }: SkuDetailDrawerProps) {
  const [transactions, setTransactions] = useState<BranchTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      branch: item.branch,
      category: item.category,
      locator: item.locator,
      kode: item.kode,
      limit: '150',
    });

    fetch(`/api/transactions?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Gagal memuat riwayat transaksi');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setTransactions(data.items || []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Detail rekonsiliasi ${item.kode}`}
    >
      <div
        className="fixed inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white border-l border-slate-200 shadow-xl">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{item.branch}</span>
              <span aria-hidden="true">·</span>
              <span>{categoryShortLabel(item.category)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{item.locator}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 break-words">
              {item.namaBahan}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-mono font-medium text-slate-800">{item.kode}</span>
              <span aria-hidden="true">·</span>
              <span>Satuan: {item.uom || '-'}</span>
              <span aria-hidden="true">·</span>
              <span>WH Type MTS2: {item.whType}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel detail"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Reconciliation Formula Summary */}
          <section aria-label="Perhitungan selisih stok">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Ringkasan Perhitungan Stok
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-xs text-slate-500">Saldo Awal</div>
                <div className="mt-1 text-base font-semibold font-mono tabular-nums text-slate-900">
                  {formatNumber(item.awal)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-xs text-slate-500">Total Masuk (IN)</div>
                <div className="mt-1 text-base font-semibold font-mono tabular-nums text-emerald-700">
                  +{formatNumber(item.masuk)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-xs text-slate-500">Total Keluar (OUT)</div>
                <div className="mt-1 text-base font-semibold font-mono tabular-nums text-rose-700">
                  -{formatNumber(item.keluar)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="text-xs text-slate-500">Stok Inputan Cabang</div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {formatNumber(item.stokInput)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="text-xs text-slate-500">Stok Sistem (MTS2)</div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {formatNumber(item.stokSistem)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="text-xs text-slate-500">Selisih (Input - Sistem)</div>
                <div
                  className={`mt-1 text-lg font-semibold font-mono tabular-nums flex items-center gap-1.5 ${
                    item.status === 'sesuai'
                      ? 'text-emerald-700'
                      : item.status === 'surplus_input'
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  {item.status === 'sesuai' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{formatSignedNumber(item.selisih)}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{statusLabel(item.status)}</div>
              </div>
            </div>
          </section>

          {/* Transaction History */}
          <section aria-label="Riwayat transaksi inputan cabang">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Riwayat Inputan Cabang ({item.txCount} entri)
              </h3>
              <span className="text-xs text-slate-500">Menampilkan entri terbaru</span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="h-10 rounded-md bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : transactions.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                Tidak ada baris transaksi pada sheet cabang untuk kombinasi locator dan kode SKU ini. Stok ini hanya tercatat pada tarikan Bot MTS2.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Tanggal</th>
                      <th className="px-3 py-2.5 font-medium">Jenis</th>
                      <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                      <th className="px-3 py-2.5 font-medium">Locator To/From</th>
                      <th className="px-3 py-2.5 font-medium">No. Dokumen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {tx.date || '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              tx.ioType === 'IN'
                                ? 'text-emerald-700'
                                : tx.ioType === 'OUT'
                                  ? 'text-rose-700'
                                  : 'text-slate-700'
                            }`}
                          >
                            {tx.ioType === 'IN' && (
                              <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {tx.ioType === 'OUT' && (
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {tx.ioType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatNumber(tx.qty)}
                        </td>
                        <td className="px-3 py-2 text-slate-600 truncate max-w-[140px]">
                          {tx.locatorTo || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600 truncate max-w-[160px]">
                          {tx.docNo || tx.keterangan || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
