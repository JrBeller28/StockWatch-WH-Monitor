export type BranchName =
  | 'Jakarta'
  | 'Karawang'
  | 'Semarang'
  | 'Jember'
  | 'Pontianak'
  | 'Banjarmasin'
  | 'Palembang'
  | 'Pekanbaru'
  | 'Medan'
  | 'Makassar'
  | 'Surabaya';

export type CategoryType = 'accessories' | 'raw_material' | 'manufacturing';

export type StockStatus = 'sesuai' | 'surplus_input' | 'minus_input';

export type PokAuditStatus =
  | 'tanpa_dokumen'
  | 'selisih_parsial'
  | 'siap_terima'
  | 'clear';

export interface BranchTabConfig {
  branch: BranchName;
  pubId: string;
  baseUrl: string;
  fallbackGids: {
    INPUT?: string;
    'INPUT RM'?: string;
    'INPUT MFG'?: string;
  };
}

export interface BotInfo {
  lastUpdatedOut1: string;
  totalRowsOut1: number;
  sourceOut1: string;
  mts2PulledAt: string;
  mts2Period: string;
  mts2TotalRows: number;
  tarikanPulledAt: string;
  tarikanTotalRows: number;
  pokTotalRows: number;
}

export interface Mts2Item {
  whGroup: string;
  whType: string;
  area: string;
  locator: string;
  parentGroup: string;
  classification: string;
  searchKey: string;
  name: string;
  uom: string;
  startQty: number;
  mrExternal: number;
  mrInternal: number;
  prodPlus: number;
  shipExtMinus: number;
  shipIntMinus: number;
  adjPlus: number;
  internalUse: number;
  lastQty: number;
}

export interface BranchTransaction {
  branch: BranchName;
  category: CategoryType;
  date: string;
  namaBahan: string;
  qty: number;
  uom: string;
  ioType: 'AWAL' | 'IN' | 'OUT';
  locator: string;
  locatorTo: string;
  docNo: string;
  keterangan: string;
  kode: string;
}

export interface BranchAggregatedItem {
  branch: BranchName;
  category: CategoryType;
  locator: string;
  kode: string;
  namaBahan: string;
  uom: string;
  awal: number;
  masuk: number;
  keluar: number;
  stokInput: number;
  txCount: number;
  lastDate: string;
}

export interface ReconciliationItem {
  id: string;
  branch: BranchName;
  category: CategoryType;
  locator: string;
  kode: string;
  namaBahan: string;
  uom: string;
  awal: number;
  masuk: number;
  keluar: number;
  stokInput: number;
  stokSistem: number;
  selisih: number;
  absSelisih: number;
  status: StockStatus;
  whType: string;
  whGroup: string;
  txCount: number;
  lastDate: string;
}

export interface OutstandingDoc {
  menu: string;
  status: string;
  createdBy: string;
  docNo: string;
  docDate: string;
  area: string;
}

export interface PokItem {
  id: string;
  locator: string;
  searchKey: string;
  name: string;
  uom: string;
  startQty: number;
  mr: number;
  crPlus: number;
  matToPlus: number;
  prodPlus: number;
  shipMinus: number;
  vendRetMinus: number;
  matFromMinus: number;
  pMinus: number;
  adjPlus: number;
  lastQty: number;
  moveQty: number;
  selisih: number;
  absSelisih: number;
  docNo: string;
  cabang: string;
  movementDate: string;
  auditStatus: PokAuditStatus;
  agingDays: number | null;
}

export interface PokBranchBreakdown {
  cabang: string;
  hangingCount: number;
  noDocCount: number;
  partialCount: number;
  readyCount: number;
  totalLastQty: number;
  totalAbsSelisih: number;
}

export interface PokAnalysisSummary {
  totalActiveRows: number;
  hangingSkuCount: number;
  noDocCount: number;
  partialMismatchCount: number;
  readyToReceiveCount: number;
  clearCount: number;
  totalHangingQty: number;
  totalAbsSelisih: number;
  agingBuckets: {
    over14Days: number;
    days7To14: number;
    under7Days: number;
    noDate: number;
  };
  byBranch: PokBranchBreakdown[];
  topInsights: string[];
}

export interface BranchHealth {
  branch: BranchName;
  hasAccessories: boolean;
  hasRawMaterial: boolean;
  hasManufacturing: boolean;
  totalSku: number;
  matchedSku: number;
  discrepancySku: number;
  discrepancyAccessories: number;
  discrepancyRawMaterial: number;
  discrepancyManufacturing: number;
  surplusSku: number;
  minusSku: number;
  totalInputQty: number;
  totalSystemQty: number;
  totalAbsSelisih: number;
  txTotal: number;
  outstandingDocsCount: number;
  lastTxDate: string;
  locators: string[];
  fetchErrors: string[];
}

export interface DashboardSummaryResponse {
  generatedAt: string;
  isCached: boolean;
  botInfo: BotInfo;
  branches: BranchName[];
  branchHealth: BranchHealth[];
  reconciliation: ReconciliationItem[];
  outstandingSummary: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byMenu: Array<{ menu: string; count: number }>;
    byArea: Array<{ area: string; count: number }>;
  };
  mts2Summary: {
    totalRows: number;
    totalLastQty: number;
    areas: string[];
    whTypes: string[];
  };
  pokSummary: PokAnalysisSummary;
  overviewInsights: string[];
  errors: string[];
}

export type AiDatasetKind =
  | 'reconciliation'
  | 'branch_health'
  | 'pok'
  | 'outstanding'
  | 'transactions';

export interface AiResultDataset {
  id: string;
  kind: AiDatasetKind;
  title: string;
  subtitle: string;
  totalMatched: number;
  rows: Array<Record<string, unknown>>;
}

export interface AiAnalyzeResponse {
  answer: string;
  datasets: AiResultDataset[];
  toolsUsed: string[];
}

