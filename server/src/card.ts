/**
 * 校园卡流水抓取。
 *
 * 上游 `card.pku.edu.cn` 只接受 POST form-urlencoded，认证只能靠 Cookie 里的
 * `hallticket`（query / body 里放都会 302 到登录页），且没有任何 CORS 头，
 * 所以浏览器不能直连——这个模块必须跑在服务端。
 */

export const UPSTREAM = Bun.env.UPSTREAM ?? 'https://card.pku.edu.cn'

const ROUTE = '/Report/GetPersonTrjn'
/** 上游只认 Cookie 里的 hallticket 字段（query / body 都会被 302） */
const TICKET_COOKIE = 'hallticket='
const PAGE_SIZE = 1000
const MAX_PAGES = 40
const PAGE_TIMEOUT_MS = 20_000

export interface RawRow {
  OCCTIME?: string
  MERCNAME?: string
  TRANAMT?: number | string
  CARDBAL?: number | string
  TRANNAME?: string
  JNUM?: number | string
}

export type CardErrorCode = 'invalid-credentials' | 'upstream-unavailable' | 'upstream-rejected'

export class CardError extends Error {
  constructor(
    readonly code: CardErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CardError'
  }
}

export interface FetchArgs {
  account: string
  hallticket: string
  from: string
  to: string
}

const ACCOUNT_RE = /^\d{4,24}$/
const TICKET_RE = /^[0-9A-Za-z_-]{8,128}$/

function assertCredentials(account: string, hallticket: string) {
  if (!ACCOUNT_RE.test(account)) throw new CardError('invalid-credentials', 'account 应为校园卡账号（4–24 位数字）')
  if (!TICKET_RE.test(hallticket)) throw new CardError('invalid-credentials', 'hallticket 格式不正确')
}

interface Page {
  rows: RawRow[]
  total: number
}

async function fetchPage(args: FetchArgs, page: number): Promise<Page> {
  const body = new URLSearchParams({
    sdate: args.from,
    edate: args.to,
    account: args.account,
    page: String(page),
    rows: String(PAGE_SIZE),
  })

  let res: Response
  try {
    res = await fetch(`${UPSTREAM}${ROUTE}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie: TICKET_COOKIE + args.hallticket,
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        accept: 'application/json, text/javascript, */*; q=0.01',
        'x-requested-with': 'XMLHttpRequest',
        referer: `${UPSTREAM}${ROUTE}`,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      },
      body,
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    })
  } catch (err) {
    throw new CardError('upstream-unavailable', `无法连接校园卡服务：${(err as Error).message}`)
  }

  if (res.status >= 300 && res.status < 400) {
    throw new CardError('invalid-credentials', 'hallticket 无效或已过期（上游跳转到登录页）')
  }
  if (res.status !== 200) {
    throw new CardError('upstream-unavailable', `校园卡服务返回 HTTP ${res.status}`)
  }

  const text = await res.text()
  let json: { rows?: unknown; total?: unknown }
  try {
    json = JSON.parse(text)
  } catch {
    // 200 + HTML 基本就是登录页
    throw new CardError('invalid-credentials', 'hallticket 无效或已过期（上游返回了非 JSON 内容）')
  }

  if (!Array.isArray(json.rows)) throw new CardError('upstream-rejected', '上游返回结构异常：缺少 rows')

  return {
    rows: json.rows as RawRow[],
    total: Number(json.total) || 0,
  }
}

const rowKey = (row: RawRow) => `${row.JNUM ?? ''}|${row.OCCTIME ?? ''}|${row.TRANAMT ?? ''}`

/**
 * 拉取区间内全部流水（跨页去重）。返回顺序不保证，交给 analytics 排序。
 */
export async function fetchRows(args: FetchArgs): Promise<RawRow[]> {
  assertCredentials(args.account, args.hallticket)

  const seen = new Map<string, RawRow>()

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { rows, total } = await fetchPage(args, page)
    for (const row of rows) seen.set(rowKey(row), row)

    if (rows.length < PAGE_SIZE) break
    if (total > 0 && page * PAGE_SIZE >= total) break
  }

  // 空区间合法（没消费）；错误的 hallticket 会在前面抛 302
  return [...seen.values()]
}
