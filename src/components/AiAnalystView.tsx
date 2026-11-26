import { useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  Download,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Table2,
} from 'lucide-react';
import {
  categoryShortLabel,
  formatNumber,
  formatSignedNumber,
  statusLabel,
} from '../lib/formatters';
import { ALL_BRANCHES } from '../lib/sheetConfig';
import type {
  AiAnalyzeResponse,
  AiResultDataset,
  BranchName,
  PokAuditStatus,
  ReconciliationItem,
} from '../lib/types';

interface AiAnalystViewProps {
  selectedBranch: BranchName | 'ALL';
  onChangeBranch: (branch: BranchName | 'ALL') => void;
  onInspectSku: (item: ReconciliationItem) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  datasets?: AiResultDataset[];
  toolsUsed?: string[];
}

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadDatasetCsv(dataset: AiResultDataset) {
  if (dataset.rows.length === 0) return;
  const headers = Object.keys(dataset.rows[0]);
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...dataset.rows.map((row) =>
      headers.map((h) => escapeCsvCell(row[h])).join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stockwatch-ai-${dataset.kind}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderInlineSegments(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={`i-${keyIdx++}`} className="italic text-slate-700">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function FormattedAiText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: { ordered: boolean; items: string[] } | null = null;

  const flushList = (keyPrefix: string) => {
    if (!listItems) return;
    const current = listItems;
    listItems = null;
    if (current.ordered) {
      blocks.push(
        <ol
          key={`${keyPrefix}-ol-${blocks.length}`}
          className="list-decimal pl-5 space-y-1 text-sm text-slate-700 leading-relaxed"
        >
          {current.items.map((item, idx) => (
            <li key={idx}>{renderInlineSegments(item)}</li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <ul
          key={`${keyPrefix}-ul-${blocks.length}`}
          className="list-disc pl-5 space-y-1 text-sm text-slate-700 leading-relaxed"
        >
          {current.items.map((item, idx) => (
            <li key={idx}>{renderInlineSegments(item)}</li>
          ))}
        </ul>
      );
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`blank-${idx}`);
      return;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      if (!listItems || !listItems.ordered) {
        flushList(`ol-${idx}`);
        listItems = { ordered: true, items: [] };
      }
      listItems.items.push(orderedMatch[2]);
      return;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (!listItems || listItems.ordered) {
        flushList(`ul-${idx}`);
        listItems = { ordered: false, items: [] };
      }
      listItems.items.push(bulletMatch[1]);
      return;
    }

    flushList(`p-${idx}`);

    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      blocks.push(
        <h4
          key={`h-${idx}`}
          className="text-sm font-semibold text-slate-900 pt-1"
        >
          {renderInlineSegments(headingMatch[1])}
        </h4>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="text-sm text-slate-700 leading-relaxed">
        {renderInlineSegments(line)}
      </p>
    );
  });

  flushList('end');
  return <div className="space-y-2">{blocks}</div>;
}

function pokStatusLabel(status: PokAuditStatus): string {
  if (status === 'tanpa_dokumen') return 'Tanpa Dokumen';
  if (status === 'selisih_parsial') return 'Selisih Parsial';
  if (status === 'siap_terima') return 'Siap Terima';
  return 'Clear';
}

function DatasetTableCard({
  dataset,
  onInspectSku,
}: {
  dataset: AiResultDataset;
  onInspectSku: (item: ReconciliationItem) => void;
}) {
  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <Table2 className="h-3.5 w-3.5 text-blue-700 shrink-0" aria-hidden="true" />
            <span>{dataset.title}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{dataset.subtitle}</p>
        </div>
        {dataset.rows.length > 0 && (
          <button
            type="button"
            onClick={() => downloadDatasetCsv(dataset)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            <span>Unduh CSV</span>
          </button>
        )}
      </div>

      {dataset.rows.length === 0 ? (
        <div className="p-4 text-xs text-slate-500 text-center">
          Tidak ada baris data yang cocok untuk filter tersebut.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[380px]">
          {dataset.kind === 'reconciliation' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold">Cabang · Kategori</th>
                  <th className="px-3 py-2 font-semibold">Locator</th>
                  <th className="px-3 py-2 font-semibold">Tgl Input</th>
                  <th className="px-3 py-2 font-semibold">Kode SKU</th>
                  <th className="px-3 py-2 font-semibold">Nama Bahan</th>
                  <th className="px-3 py-2 font-semibold text-right">Input</th>
                  <th className="px-3 py-2 font-semibold text-right">MTS2</th>
                  <th className="px-3 py-2 font-semibold text-right">Selisih</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dataset.rows as unknown as ReconciliationItem[]).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onInspectSku(item)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{item.branch}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="text-slate-600">{categoryShortLabel(item.category)}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                      {item.locator}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-slate-600">
                      {item.lastDate || 'Belum diinput'}
                    </td>
                    <td className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {item.kode}
                    </td>
                    <td className="px-3 py-2 text-slate-800 max-w-[200px] truncate">
                      {item.namaBahan}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                      {formatNumber(item.stokInput)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                      {formatNumber(item.stokSistem)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${
                        item.status === 'sesuai'
                          ? 'text-emerald-700'
                          : item.status === 'surplus_input'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {formatSignedNumber(item.selisih)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {statusLabel(item.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {dataset.kind === 'branch_health' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold">Cabang</th>
                  <th className="px-3 py-2 font-semibold">Update</th>
                  <th className="px-3 py-2 font-semibold text-right">SKU Input</th>
                  <th className="px-3 py-2 font-semibold text-right">Selisih Acc</th>
                  <th className="px-3 py-2 font-semibold text-right">Selisih RM</th>
                  <th className="px-3 py-2 font-semibold text-right">Selisih MFG</th>
                  <th className="px-3 py-2 font-semibold text-right">Tdk Diinput</th>
                  <th className="px-3 py-2 font-semibold text-right">Stok Input</th>
                  <th className="px-3 py-2 font-semibold text-right">MTS2 (Input)</th>
                  <th className="px-3 py-2 font-semibold text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">
                      {String(r.branch ?? '-')}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {String(r.lastTxDate ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatNumber(Number(r.inputSkuCount ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-red-700">
                      {formatNumber(Number(r.discrepancyAcc ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-red-700">
                      {formatNumber(Number(r.discrepancyRm ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-red-700">
                      {formatNumber(Number(r.discrepancyMfg ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-700 font-medium">
                      {formatNumber(Number(r.mts2OnlySkuCount ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatNumber(Number(r.totalInputQty ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatNumber(Number(r.totalSystemForInputQty ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatNumber(Number(r.outstandingDocsCount ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {dataset.kind === 'pok' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold">Cabang</th>
                  <th className="px-3 py-2 font-semibold">Locator POK</th>
                  <th className="px-3 py-2 font-semibold">Search Key</th>
                  <th className="px-3 py-2 font-semibold">Nama Barang</th>
                  <th className="px-3 py-2 font-semibold text-right">Last Qty</th>
                  <th className="px-3 py-2 font-semibold text-right">Move Qty</th>
                  <th className="px-3 py-2 font-semibold text-right">Selisih</th>
                  <th className="px-3 py-2 font-semibold">No. Dokumen</th>
                  <th className="px-3 py-2 font-semibold text-right">Umur</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                      {String(r.cabang ?? '-')}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                      {String(r.locator ?? '-')}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900 whitespace-nowrap">
                      {String(r.searchKey ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-slate-800 max-w-[180px] truncate">
                      {String(r.name ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatNumber(Number(r.lastQty ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatNumber(Number(r.moveQty ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-red-700">
                      {formatSignedNumber(Number(r.selisih ?? 0))}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                      {String(r.docNo || '-')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {r.agingDays !== null && r.agingDays !== undefined
                        ? `${r.agingDays} hr`
                        : '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {pokStatusLabel((r.auditStatus as PokAuditStatus) ?? 'clear')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {dataset.kind === 'outstanding' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold">Area</th>
                  <th className="px-3 py-2 font-semibold">Menu</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">No. Dokumen</th>
                  <th className="px-3 py-2 font-semibold">Tanggal</th>
                  <th className="px-3 py-2 font-semibold">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                      {String(r.area ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {String(r.menu ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-amber-700 font-medium whitespace-nowrap">
                      {String(r.status ?? '-')}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900 whitespace-nowrap">
                      {String(r.docNo ?? '-')}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {String(r.docDate ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {String(r.createdBy ?? '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {dataset.kind === 'transactions' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold">Tanggal</th>
                  <th className="px-3 py-2 font-semibold">Cabang · Kategori</th>
                  <th className="px-3 py-2 font-semibold">Tipe</th>
                  <th className="px-3 py-2 font-semibold">Locator</th>
                  <th className="px-3 py-2 font-semibold">Kode</th>
                  <th className="px-3 py-2 font-semibold">Nama Bahan</th>
                  <th className="px-3 py-2 font-semibold text-right">Qty</th>
                  <th className="px-3 py-2 font-semibold">No. Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {String(r.date ?? '-')}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{String(r.branch ?? '-')}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="text-slate-600">
                        {categoryShortLabel((r.category as ReconciliationItem['category']) ?? 'accessories')}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {String(r.ioType ?? '-')}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                      {String(r.locator ?? '-')}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900 whitespace-nowrap">
                      {String(r.kode ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-slate-800 max-w-[180px] truncate">
                      {String(r.namaBahan ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatNumber(Number(r.qty ?? 0))}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                      {String(r.docNo || '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function AiAnalystView({
  selectedBranch,
  onChangeBranch,
  onInspectSku,
}: AiAnalystViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickPrompts = [
    'Analisis cabang dengan selisih Accessories & Raw Material tertinggi',
    'Tampilkan 20 SKU yang tidak ada di inputan dengan selisih terbesar',
    'Audit stok POK tanpa dokumen MM atau berusia > 14 hari',
    selectedBranch === 'ALL'
      ? 'Tampilkan dokumen outstanding terbanyak dan hubungannya dengan selisih cabang'
      : `Tampilkan dokumen outstanding dan selisih terbesar di cabang ${selectedBranch}`,
  ];

  async function sendQuestion(questionText: string) {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          branch: selectedBranch,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Gagal memproses analisis (HTTP ${res.status})`);
      }

      const data = body as AiAnalyzeResponse;
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.answer,
        datasets: data.datasets,
        toolsUsed: data.toolsUsed,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError((err as Error).message || 'Terjadi kesalahan saat menghubungi Analis AI.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendQuestion(input);
  }

  return (
    <div className="space-y-4">
      {/* Header & Branch Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                Asisten Analis AI &amp; Penarikan Data
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Tanyakan analisis stok cabang, selisih inputan vs Bot MTS2, item yang tidak ada di inputan, audit transit POK, maupun dokumen outstanding. AI menarik data langsung dari sinkronisasi Google Sheets aktif.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Filter Cabang Analis AI"
              value={selectedBranch}
              onChange={(e) => onChangeBranch(e.target.value as BranchName | 'ALL')}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 whitespace-nowrap"
            >
              <option value="ALL">Semua Cabang (11 Cabang)</option>
              {ALL_BRANCHES.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                disabled={loading}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Prompts */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Contoh Analisis Cepat
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={loading}
                onClick={() => sendQuestion(prompt)}
                className="text-left rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-900 transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2.5"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-semibold">Analisis AI tidak dapat dijalankan</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Conversation & Data Output Area */}
      {messages.length > 0 && (
        <section className="space-y-4">
          {messages.map((msg) =>
            msg.role === 'user' ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-2xl rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div
                key={msg.id}
                className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-800">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Hasil Analisis StockWatch AI</span>
                  </div>
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <span className="text-[11px] font-mono text-slate-400">
                      Sumber: {msg.toolsUsed.join(', ')}
                    </span>
                  )}
                </div>

                <FormattedAiText text={msg.text} />

                {msg.datasets && msg.datasets.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {msg.datasets.map((ds) => (
                      <DatasetTableCard
                        key={ds.id}
                        dataset={ds}
                        onInspectSku={onInspectSku}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {loading && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-2.5 text-xs text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-700" aria-hidden="true" />
              <span>Sedang menarik data dari sheet cabang &amp; Bot MTS2 serta menyusun analisis...</span>
            </div>
          )}
        </section>
      )}

      {messages.length === 0 && loading && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-2.5 text-xs text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" aria-hidden="true" />
          <span>Sedang menarik data dari sheet cabang &amp; Bot MTS2 serta menyusun analisis...</span>
        </div>
      )}

      {/* Prompt Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Tanyakan analisis atau minta tarik data (misal: Tampilkan SKU selisih minus di Jakarta kategori Raw Material)..."
          aria-label="Pertanyaan untuk Analis AI"
          className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          <span>Analisis</span>
        </button>
      </form>
    </div>
  );
}
