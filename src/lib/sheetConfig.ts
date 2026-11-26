import { BranchName, BranchTabConfig, CategoryType } from './types';

export const BOT_SHEET_CONFIG = {
  baseUrl:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP',
  fallbackGids: {
    Info: '1342351901',
    MTS2: '263347272',
    Tarikan: '1541449669',
    OUT1: '1097630647',
    'Update MTS POK': '32687697',
  },
};

export const BRANCH_CONFIGS: BranchTabConfig[] = [
  {
    branch: 'Jakarta',
    pubId: '2PACX-1vTYvHfd90ViBTwZutm4l9eL3vFo9oBP1DJNvRiyNVKao-qVlujNmPcWH2A54I61f_P9pQk-DRO7UU4J',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYvHfd90ViBTwZutm4l9eL3vFo9oBP1DJNvRiyNVKao-qVlujNmPcWH2A54I61f_P9pQk-DRO7UU4J',
    fallbackGids: {
      INPUT: '1579556932',
      'INPUT RM': '1980828468',
    },
  },
  {
    branch: 'Karawang',
    pubId: '2PACX-1vT8fGy7KQ89Y7QegT40NlrZ13XP_Cjs5DLhw4jRHM8s7QmOViWkXIfK_SJTmPbbBkVbo4lj2sbVrZdC',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8fGy7KQ89Y7QegT40NlrZ13XP_Cjs5DLhw4jRHM8s7QmOViWkXIfK_SJTmPbbBkVbo4lj2sbVrZdC',
    fallbackGids: {
      INPUT: '1724432219',
      'INPUT RM': '1708742422',
    },
  },
  {
    branch: 'Semarang',
    pubId: '2PACX-1vRBUU-QYFygt7P4AVaGyh3oOB5nlWC4l4Qj3HNdcmVvzuc3JL7PI2nZB4BCj1TnnsswmlXUAyLISAFl',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBUU-QYFygt7P4AVaGyh3oOB5nlWC4l4Qj3HNdcmVvzuc3JL7PI2nZB4BCj1TnnsswmlXUAyLISAFl',
    fallbackGids: {
      INPUT: '1715210071',
      'INPUT RM': '1208274745',
    },
  },
  {
    branch: 'Jember',
    pubId: '2PACX-1vTX4vn0VDZELkxI8O1Uv2Bqbq3KwPbG7NNxykH_0YkH76jzJg5NkKFTlzESFNT-C9STwxESuLNS0NQr',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vTX4vn0VDZELkxI8O1Uv2Bqbq3KwPbG7NNxykH_0YkH76jzJg5NkKFTlzESFNT-C9STwxESuLNS0NQr',
    fallbackGids: {
      INPUT: '391806059',
      'INPUT RM': '575221011',
      'INPUT MFG': '1713589752',
    },
  },
  {
    branch: 'Pontianak',
    pubId: '2PACX-1vT1OfukRl_7gzFFkng2UoHXMHFj0QIpfFVJ0_yts2_TEdHvkDu1WNOdhLf1XERMBqLTuAI2xBDuCMPA',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1OfukRl_7gzFFkng2UoHXMHFj0QIpfFVJ0_yts2_TEdHvkDu1WNOdhLf1XERMBqLTuAI2xBDuCMPA',
    fallbackGids: {
      INPUT: '86334787',
      'INPUT RM': '1973977912',
    },
  },
  {
    branch: 'Banjarmasin',
    pubId: '2PACX-1vTZJYS2snFQr3a-k4Wk7WA_TMHC_WCkyzOCfXzW3ICk1r2uAl8lqIpGmhgSqoCVDj9LQxfk5L-dni79',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZJYS2snFQr3a-k4Wk7WA_TMHC_WCkyzOCfXzW3ICk1r2uAl8lqIpGmhgSqoCVDj9LQxfk5L-dni79',
    fallbackGids: {
      INPUT: '1074989888',
      'INPUT RM': '782051353',
      'INPUT MFG': '2123285768',
    },
  },
  {
    branch: 'Palembang',
    pubId: '2PACX-1vQKZ2HarsLfTds7gmieqUkvRlN7oSZI7LgW5skz17jpLUAcriMGuHhNt7rGQUg6gWm0T1FaQNyp1tqN',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKZ2HarsLfTds7gmieqUkvRlN7oSZI7LgW5skz17jpLUAcriMGuHhNt7rGQUg6gWm0T1FaQNyp1tqN',
    fallbackGids: {
      INPUT: '721129869',
      'INPUT RM': '625606577',
      'INPUT MFG': '1729317064',
    },
  },
  {
    branch: 'Pekanbaru',
    pubId: '2PACX-1vQOxM_xwqaOx9JQflD6ufqPpM78BF78w9_Duv9XMyzRepyb9leq97hC2XIwem2_BMZQ9ESsXpOEPwsl',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQOxM_xwqaOx9JQflD6ufqPpM78BF78w9_Duv9XMyzRepyb9leq97hC2XIwem2_BMZQ9ESsXpOEPwsl',
    fallbackGids: {
      INPUT: '593251871',
      'INPUT RM': '410520804',
      'INPUT MFG': '2115760078',
    },
  },
  {
    branch: 'Medan',
    pubId: '2PACX-1vQ2j16rLoQeldKkJRjs4OoapTMxdVQQmcSgNf1gpzErMXB6kPAp7uN5c9lL5E_rdtXW6jYybss2onyi',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2j16rLoQeldKkJRjs4OoapTMxdVQQmcSgNf1gpzErMXB6kPAp7uN5c9lL5E_rdtXW6jYybss2onyi',
    fallbackGids: {
      INPUT: '1200581450',
      'INPUT RM': '59778302',
      'INPUT MFG': '1786249293',
    },
  },
  {
    branch: 'Makassar',
    pubId: '2PACX-1vQd2MVYkppPyG0F3nMIXR6Ai6dJCgav6QqBtSNi3egTZS8WN9MzEjnUGgahu2u133B8aCQ83rYoB-sY',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQd2MVYkppPyG0F3nMIXR6Ai6dJCgav6QqBtSNi3egTZS8WN9MzEjnUGgahu2u133B8aCQ83rYoB-sY',
    fallbackGids: {
      INPUT: '1091276779',
      'INPUT RM': '230140049',
      'INPUT MFG': '1790773591',
    },
  },
  {
    branch: 'Surabaya',
    pubId: '2PACX-1vTeVl9VyYWmkKl57ECvm05J_rD_hQed2joRFrqH_YIbs6oldm1F8NO4DeXH4JfTqDFJFP1Na44UDvIT',
    baseUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeVl9VyYWmkKl57ECvm05J_rD_hQed2joRFrqH_YIbs6oldm1F8NO4DeXH4JfTqDFJFP1Na44UDvIT',
    fallbackGids: {
      INPUT: '1379708976',
      'INPUT RM': '1638416375',
      'INPUT MFG': '1336119050',
    },
  },
];

export const ALL_BRANCHES: BranchName[] = BRANCH_CONFIGS.map((b) => b.branch);

export const CATEGORY_TAB_MAP: Record<CategoryType, 'INPUT' | 'INPUT RM' | 'INPUT MFG'> = {
  accessories: 'INPUT',
  raw_material: 'INPUT RM',
  manufacturing: 'INPUT MFG',
};

export const CATEGORY_LABELS: Record<CategoryType, string> = {
  accessories: 'Accessories (INPUT)',
  raw_material: 'Raw Material (INPUT RM)',
  manufacturing: 'Manufacturing (INPUT MFG)',
};

export const EXCLUDED_ACCESSORIES_LOCATOR_PREFIXES = [
  'AMT-KRW',
  'AMT-JKT',
  'AMT-SMG',
] as const;

export function isExcludedLocatorForCategory(
  locator: string,
  category: CategoryType
): boolean {
  if (category !== 'accessories') return false;
  const upper = locator.trim().toUpperCase();
  return EXCLUDED_ACCESSORIES_LOCATOR_PREFIXES.some((prefix) =>
    upper.startsWith(prefix)
  );
}

