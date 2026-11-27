import type { RawRow } from './card'
import type { DayStat, Insight, KindStat, MerchantStat, Report, SlotStat, Txn } from './types'

const SH_TZ = 'Asia/Shanghai'

/** 上海时区的今天，YYYY-MM-DD */
export function todaySH(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: SH_TZ }).format(new Date())
}

export function yearRange(year: number): { from: string; to: string } {
  const from = `${year}-01-01`
  const thisYear = Number(todaySH().slice(0, 4))
  if (year > thisYear) return { from, to: `${year}-12-31` }
  if (year === thisYear) return { from, to: todaySH() }
  return { from, to: `${year}-12-31` }
}

interface Parsed {
  time: string
  date: string
  month: number
  hour: number
  /** 0 = 周一 */
  weekday: number
  merchant: string
  /** 支出，分 */
  out: number
  /** 存入，分 */
  income: number
  balance: number
}

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/

function parseRow(row: RawRow): Parsed | null {
  const time = String(row.OCCTIME ?? '').trim()
  const m = TIME_RE.exec(time)
  if (!m) return null

  const [, y, mo, d, h] = m
  const raw = Number(row.TRANAMT)
  if (!Number.isFinite(raw)) return null

  const cents = Math.round(Math.abs(raw) * 100)
  const balance = Number(row.CARDBAL)

  return {
    time,
    date: `${y}-${mo}-${d}`,
    month: Number(mo),
    hour: Number(h),
    weekday: (new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay() + 6) % 7,
    merchant: String(row.MERCNAME ?? '').replace(/\s+/g, ' ').trim() || '未知窗口',
    out: raw < 0 ? cents : 0,
    income: raw > 0 ? cents : 0,
    balance: Number.isFinite(balance) ? balance : 0,
  }
}

const yuan = (cents: number) => Math.round(cents) / 100
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

const SLOTS: { key: SlotStat['key']; label: string; range: string; hours: number[] }[] = [
  { key: 'breakfast', label: '早餐', range: '05:00–09:59', hours: [5, 6, 7, 8, 9] },
  { key: 'lunch', label: '午餐', range: '10:00–14:59', hours: [10, 11, 12, 13, 14] },
  { key: 'dinner', label: '晚餐', range: '15:00–19:59', hours: [15, 16, 17, 18, 19] },
  { key: 'night', label: '夜宵', range: '20:00–04:59', hours: [20, 21, 22, 23, 0, 1, 2, 3, 4] },
]

const KINDS: { key: KindStat['key']; label: string; re: RegExp }[] = [
  { key: 'store', label: '超市便利', re: /超市|便利|商店|水果|面包|烘焙|蛋糕|零食|物美|全家|罗森|seven|7-?eleven/i },
  { key: 'drink', label: '咖啡饮品', re: /咖啡|奶茶|饮品|水吧|茶水|果汁|酸奶|冰淇淋|coffee|tea/i },
  {
    key: 'canteen',
    label: '食堂档口',
    re: /食堂|餐厅|档口|美食|快餐|简餐|风味|主食|副食|小吃|料理|米饭|套餐|选餐|餐车|家园|学一|农园|燕南|畅春园|勺园|艺园|新学五|合利屋|面|饭|菜|锅|烤|煮|蒸|粥|饼|荤|素|餐/,
  },
  { key: 'other', label: '其它', re: /.*/ },
]

