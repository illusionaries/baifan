/** 消费记录（已归一化，金额单位：元） */
export interface Txn {
  /** 交易时间 "2025-12-30 17:16:52" */
  time: string
  /** 商户 / 窗口名，已 trim */
  merchant: string
  /** 消费金额，正数（元） */
  amount: number
  /** 交易后卡余额（元）；上游缺失为 null */
  balance: number | null
}

export interface MerchantStat {
  name: string
  /** 合计消费（元） */
  amount: number
  /** 笔数 */
  count: number
  /** 单笔均价（元） */
  avg: number
  /** 占比 0-1 */
  share: number
  /** 最近一次消费时间 */
  last: string
}

export interface DayStat {
  /** YYYY-MM-DD */
  date: string
  amount: number
  count: number
}

export interface SlotStat {
  key: 'breakfast' | 'lunch' | 'dinner' | 'night'
  label: string
  /** 覆盖的钟点，如 "05–09" */
  range: string
  amount: number
  count: number
  share: number
}

export interface KindStat {
  key: 'canteen' | 'drink' | 'store' | 'other'
  label: string
  amount: number
  count: number
  share: number
}

export interface Insight {
  label: string
  value: string
  note: string
}

export interface ReportSummary {
  /** 总支出（元），只统计消费 */
  spend: number
  /** 总存入（充值/补助/退款，元） */
  income: number
  /** 消费笔数 */
  spendCount: number
  /** 存入笔数 */
  incomeCount: number
  /** 去过的窗口数 */
  merchantCount: number
  /** 有消费的天数 */
  activeDays: number
  /** 有消费的天均 */
  avgPerActiveDay: number
  /** 单笔均价 */
  avgPerTxn: number
  /** 每周平均笔数 */
  perWeek: number
  maxTxn: { amount: number; merchant: string; time: string } | null
  topDay: { date: string; amount: number; count: number } | null
  /** 最长连续有消费天数 */
  streak: number
  first: string | null
  last: string | null
}

export interface Report {
  meta: {
    account: string
    year: number
    from: string
    to: string
    /** ISO 抓取时间 */
    fetchedAt: string
    source: string
    txnCount: number
  }
  summary: ReportSummary
  merchants: MerchantStat[]
  daily: DayStat[]
  monthly: { month: number; amount: number; count: number }[]
  hourly: number[]
  /** 7 × 24 笔数，0 = 周一 */
  heat: number[][]
  weekly: number[]
  slots: SlotStat[]
  kinds: KindStat[]
  balance: { time: string; value: number }[]
  transactions: Txn[]
  insights: Insight[]
}

/** 报告接口的响应：报告本体 + 本次会话凭据，前端存下来换年份不用重新登录 */
export interface ReportResponse extends Report {
  session: {
    account: string
    hallticket: string
  }
}
