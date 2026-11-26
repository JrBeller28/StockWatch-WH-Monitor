import 'dotenv/config';
import { GoogleGenAI, ThinkingLevel, type Content, type Part } from '@google/genai';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { AI_TOOL_DECLARATIONS, executeAiToolCall } from './src/lib/aiTools';
import {
  ALL_BRANCHES,
  BOT_SHEET_CONFIG,
  BRANCH_CONFIGS,
  CATEGORY_TAB_MAP,
} from './src/lib/sheetConfig';
import {
  analyzePokData,
  buildOverviewInsights,
  buildReconciliation,
  extractPubHtmlTabs,
  parseBotInfoCsv,
  parseBranchInputCsv,
  parseMts2Csv,
  parsePokCsv,
  parseTarikanCsv,
  round2,
  type BranchCategoryInputResult,
} from './src/lib/sheetParser';
import type {
  AiAnalyzeResponse,
  AiResultDataset,
  BotInfo,
  BranchHealth,
  BranchName,
  BranchTransaction,
  CategoryType,
  DashboardSummaryResponse,
  Mts2Item,
  OutstandingDoc,
  PokItem,
  ReconciliationItem,
} from './src/lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25000;

interface SyncedStore {
  generatedAt: string;
  timestampMs: number;
  botInfo: BotInfo;
  branchHealth: BranchHealth[];
  reconciliation: ReconciliationItem[];
  mts2Items: Mts2Item[];
  mts2Areas: string[];
  mts2WhTypes: string[];
  mts2TotalLastQty: number;
  outstandingDocs: OutstandingDoc[];
  pokItems: PokItem[];
  transactions: BranchTransaction[];
  errors: string[];
}

let cachedStore: SyncedStore | null = null;
let inflightSync: Promise<SyncedStore> | null = null;

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'StockWatch-ERP-Monitor/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} untuk ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function next(): Promise<void> {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