function allDates(from: string, to: string): string[] {
  const out: string[] = []
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let t = start; t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

export interface ComputeArgs {
  account: string
  year: number
  from: string
  to: string
  rows: RawRow[]
}

export function computeReport({ account, year, from, to, rows }: ComputeArgs): Report {
  const parsed = rows.map(parseRow).filter((p): p is Parsed => p !== null)
  const spendTxns = parsed.filter((p) => p.out > 0)
  const incomeTxns = parsed.filter((p) => p.income > 0)

  const spendCents = spendTxns.reduce((s, t) => s + t.out, 0)
  const incomeCents = incomeTxns.reduce((s, t) => s + t.income, 0)

  // —— 商户 ——
  const byMerchant = new Map<string, { cents: number; count: number; last: string }>()
  for (const t of spendTxns) {
    const cur = byMerchant.get(t.merchant)
    if (cur) {
      cur.cents += t.out
      cur.count += 1
      if (t.time > cur.last) cur.last = t.time
    } else byMerchant.set(t.merchant, { cents: t.out, count: 1, last: t.time })
  }
  const merchants: MerchantStat[] = [...byMerchant.entries()]
    .map(([name, v]) => ({
      name,
      amount: yuan(v.cents),
      count: v.count,
      avg: yuan(v.cents / v.count),
      share: pct(v.cents, spendCents) / 100,
      last: v.last,
    }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count)

  // —— 日 / 月 ——
  const dayMap = new Map<string, { cents: number; count: number }>()
  for (const t of spendTxns) {
    const cur = dayMap.get(t.date)
    if (cur) {
      cur.cents += t.out
      cur.count += 1
    } else dayMap.set(t.date, { cents: t.out, count: 1 })
  }
  const daily: DayStat[] = allDates(from, to).map((date) => {
    const v = dayMap.get(date)
    return { date, amount: yuan(v?.cents ?? 0), count: v?.count ?? 0 }
  })

  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0, count: 0 }))
  for (const t of spendTxns) {
    monthly[t.month - 1]!.amount += t.out
    monthly[t.month - 1]!.count += 1
  }
  for (const m of monthly) m.amount = yuan(m.amount)

  // —— 时段 ——
  const hourlyCents = new Array<number>(24).fill(0)
  const heat: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const weeklyCents = new Array<number>(7).fill(0)
  const slotAgg = new Map(SLOTS.map((s) => [s.key, { cents: 0, count: 0 }]))
  const kindAgg = new Map(KINDS.map((k) => [k.key, { cents: 0, count: 0 }]))

  for (const t of spendTxns) {
    hourlyCents[t.hour]! += t.out
    heat[t.weekday]![t.hour]! += 1
    weeklyCents[t.weekday]! += t.out
    const slot = SLOTS.find((s) => s.hours.includes(t.hour)) ?? SLOTS[3]!
    const sa = slotAgg.get(slot.key)!
    sa.cents += t.out
    sa.count += 1
    const ka = kindAgg.get(KINDS.find((k) => k.re.test(t.merchant))!.key)!
    ka.cents += t.out
    ka.count += 1
  }

  const slots: SlotStat[] = SLOTS.map((s) => {
    const v = slotAgg.get(s.key)!
    return {
      key: s.key,
      label: s.label,
      range: s.range,
      amount: yuan(v.cents),
      count: v.count,
      share: pct(v.cents, spendCents) / 100,
    }
  })

  const kinds: KindStat[] = KINDS.map((k) => {
    const v = kindAgg.get(k.key)!
    return { key: k.key, label: k.label, amount: yuan(v.cents), count: v.count, share: pct(v.cents, spendCents) / 100 }
  })

  // —— 明细（倒序）——
  const sortedAsc = [...parsed].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
  const transactions: Txn[] = [...sortedAsc]
    .reverse()
    .filter((t) => t.out > 0 || t.income > 0)
    .map((t) => ({
      time: t.time,
      merchant: t.merchant,
      amount: t.out > 0 ? -yuan(t.out) : yuan(t.income),
      balance: t.balance,
    }))

  // —— 余额曲线（稀疏采样）——
  const STEP = Math.max(1, Math.ceil(sortedAsc.length / 360))
  const balance = sortedAsc
    .filter((_, i) => i % STEP === 0 || i === sortedAsc.length - 1)
    .map((t) => ({ time: t.time, value: t.balance }))

  // —— 汇总 ——
  const maxTxn = spendTxns.reduce<Parsed | null>((best, t) => (!best || t.out > best.out ? t : best), null)
  const topDayEntry = [...dayMap.entries()].sort((a, b) => b[1].cents - a[1].cents)[0]
  const activeDays = dayMap.size

  const dates = [...dayMap.keys()].sort()
  let streak = 0
  let run = 0
  let prev = 0
  for (const d of dates) {
    const t = Date.parse(`${d}T00:00:00Z`)
    run = prev && t - prev === 86_400_000 ? run + 1 : 1
    if (run > streak) streak = run
    prev = t
  }

  const spanDays = Math.max(1, allDates(from, to).length)

  const summary: Report['summary'] = {
    spend: yuan(spendCents),
    income: yuan(incomeCents),
    spendCount: spendTxns.length,
    incomeCount: incomeTxns.length,
    merchantCount: merchants.length,
    activeDays,
    avgPerActiveDay: yuan(activeDays ? spendCents / activeDays : 0),
    avgPerTxn: yuan(spendTxns.length ? spendCents / spendTxns.length : 0),
    perWeek: Math.round((spendTxns.length / spanDays) * 7 * 10) / 10,
    maxTxn: maxTxn ? { amount: yuan(maxTxn.out), merchant: maxTxn.merchant, time: maxTxn.time } : null,
    topDay: topDayEntry
      ? { date: topDayEntry[0], amount: yuan(topDayEntry[1].cents), count: topDayEntry[1].count }
      : null,
    streak,
    first: spendTxns.length ? sortedAsc.find((t) => t.out > 0)!.time : null,
    last: spendTxns.length ? [...spendTxns].sort((a, b) => (a.time < b.time ? 1 : -1))[0]!.time : null,
  }

  const topMerchant = merchants[0]
  const topKind = [...kinds].sort((a, b) => b.amount - a.amount)[0]
  const topSlot = [...slots].sort((a, b) => b.amount - a.amount)[0]

  const insights: Insight[] = []
  if (topMerchant)
    insights.push({
      label: '最常出没',
      value: topMerchant.name,
      note: `${topMerchant.count} 笔 · ¥${topMerchant.amount.toFixed(2)} · 占总支出的 ${(topMerchant.share * 100).toFixed(1)}%`,
    })
  if (maxTxn)
    insights.push({
      label: '单笔最贵',
      value: `¥${yuan(maxTxn.out).toFixed(2)}`,
      note: `${maxTxn.merchant} · ${maxTxn.time}`,
    })
  if (topSlot)
    insights.push({
      label: '主要战斗力',
      value: `${topSlot.label} ${topSlot.range}`,
      note: `${topSlot.count} 笔 · 占 ${(topSlot.share * 100).toFixed(1)}%，共 ¥${topSlot.amount.toFixed(2)}`,
    })
  if (topKind)
    insights.push({
      label: '消费结构',
      value: topKind.label,
      note: `占总支出 ${(topKind.share * 100).toFixed(1)}%，${topKind.count} 笔`,
    })
  if (summary.topDay)
    insights.push({
      label: '最能吃的一天',
      value: `¥${summary.topDay.amount.toFixed(2)}`,
      note: `${summary.topDay.date} · ${summary.topDay.count} 笔`,
    })
  insights.push({
    label: '干饭节奏',
    value: `${summary.perWeek.toFixed(1)} 笔 / 周`,
    note: `共 ${summary.spendCount} 笔，覆盖 ${activeDays} 天，最长连续 ${streak} 天`,
  })

  return {
    meta: {
      account,
      year,
      from,
      to,
      fetchedAt: new Date().toISOString(),
      source: 'card.pku.edu.cn',
      txnCount: parsed.length,
    },
    summary,
    merchants,
    daily,
    monthly,
    hourly: hourlyCents.map(yuan),
    heat,
    weekly: weeklyCents.map(yuan),
    slots,
    kinds,
    balance,
    transactions,
    insights,
  }
}
