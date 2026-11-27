export const money = (n: number, digits = 2): string =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const pct = (share: number, digits = 1): string => `${(share * 100).toFixed(digits)}%`

/** 0 = 周一 */
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