async function syncAllSheets(): Promise<SyncedStore> {
  const errors: string[] = [];

  // 1. Discover Bot tabs + fetch Bot Info, MTS2, Tarikan in parallel
  let botTabs: Record<string, string> = { ...BOT_SHEET_CONFIG.fallbackGids };
  try {
    const botHtml = await fetchText(`${BOT_SHEET_CONFIG.baseUrl}/pubhtml`);
    const discovered = extractPubHtmlTabs(botHtml);
    if (Object.keys(discovered).length > 0) {
      botTabs = { ...botTabs, ...discovered };
    }
  } catch (err) {
    errors.push(`Bot pubhtml fallback digunakan: ${(err as Error).message}`);
  }

  const mts2Gid = botTabs['MTS2'] || BOT_SHEET_CONFIG.fallbackGids.MTS2;
  const tarikanGid = botTabs['Tarikan'] || BOT_SHEET_CONFIG.fallbackGids.Tarikan;
  const pokGid = botTabs['Update MTS POK'] || BOT_SHEET_CONFIG.fallbackGids['Update MTS POK'];

  const [infoRes, mts2Res, tarikanRes, pokRes] = await Promise.allSettled([
    fetchText(`${BOT_SHEET_CONFIG.baseUrl}/pub?output=csv`),
    fetchText(`${BOT_SHEET_CONFIG.baseUrl}/pub?gid=${mts2Gid}&single=true&output=csv`),
    fetchText(`${BOT_SHEET_CONFIG.baseUrl}/pub?gid=${tarikanGid}&single=true&output=csv`),
    fetchText(`${BOT_SHEET_CONFIG.baseUrl}/pub?gid=${pokGid}&single=true&output=csv`),
  ]);

  const infoParsed =
    infoRes.status === 'fulfilled'
      ? parseBotInfoCsv(infoRes.value)
      : { lastUpdatedOut1: '-', totalRowsOut1: 0, sourceOut1: '-' };
  if (infoRes.status === 'rejected') {
    errors.push(`Gagal tarik Bot Info: ${infoRes.reason?.message || String(infoRes.reason)}`);
  }

  const mts2Parsed =
    mts2Res.status === 'fulfilled'
      ? parseMts2Csv(mts2Res.value)
      : { period: '-', pulledAt: '-', items: [], nameToCode: new Map<string, string>() };
  if (mts2Res.status === 'rejected') {
    errors.push(`Gagal tarik Bot MTS2: ${mts2Res.reason?.message || String(mts2Res.reason)}`);
  }

  const tarikanParsed =
    tarikanRes.status === 'fulfilled'
      ? parseTarikanCsv(tarikanRes.value)
      : { pulledAt: '-', docs: [] };
  if (tarikanRes.status === 'rejected') {
    errors.push(`Gagal tarik Bot Tarikan: ${tarikanRes.reason?.message || String(tarikanRes.reason)}`);
  }

  const pokItems =
    pokRes.status === 'fulfilled'
      ? parsePokCsv(pokRes.value)
      : [];
  if (pokRes.status === 'rejected') {
    errors.push(`Gagal tarik Update MTS POK: ${pokRes.reason?.message || String(pokRes.reason)}`);
  }

  // 2. Discover tabs for all 11 branches (parallel, capped concurrency)
  const branchTabsList = await runWithConcurrency(BRANCH_CONFIGS, 6, async (cfg) => {
    let tabs: Record<string, string> = { ...cfg.fallbackGids };
    try {
      const html = await fetchText(`${cfg.baseUrl}/pubhtml`, 15000);
      const discovered = extractPubHtmlTabs(html);
      if (Object.keys(discovered).length > 0) {
        tabs = { ...tabs, ...discovered };
      }
    } catch {
      // Fall back quietly to verified GIDs
    }
    return { cfg, tabs };
  });

  // 3. Build fetch tasks for INPUT, INPUT RM, INPUT MFG across all branches
  interface BranchFetchTask {
    branch: BranchName;
    baseUrl: string;
    category: CategoryType;
    gid?: string;
  }

  const tasks: BranchFetchTask[] = [];
  const categories: CategoryType[] = ['accessories', 'raw_material', 'manufacturing'];

  for (const { cfg, tabs } of branchTabsList) {
    for (const category of categories) {
      const tabName = CATEGORY_TAB_MAP[category];
      const gid = tabs[tabName];
      tasks.push({
        branch: cfg.branch,
        baseUrl: cfg.baseUrl,
        category,
        gid,
      });
    }
  }

  const branchResults: BranchCategoryInputResult[] = await runWithConcurrency(
    tasks,
    8,
    async (task): Promise<BranchCategoryInputResult> => {
      if (!task.gid) {
        return {
          branch: task.branch,
          category: task.category,
          aggregated: [],
          transactions: [],
          trackedLocators: new Set<string>(),
          available: false,
        };
      }

      try {
        const csvUrl = `${task.baseUrl}/pub?gid=${task.gid}&single=true&output=csv`;
        const csvText = await fetchText(csvUrl);
        const parsed = parseBranchInputCsv(
          csvText,
          task.branch,
          task.category,
          mts2Parsed.nameToCode
        );
        return {
          branch: task.branch,
          category: task.category,
          aggregated: parsed.aggregated,
          transactions: parsed.transactions,
          trackedLocators: parsed.trackedLocators,
          available: true,
        };
      } catch (err) {
        const msg = `${task.branch} (${CATEGORY_TAB_MAP[task.category]}): ${(err as Error).message}`;
        errors.push(msg);
        return {
          branch: task.branch,
          category: task.category,
          aggregated: [],
          transactions: [],
          trackedLocators: new Set<string>(),
          available: false,
          error: msg,
        };
      }
    }
  );

  // 4. Reconcile Branch Input vs Bot MTS2
  const { reconciliation, branchHealth } = buildReconciliation(
    branchResults,
    mts2Parsed.items,
    tarikanParsed.docs
  );

  const allTransactions = branchResults.flatMap((r) => r.transactions);

  const mts2Areas = Array.from(
    new Set(mts2Parsed.items.map((i) => i.area).filter(Boolean))
  ).sort();
  const mts2WhTypes = Array.from(
    new Set(mts2Parsed.items.map((i) => i.whType).filter(Boolean))
  ).sort();
  const mts2TotalLastQty = round2(
    mts2Parsed.items.reduce((acc, item) => acc + item.lastQty, 0)
  );

  const botInfo: BotInfo = {
    lastUpdatedOut1: infoParsed.lastUpdatedOut1,
    totalRowsOut1: infoParsed.totalRowsOut1,
    sourceOut1: infoParsed.sourceOut1,
    mts2PulledAt: mts2Parsed.pulledAt,
    mts2Period: mts2Parsed.period,
    mts2TotalRows: mts2Parsed.items.length,
    tarikanPulledAt: tarikanParsed.pulledAt,
    tarikanTotalRows: tarikanParsed.docs.length,
    pokTotalRows: pokItems.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    timestampMs: Date.now(),
    botInfo,
    branchHealth,
    reconciliation,
    mts2Items: mts2Parsed.items,
    mts2Areas,
    mts2WhTypes,
    mts2TotalLastQty,
    outstandingDocs: tarikanParsed.docs,
    pokItems,
    transactions: allTransactions,
    errors,
  };
}

