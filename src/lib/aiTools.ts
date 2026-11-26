import { Type, type FunctionDeclaration } from '@google/genai';
import { filterReconciliation, type ReconciliationSortBy, type ReconciliationSourceFilter } from './formatters';
import { analyzePokData, round2 } from './sheetParser';
import type {
  AiResultDataset,
  BranchHealth,
  BranchName,
  BranchTransaction,
  CategoryType,
  OutstandingDoc,
  PokItem,
  ReconciliationItem,
  StockStatus,
} from './types';

export interface AiQueryableStore {
  branchHealth: BranchHealth[];
  reconciliation: ReconciliationItem[];
  pokItems: PokItem[];
  outstandingDocs: OutstandingDoc[];
  transactions: BranchTransaction[];
}

export const AI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'query_reconciliation',
    description:
      'Query data rekonsiliasi stok cabang (Input Cabang AWAL+IN-OUT vs Last Qty Bot MTS2). Gunakan source="INPUT_ONLY" untuk membandingkan stok yang benar-benar diinput cabang terhadap MTS2, atau source="MTS2_ONLY" untuk melihat selisih SKU yang ada di MTS2 tetapi TIDAK ada di inputan cabang.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branch: {
          type: Type.STRING,
          description:
            'Nama cabang (Jakarta, Karawang, Semarang, Jember, Pontianak, Banjarmasin, Palembang, Pekanbaru, Medan, Makassar, Surabaya) atau "ALL".',
        },
        category: {
          type: Type.STRING,
          description:
            'Kategori sheet: "accessories" (INPUT), "raw_material" (INPUT RM), "manufacturing" (INPUT MFG), atau "ALL".',
        },
        source: {
          type: Type.STRING,
          description:
            'Sumber data: "INPUT_ONLY" (hanya yang ada di inputan cabang), "MTS2_ONLY" (yang tidak ada di inputan cabang), atau "ALL". Default "INPUT_ONLY".',
        },
        status: {
          type: Type.STRING,
          description:
            'Status selisih: "DISCREPANCY" (hanya yang ada selisih), "surplus_input", "minus_input", "sesuai", atau "ALL".',
        },
        locator: {
          type: Type.STRING,
          description: 'Filter tepat atau sebagian nama locator (opsional).',
        },
        search: {
          type: Type.STRING,
          description: 'Kata kunci pencarian Kode SKU, Nama Bahan, atau Locator (opsional).',
        },
        sortBy: {
          type: Type.STRING,
          description:
            'Urutan hasil: "absSelisih", "lastDate", "stokInput", "stokSistem", atau "name".',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Jumlah baris maksimal yang dikembalikan (default 20, maks 50).',
        },
      },
    },
  },
  {
    name: 'query_branch_health',
    description:
      'Ambil ringkasan performa dan selisih per cabang (termasuk pemisahan item yang diinput cabang vs item yang tidak ada di inputan, serta jumlah selisih Accessories, Raw Material, Manufacturing, tanggal update terakhir, dan dokumen outstanding).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branch: {
          type: Type.STRING,
          description: 'Nama cabang spesifik atau "ALL" untuk seluruh 11 cabang.',
        },
      },
    },
  },
  {
    name: 'query_pok',
    description:
      'Query data transit POK dari sheet Update MTS POK beserta status audit (tanpa_dokumen, selisih_parsial, siap_terima, clear) dan umur gantung (agingDays).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branch: {
          type: Type.STRING,
          description: 'Nama cabang tujuan POK atau "ALL".',
        },
        auditStatus: {
          type: Type.STRING,
          description:
            '"HANGING" (semua yang menggantung/bermasalah), "tanpa_dokumen", "selisih_parsial", "siap_terima", "clear", atau "ALL". Default "HANGING".',
        },
        minAgingDays: {
          type: Type.INTEGER,
          description: 'Filter item dengan umur >= N hari sejak Movement Date (opsional).',
        },
        search: {
          type: Type.STRING,
          description: 'Kata kunci Search Key, Nama Barang, Locator POK, atau No. Dokumen.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Jumlah baris maksimal (default 20, maks 50).',
        },
      },
    },
  },
  {
    name: 'query_outstanding_docs',
    description:
      'Query dokumen outstanding dari sheet Tarikan Bot (Draft / In Progress) berdasarkan area/cabang, menu transaksi, status dokumen, atau kata kunci.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        area: {
          type: Type.STRING,
          description: 'Nama cabang / area (misal Jakarta, Karawang, atau "ALL").',
        },
        status: {
          type: Type.STRING,
          description: 'Status dokumen (Draft, In Progress, atau "ALL").',
        },
        menu: {
          type: Type.STRING,
          description: 'Jenis menu dokumen (misal Material Movement, Customer Return, atau "ALL").',
        },
        search: {
          type: Type.STRING,
          description: 'Kata kunci No. Dokumen atau Created By.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Jumlah baris maksimal (default 20, maks 50).',
        },
      },
    },
  },
  {
    name: 'query_transactions',
    description:
      'Query log baris inputan mentah (AWAL, IN, OUT) dari sheet cabang untuk menelusuri riwayat transaksi suatu SKU, locator, atau cabang.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branch: {
          type: Type.STRING,
          description: 'Nama cabang atau "ALL".',
        },
        category: {
          type: Type.STRING,
          description: '"accessories", "raw_material", "manufacturing", atau "ALL".',
        },
        ioType: {
          type: Type.STRING,
          description: '"AWAL", "IN", "OUT", atau "ALL".',
        },
        locator: {
          type: Type.STRING,
          description: 'Filter locator (opsional).',
        },
        search: {
          type: Type.STRING,
          description: 'Kata kunci kode SKU, nama bahan, atau nomor dokumen.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Jumlah entri terbaru maksimal (default 25, maks 60).',
        },
      },
    },
  },
];