async function getStore(forceRefresh = false): Promise<{ store: SyncedStore; isCached: boolean }> {
  if (!forceRefresh && cachedStore && Date.now() - cachedStore.timestampMs < CACHE_TTL_MS) {
    return { store: cachedStore, isCached: true };
  }

  if (!inflightSync) {
    inflightSync = syncAllSheets()
      .then((fresh) => {
        cachedStore = fresh;
        return fresh;
      })
      .finally(() => {
        inflightSync = null;
      });
  }

  const store = await inflightSync;
  return { store, isCached: false };
}

function buildOutstandingSummary(docs: OutstandingDoc[]) {
  const byStatusMap = new Map<string, number>();
  const byMenuMap = new Map<string, number>();
  const byAreaMap = new Map<string, number>();

  for (const d of docs) {
    byStatusMap.set(d.status, (byStatusMap.get(d.status) ?? 0) + 1);
    byMenuMap.set(d.menu, (byMenuMap.get(d.menu) ?? 0) + 1);
    byAreaMap.set(d.area, (byAreaMap.get(d.area) ?? 0) + 1);
  }

  const toSorted = <K extends string>(m: Map<string, number>, keyName: K) =>
    Array.from(m.entries())
      .map(([k, count]) => ({ [keyName]: k, count }) as Record<K, string> & { count: number })
      .sort((a, b) => b.count - a.count);

  return {
    total: docs.length,
    byStatus: toSorted(byStatusMap, 'status'),
    byMenu: toSorted(byMenuMap, 'menu'),
    byArea: toSorted(byAreaMap, 'area'),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      cached: Boolean(cachedStore),
      generatedAt: cachedStore?.generatedAt ?? null,
    });
  });

  app.get('/api/dashboard', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      const { store, isCached } = await getStore(force);
      const branchFilter = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';

      const filteredReconciliation =
        branchFilter && branchFilter !== 'ALL'
          ? store.reconciliation.filter((r) => r.branch === branchFilter)
          : store.reconciliation;

      const filteredDocs =
        branchFilter && branchFilter !== 'ALL'
          ? store.outstandingDocs.filter(
              (d) => d.area.toLowerCase() === branchFilter.toLowerCase()
            )
          : store.outstandingDocs;

      const filteredPok =
        branchFilter && branchFilter !== 'ALL'
          ? store.pokItems.filter(
              (p) => p.cabang.toLowerCase() === branchFilter.toLowerCase()
            )
          : store.pokItems;

      const pokSummary = analyzePokData(filteredPok);
      const filteredBranchHealth =
        branchFilter && branchFilter !== 'ALL'
          ? store.branchHealth.filter((b) => b.branch === branchFilter)
          : store.branchHealth;

      const payload: DashboardSummaryResponse = {
        generatedAt: store.generatedAt,
        isCached,
        botInfo: store.botInfo,
        branches: ALL_BRANCHES,
        branchHealth: store.branchHealth,
        reconciliation: filteredReconciliation,
        outstandingSummary: buildOutstandingSummary(filteredDocs),
        mts2Summary: {
          totalRows: store.mts2Items.length,
          totalLastQty: store.mts2TotalLastQty,
          areas: store.mts2Areas,
          whTypes: store.mts2WhTypes,
        },
        pokSummary,
        overviewInsights: buildOverviewInsights(
          filteredBranchHealth,
          filteredReconciliation,
          pokSummary
        ),
        errors: store.errors,
      };

      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: `Gagal menyinkronkan data Google Sheets: ${(err as Error).message}`,
      });
    }
  });

  app.post('/api/sync', async (_req, res) => {
    try {
      const { store } = await getStore(true);
      res.json({
        ok: true,
        generatedAt: store.generatedAt,
        reconciliationCount: store.reconciliation.length,
        mts2Count: store.mts2Items.length,
        errors: store.errors,
      });
    } catch (err) {
      res.status(500).json({
        error: `Sinkronisasi gagal: ${(err as Error).message}`,
      });
    }
  });

  app.get('/api/transactions', async (req, res) => {
    try {
      const { store } = await getStore(false);
      const branch = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';
      const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const locator = typeof req.query.locator === 'string' ? req.query.locator.trim() : '';
      const kode = typeof req.query.kode === 'string' ? req.query.kode.trim() : '';
      const ioType = typeof req.query.ioType === 'string' ? req.query.ioType.trim().toUpperCase() : '';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const limit = Math.min(Number(req.query.limit) || 200, 1000);

      let list = store.transactions;
      if (branch && branch !== 'ALL') list = list.filter((t) => t.branch === branch);
      if (category && category !== 'ALL') list = list.filter((t) => t.category === category);
      if (locator) list = list.filter((t) => t.locator === locator);
      if (kode) list = list.filter((t) => t.kode === kode);
      if (ioType && ioType !== 'ALL') list = list.filter((t) => t.ioType === ioType);
      if (search) {
        list = list.filter(
          (t) =>
            t.kode.toLowerCase().includes(search) ||
            t.namaBahan.toLowerCase().includes(search) ||
            t.locator.toLowerCase().includes(search) ||
            t.docNo.toLowerCase().includes(search)
        );
      }

      const total = list.length;
      // Show newest entries first (sheets append chronologically at the bottom)
      const items = list.slice(Math.max(0, total - limit)).reverse();
      res.json({ total, items });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/mts2', async (req, res) => {
    try {
      const { store } = await getStore(false);
      const area = typeof req.query.area === 'string' ? req.query.area.trim() : '';
      const whType = typeof req.query.whType === 'string' ? req.query.whType.trim() : '';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const onlyNonZero = req.query.onlyNonZero === '1';
      const limit = Math.min(Number(req.query.limit) || 250, 1000);

      let list = store.mts2Items;
      if (area && area !== 'ALL') {
        list = list.filter((i) => i.area.toLowerCase() === area.toLowerCase());
      }
      if (whType && whType !== 'ALL') {
        list = list.filter((i) => i.whType === whType);
      }
      if (onlyNonZero) {
        list = list.filter((i) => Math.abs(i.lastQty) >= 0.01);
      }
      if (search) {
        list = list.filter(
          (i) =>
            i.searchKey.toLowerCase().includes(search) ||
            i.name.toLowerCase().includes(search) ||
            i.locator.toLowerCase().includes(search) ||
            i.whGroup.toLowerCase().includes(search)
        );
      }

      res.json({
        total: list.length,
        areas: store.mts2Areas,
        whTypes: store.mts2WhTypes,
        items: list.slice(0, limit),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/outstanding', async (req, res) => {
    try {
      const { store } = await getStore(false);
      const area = typeof req.query.area === 'string' ? req.query.area.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const menu = typeof req.query.menu === 'string' ? req.query.menu.trim() : '';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const limit = Math.min(Number(req.query.limit) || 250, 1000);

      let list = store.outstandingDocs;
      if (area && area !== 'ALL') {
        list = list.filter((d) => d.area.toLowerCase() === area.toLowerCase());
      }
      if (status && status !== 'ALL') {
        list = list.filter((d) => d.status === status);
      }
      if (menu && menu !== 'ALL') {
        list = list.filter((d) => d.menu === menu);
      }
      if (search) {
        list = list.filter(
          (d) =>
            d.docNo.toLowerCase().includes(search) ||
            d.createdBy.toLowerCase().includes(search) ||
            d.menu.toLowerCase().includes(search) ||
            d.area.toLowerCase().includes(search)
        );
      }

      const summary = buildOutstandingSummary(list);
      res.json({
        total: list.length,
        summary,
        items: list.slice(0, limit),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/pok', async (req, res) => {
    try {
      const { store } = await getStore(false);
      const branch = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';
      const auditStatus =
        typeof req.query.auditStatus === 'string' ? req.query.auditStatus.trim() : '';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const limit = Math.min(Number(req.query.limit) || 500, 2000);

      let branchFiltered = store.pokItems;
      if (branch && branch !== 'ALL') {
        branchFiltered = branchFiltered.filter(
          (p) => p.cabang.toLowerCase() === branch.toLowerCase()
        );
      }

      const analysis = analyzePokData(branchFiltered);

      let list = branchFiltered;
      if (auditStatus === 'HANGING') {
        list = list.filter((p) => p.auditStatus !== 'clear');
      } else if (auditStatus && auditStatus !== 'ALL') {
        list = list.filter((p) => p.auditStatus === auditStatus);
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

      res.json({
        total: list.length,
        analysis,
        items: list.slice(0, limit),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/ai/analyze', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        res.status(503).json({
          error:
            'GEMINI_API_KEY belum terkonfigurasi. Silakan periksa API key di panel Settings > Secrets.',
        });
        return;
      }

      const question =
        typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      const branchScope =
        typeof req.body?.branch === 'string' ? req.body.branch.trim() : 'ALL';
      const historyRaw = Array.isArray(req.body?.history) ? req.body.history : [];

      if (!question) {
        res.status(400).json({ error: 'Pertanyaan analisis tidak boleh kosong.' });
        return;
      }

      const { store } = await getStore(false);

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = [
        'Anda adalah Analis Inventori & Audit ERP StockWatch yang membantu tim operasional membaca data Google Sheets cabang dan tarikan Bot MTS2 / Tarikan / Update MTS POK.',
        `Konteks filter cabang aktif saat ini: ${branchScope === 'ALL' ? 'Semua Cabang (11 cabang)' : branchScope}.`,
        `Periode MTS2: ${store.botInfo.mts2Period || '-'}, Terakhir ditarik MTS2: ${store.botInfo.mts2PulledAt || '-'}, OUT1: ${store.botInfo.lastUpdatedOut1 || '-'}.`,
        'Aturan penting:',
        '1. Selalu gunakan tool yang tersedia (query_reconciliation, query_branch_health, query_pok, query_outstanding_docs, query_transactions) untuk mengambil angka dan baris aktual sebelum menjawab. Jangan pernah mengarang angka atau SKU.',
        '2. Kolom MTS2 pada rekonsiliasi utama hanya membandingkan item yang diinput cabang (source="INPUT_ONLY"). Item yang tercatat di MTS2 tetapi belum ada di inputan cabang berada di source="MTS2_ONLY" (Yang Tidak Ada di Inputan).',
        '3. Locator AMT-KRW, AMT-JKT*, dan AMT-SMG* sudah dikecualikan dari kategori Accessories (INPUT) dan hanya dipantau di Raw Material (INPUT RM) jika ada.',
        '4. Jawab dalam Bahasa Indonesia yang ringkas, terstruktur (poin bernomor / bullet), sebutkan angka konkret serta temuan akar masalah dan saran tindak lanjut operasional. Data tabel dari hasil query Anda akan otomatis ditampilkan ke pengguna di bawah jawaban Anda, jadi sebutkan jika data lengkapnya tersaji di tabel hasil.',
      ].join('\n');

      const contents: Content[] = [];
      for (const h of historyRaw.slice(-6)) {
        if (
          h &&
          typeof h.text === 'string' &&
          h.text.trim() &&
          (h.role === 'user' || h.role === 'assistant')
        ) {
          contents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.text.trim() }],
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [
          {
            text:
              branchScope !== 'ALL'
                ? `[Filter Cabang Aktif: ${branchScope}] ${question}`
                : question,
          },
        ],
      });

      const datasets: AiResultDataset[] = [];
      const toolsUsed: string[] = [];
      let finalAnswer = '';

      const isTransientAiError = (err: unknown): boolean => {
        const text = (err as Error)?.message || String(err);
        return (
          text.includes('503') ||
          text.includes('UNAVAILABLE') ||
          text.includes('429') ||
          text.includes('RESOURCE_EXHAUSTED')
        );
      };

      const callModelWithRetry = async () => {
        const delays = [1200, 2400];
        for (let attempt = 0; attempt <= delays.length; attempt++) {
          try {
            return await ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents,
              config: {
                systemInstruction,
                tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            });
          } catch (err) {
            if (attempt < delays.length && isTransientAiError(err)) {
              await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
              continue;
            }
            throw err;
          }
        }
        throw new Error('Gagal memanggil model AI.');
      };

      for (let step = 0; step < 5; step++) {
        const response = await callModelWithRetry();

        const modelContent = response.candidates?.[0]?.content;
        const functionCalls = response.functionCalls;

        if (functionCalls && functionCalls.length > 0 && modelContent) {
          contents.push(modelContent);
          const responseParts: Part[] = [];

          for (let i = 0; i < functionCalls.length; i++) {
            const call = functionCalls[i];
            const toolName = call.name ?? '';
            if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);

            const { responsePayload, dataset } = executeAiToolCall(
              store,
              toolName,
              (call.args as Record<string, unknown>) ?? {},
              step * 10 + i
            );

            if (dataset) {
              datasets.push(dataset);
            }

            responseParts.push({
              functionResponse: {
                id: call.id,
                name: toolName,
                response: { result: responsePayload },
              },
            });
          }

          contents.push({
            role: 'user',
            parts: responseParts,
          });
          continue;
        }

        finalAnswer = (response.text ?? '').trim();
        break;
      }

      if (!finalAnswer) {
        finalAnswer =
          datasets.length > 0
            ? 'Data yang Anda minta telah berhasil ditarik dan ditampilkan pada tabel di bawah ini.'
            : 'Tidak ada ringkasan teks yang dihasilkan untuk pertanyaan tersebut. Coba perjelas filter cabang, kategori, atau kata kunci yang dicari.';
      }

      const payload: AiAnalyzeResponse = {
        answer: finalAnswer,
        datasets,
        toolsUsed,
      };
      res.json(payload);
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
        res.status(503).json({
          error:
            'Layanan model AI sedang mengalami lonjakan trafik sementara (503). Silakan klik tombol Analisis lagi dalam beberapa detik.',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Batas permintaan AI sementara tercapai (429). Silakan tunggu sebentar lalu coba kembali.',
        });
        return;
      }
      res.status(500).json({
        error: `Gagal memproses analisis AI: ${msg}`,
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StockWatch ERP Monitor running on http://localhost:${PORT}`);
    // Pre-warm cache in background without blocking startup
    getStore(false).catch((err) => {
      console.error('Background warm-up failed:', err);
    });
  });
}

startServer();