function clampLimit(val: unknown, fallback: number, max: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function asStr(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val.trim() : fallback;
}

export function executeAiToolCall(
  store: AiQueryableStore,
  toolName: string,
  rawArgs: Record<string, unknown> = {},
  callIndex = 0
): { responsePayload: Record<string, unknown>; dataset?: AiResultDataset } {
  if (toolName === 'query_reconciliation') {
    const branch = (asStr(rawArgs.branch, 'ALL') || 'ALL') as BranchName | 'ALL';
    const category = (asStr(rawArgs.category, 'ALL') || 'ALL') as CategoryType | 'ALL';
    const source = (asStr(rawArgs.source, 'INPUT_ONLY') || 'INPUT_ONLY') as ReconciliationSourceFilter;
    const status = (asStr(rawArgs.status, 'ALL') || 'ALL') as StockStatus | 'ALL' | 'DISCREPANCY';
    const locatorQuery = asStr(rawArgs.locator);
    const search = asStr(rawArgs.search);
    const sortBy = (asStr(rawArgs.sortBy, 'absSelisih') || 'absSelisih') as ReconciliationSortBy;
    const limit = clampLimit(rawArgs.limit, 20, 50);

    let items = filterReconciliation(store.reconciliation, {
      branch,
      category,
      source,
      status,
      locator: 'ALL',
      search,
      sortBy,
    });

    if (locatorQuery && locatorQuery !== 'ALL') {
      const lq = locatorQuery.toLowerCase();
      items = items.filter((r) => r.locator.toLowerCase().includes(lq));
    }

    let totalInput = 0;
    let totalSistem = 0;
    let totalAbsSelisih = 0;
    let mismatchCount = 0;

    for (const item of items) {
      totalInput += item.stokInput;
      totalSistem += item.stokSistem;
      totalAbsSelisih += item.absSelisih;
      if (item.status !== 'sesuai') mismatchCount++;
    }

    const sliced = items.slice(0, limit);
    const sourceLabel =
      source === 'INPUT_ONLY'
        ? 'Sesuai yang Diinput'
        : source === 'MTS2_ONLY'
          ? 'Yang Tidak Ada di Inputan'
          : 'Semua Sumber';

    return {
      responsePayload: {
        totalMatched: items.length,
        mismatchCount,
        totalInput: round2(totalInput),
        totalSistem: round2(totalSistem),
        totalAbsSelisih: round2(totalAbsSelisih),
        returnedRows: sliced.length,
        rows: sliced.map((r) => ({
          branch: r.branch,
          category: r.category,
          locator: r.locator,
          kode: r.kode,
          namaBahan: r.namaBahan,
          uom: r.uom,
          awal: r.awal,
          masuk: r.masuk,
          keluar: r.keluar,
          stokInput: r.stokInput,
          stokSistem: r.stokSistem,
          selisih: r.selisih,
          status: r.status,
          lastDate: r.lastDate || null,
          txCount: r.txCount,
        })),
      },
      dataset: {
        id: `rec-${callIndex}-${Date.now()}`,
        kind: 'reconciliation',
        title: `Data Rekonsiliasi (${sourceLabel})`,
        subtitle: `Cabang: ${branch} · Kategori: ${category} · Menampilkan ${sliced.length} dari ${items.length} SKU`,
        totalMatched: items.length,
        rows: sliced as unknown as Array<Record<string, unknown>>,
      },
    };
  }

  if (toolName === 'query_branch_health') {
    const branch = asStr(rawArgs.branch, 'ALL') || 'ALL';
    const targetBranches =
      branch !== 'ALL'
        ? store.branchHealth.filter((b) => b.branch.toLowerCase() === branch.toLowerCase())
        : store.branchHealth;

    const rows = targetBranches.map((b) => {
      const brItems = store.reconciliation.filter((r) => r.branch === b.branch);
      const inputItems = brItems.filter((r) => r.txCount > 0);
      const mts2OnlyItems = brItems.filter((r) => r.txCount === 0);

      return {
        branch: b.branch,
        lastTxDate: b.lastTxDate || '-',
        inputSkuCount: inputItems.length,
        inputDiscrepancySku: inputItems.filter((r) => r.status !== 'sesuai').length,
        mts2OnlySkuCount: mts2OnlyItems.length,
        discrepancyAcc: inputItems.filter((r) => r.category === 'accessories' && r.status !== 'sesuai').length,
        discrepancyRm: inputItems.filter((r) => r.category === 'raw_material' && r.status !== 'sesuai').length,
        discrepancyMfg: inputItems.filter((r) => r.category === 'manufacturing' && r.status !== 'sesuai').length,
        totalInputQty: round2(inputItems.reduce((s, r) => s + r.stokInput, 0)),
        totalSystemForInputQty: round2(inputItems.reduce((s, r) => s + r.stokSistem, 0)),
        totalAbsInputSelisih: round2(inputItems.reduce((s, r) => s + r.absSelisih, 0)),
        totalAbsMts2OnlySelisih: round2(mts2OnlyItems.reduce((s, r) => s + r.absSelisih, 0)),
        outstandingDocsCount: b.outstandingDocsCount,
      };
    });

    return {
      responsePayload: {
        branchCount: rows.length,
        rows,
      },
      dataset: {
        id: `bh-${callIndex}-${Date.now()}`,
        kind: 'branch_health',
        title: 'Ringkasan Kesehatan Stok per Cabang',
        subtitle: `Memisahkan stok yang diinput cabang vs yang tidak ada di inputan (${rows.length} cabang)`,
        totalMatched: rows.length,
        rows,
      },
    };
  }

  if (toolName === 'query_pok') {
    const branch = asStr(rawArgs.branch, 'ALL') || 'ALL';
    const auditStatus = asStr(rawArgs.auditStatus, 'HANGING') || 'HANGING';
    const minAging =
      rawArgs.minAgingDays !== undefined ? Number(rawArgs.minAgingDays) : undefined;
    const search = asStr(rawArgs.search).toLowerCase();
    const limit = clampLimit(rawArgs.limit, 20, 50);

    let branchList = store.pokItems;
    if (branch !== 'ALL') {
      branchList = branchList.filter((p) => p.cabang.toLowerCase() === branch.toLowerCase());
    }
    const summary = analyzePokData(branchList);

    let list = branchList;
    if (auditStatus === 'HANGING') {
      list = list.filter((p) => p.auditStatus !== 'clear');
    } else if (auditStatus !== 'ALL') {
      list = list.filter((p) => p.auditStatus === auditStatus);
    }

    if (minAging !== undefined && Number.isFinite(minAging)) {
      list = list.filter((p) => p.agingDays !== null && p.agingDays >= minAging);
    }

    if (search) {
      list = list.filter(
        (p) =>
          p.locator.toLowerCase().includes(search) ||
          p.searchKey.toLowerCase().includes(search) ||
          p.name.toLowerCase().includes(search) ||
          p.docNo.toLowerCase().includes(search) ||
          p.cabang.toLowerCase().includes(search)
      );
    }

    const sliced = list.slice(0, limit);
    return {
      responsePayload: {
        summary: {
          hangingSkuCount: summary.hangingSkuCount,
          noDocCount: summary.noDocCount,
          partialMismatchCount: summary.partialMismatchCount,
          readyToReceiveCount: summary.readyToReceiveCount,
          totalHangingQty: summary.totalHangingQty,
          agingBuckets: summary.agingBuckets,
        },
        totalMatched: list.length,
        returnedRows: sliced.length,
        rows: sliced.map((p) => ({
          cabang: p.cabang,
          locator: p.locator,
          searchKey: p.searchKey,
          name: p.name,
          uom: p.uom,
          lastQty: p.lastQty,
          moveQty: p.moveQty,
          selisih: p.selisih,
          docNo: p.docNo,
          movementDate: p.movementDate,
          agingDays: p.agingDays,
          auditStatus: p.auditStatus,
        })),
      },
      dataset: {
        id: `pok-${callIndex}-${Date.now()}`,
        kind: 'pok',
        title: 'Data Transit POK (Update MTS POK)',
        subtitle: `Cabang: ${branch} · Status: ${auditStatus} · Menampilkan ${sliced.length} dari ${list.length} item`,
        totalMatched: list.length,
        rows: sliced as unknown as Array<Record<string, unknown>>,
      },
    };
  }

  if (toolName === 'query_outstanding_docs') {
    const area = asStr(rawArgs.area, 'ALL') || 'ALL';
    const status = asStr(rawArgs.status, 'ALL') || 'ALL';
    const menu = asStr(rawArgs.menu, 'ALL') || 'ALL';
    const search = asStr(rawArgs.search).toLowerCase();
    const limit = clampLimit(rawArgs.limit, 20, 50);

    let list = store.outstandingDocs;
    if (area !== 'ALL') {
      list = list.filter((d) => d.area.toLowerCase().includes(area.toLowerCase()));
    }
    if (status !== 'ALL') {
      list = list.filter((d) => d.status.toLowerCase() === status.toLowerCase());
    }
    if (menu !== 'ALL') {
      list = list.filter((d) => d.menu.toLowerCase().includes(menu.toLowerCase()));
    }
    if (search) {
      list = list.filter(
        (d) =>
          d.docNo.toLowerCase().includes(search) ||
          d.createdBy.toLowerCase().includes(search) ||
          d.menu.toLowerCase().includes(search)
      );
    }

    const sliced = list.slice(0, limit);
    return {
      responsePayload: {
        totalMatched: list.length,
        returnedRows: sliced.length,
        rows: sliced,
      },
      dataset: {
        id: `out-${callIndex}-${Date.now()}`,
        kind: 'outstanding',
        title: 'Dokumen Outstanding Bot (Tarikan)',
        subtitle: `Area: ${area} · Menampilkan ${sliced.length} dari ${list.length} dokumen`,
        totalMatched: list.length,
        rows: sliced as unknown as Array<Record<string, unknown>>,
      },
    };
  }

  if (toolName === 'query_transactions') {
    const branch = asStr(rawArgs.branch, 'ALL') || 'ALL';
    const category = asStr(rawArgs.category, 'ALL') || 'ALL';
    const ioType = asStr(rawArgs.ioType, 'ALL').toUpperCase() || 'ALL';
    const locator = asStr(rawArgs.locator).toLowerCase();
    const search = asStr(rawArgs.search).toLowerCase();
    const limit = clampLimit(rawArgs.limit, 25, 60);

    let list = store.transactions;
    if (branch !== 'ALL') list = list.filter((t) => t.branch.toLowerCase() === branch.toLowerCase());
    if (category !== 'ALL') list = list.filter((t) => t.category === category);
    if (ioType !== 'ALL') list = list.filter((t) => t.ioType === ioType);
    if (locator) list = list.filter((t) => t.locator.toLowerCase().includes(locator));
    if (search) {
      list = list.filter(
        (t) =>
          t.kode.toLowerCase().includes(search) ||
          t.namaBahan.toLowerCase().includes(search) ||
          t.docNo.toLowerCase().includes(search) ||
          t.locator.toLowerCase().includes(search)
      );
    }

    const total = list.length;
    const sliced = list.slice(Math.max(0, total - limit)).reverse();
    return {
      responsePayload: {
        totalMatched: total,
        returnedRows: sliced.length,
        rows: sliced,
      },
      dataset: {
        id: `tx-${callIndex}-${Date.now()}`,
        kind: 'transactions',
        title: 'Log Transaksi Inputan Cabang',
        subtitle: `Cabang: ${branch} · Tipe: ${ioType} · Menampilkan ${sliced.length} dari ${total} entri`,
        totalMatched: total,
        rows: sliced as unknown as Array<Record<string, unknown>>,
      },
    };
  }

  return {
    responsePayload: { error: `Tool tidak dikenal: ${toolName}` },
  };
}
