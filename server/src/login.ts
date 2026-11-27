/**
 * IAAA 统一身份认证 → 校园卡会话。
 *
 * 登录链（按浏览器实测）：
 *
 *   1. `card.pku.edu.cn/Login/Index` → 302 `/cassyno/index`
 *   2. `/cassyno/index` → 302 `sfrzcard.pku.edu.cn/ias/prelogin?sysid=WXXY&continueurl=…`
 *      （IAS = 校园卡自己的“统一身份认证管理平台”）
 *   3. IAS 返回一个自动提交的表单：`https://iaaa.pku.edu.cn/iaaa/oauth.jsp`
 *      `appID=card_auth`、`redirectUrl=http://sfrzcard.pku.edu.cn/ias/prelogin?sysid=WXXY`
 *   4. IAAA 登录页用 `getPublicKey.do` 的 RSA 公钥加密密码，POST `oauthlogin.do`
 *      换 token；成功后浏览器跳到 `redirectUrl&rand=…&token=…`
 *   5. IAS 校验 token 后返回一页自动提交表单（`errorcode` / `continueurl` /
 *      `ssoticketid`），POST 到 `cassyno/index`；校园卡据此下发 `hallticket` Cookie
 *
 * 密码必须 RSAES-PKCS1-v1_5 加密后提交（与网页端 JSEncrypt 一致），明文会被 IAAA
 * 以 E01 拒绝。
 */

import { constants, publicEncrypt } from 'node:crypto'

const IAAA_BASE = 'https://iaaa.pku.edu.cn/iaaa'
/** 校园卡在 IAAA 注册的 appid，取自 `oauth.jsp` 的隐藏域 */
const APP_ID = 'card_auth'
/** IAS 入口；同时作为 IAAA 登录成功后的回跳地址 */
const IAS_PRELOGIN = 'http://sfrzcard.pku.edu.cn/ias/prelogin?sysid=WXXY'
const IAAA_PUBKEY = `${IAAA_BASE}/getPublicKey.do`
const IAAA_LOGIN = `${IAAA_BASE}/oauthlogin.do`

const CARD_BASE = (Bun.env.UPSTREAM ?? 'https://card.pku.edu.cn').replace(/\/+$/, '')
/** 校园卡 SSO 回调入口 */
const CARD_SSO = `${CARD_BASE}/cassyno/index`
/** 账号管理页拉的卡列表接口，返回当前用户名下的 account */
const CARD_CARDS = `${CARD_BASE}/User/GetCardInfo`

const TIMEOUT_MS = 20_000
const MAX_HOPS = 8
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export type LoginErrorCode =
  | 'invalid-input'
  | 'invalid-credentials'
  | 'otp-required'
  | 'rate-limited'
  | 'upstream-unavailable'
  | 'upstream-rejected'

export class LoginError extends Error {
  constructor(
    readonly code: LoginErrorCode,
    message: string,
    /** 上游原始 code / 报文，便于排查 */
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'LoginError'
  }
}

export interface LoginArgs {
  username: string
  password: string
  /** 手机令牌：6 位数字（未绑定 OTP 时留空） */
  otp?: string
}

export interface LoginResult {
  account: string
  hallticket: string
}

/** 极简 Cookie 罐：按 host 存 host-only cookie，够走完 SSO 的来回跳转 */
class CookieJar {
  private store = new Map<string, Map<string, string>>()

  absorb(url: string, res: Response): void {
    const host = new URL(url).host
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    if (cookies.length === 0) return
    const jar = this.store.get(host) ?? new Map<string, string>()
    for (const raw of cookies) {
      const pair = raw.split(';', 1)[0] ?? ''
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    this.store.set(host, jar)
  }

  get(host: string, name: string): string | undefined {
    return this.store.get(host)?.get(name)
  }

  header(url: string): string | undefined {
    const jar = this.store.get(new URL(url).host)
    if (!jar || jar.size === 0) return undefined
    return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

async function request(jar: CookieJar, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('user-agent')) headers.set('user-agent', UA)
  const cookie = jar.header(url)
  if (cookie) headers.set('cookie', cookie)

  let res: Response
  try {
    res = await fetch(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new LoginError('upstream-unavailable', `无法连接认证服务：${(err as Error).message}`)
  }
  jar.absorb(url, res)
  return res
}

/**
 * 跟随跳转，停在第一个非 3xx 响应。
 *
 * 不能交给 `redirect: 'follow'`：Bun 的 fetch 跟随时不会把中间跳转响应的
 * Set-Cookie 带给下一跳（实测下一跳收到的 cookie 是 null），而这里每一步都靠
 * 上一跳的 Cookie 认人，所以只能逐跳收。
 */
async function follow(jar: CookieJar, url: string, init: RequestInit = {}): Promise<{ res: Response; url: string }> {
  let current = url
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await request(jar, current, hop === 0 ? init : { method: 'GET' })
    if (res.status < 300 || res.status >= 400) return { res, url: current }

    const location = res.headers.get('location')
    if (!location) return { res, url: current }
    await res.body?.cancel()
    current = new URL(location, current).toString()
  }
  throw new LoginError('upstream-rejected', '认证过程跳转次数过多', url)
}

function encryptPassword(pem: string, password: string): string {
  // JSEncrypt 用的是 RSAES-PKCS1-v1_5，默认 OAEP 会被拒
  const ciphertext = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(password, 'utf8'))
  return ciphertext.toString('base64')
}

interface IaaaError {
  code?: string
  msg?: string
}

function toLoginError(err: IaaaError | undefined): LoginError {
  const code = err?.code ?? ''
  const msg = err?.msg ?? 'IAAA 登录失败'
  const detail = code ? `${code}: ${msg}` : msg
  // E05: 手机令牌错误；E21: 尝试过多（限频）；E01: 账号或密码错误
  if (code === 'E21') return new LoginError('rate-limited', '认证尝试过多，请半小时后再试', detail)
  if (code === 'E05' || code === 'E06') return new LoginError('otp-required', `手机令牌校验失败：${msg}`, detail)
  return new LoginError('invalid-credentials', msg, detail)
}

async function iaaaToken({ username, password, otp }: LoginArgs): Promise<string> {
  const otpCode = otp?.trim() ?? ''
  if (otpCode && !/^\d{6}$/.test(otpCode)) {
    throw new LoginError('invalid-input', '手机令牌应为 6 位数字')
  }

  const jar = new CookieJar()

  const keyRes = await request(jar, IAAA_PUBKEY, { headers: { accept: 'application/json' } })
  if (keyRes.status !== 200) throw new LoginError('upstream-unavailable', `IAAA 公钥接口返回 HTTP ${keyRes.status}`)
  const keyJson = (await keyRes.json()) as { success?: boolean; key?: string; version?: string }
  if (!keyJson.success || !keyJson.key) throw new LoginError('upstream-rejected', 'IAAA 未返回可用公钥')

  const form = new URLSearchParams({
    appid: APP_ID,
    userName: username,
    password: encryptPassword(keyJson.key, password),
    keyVersion: keyJson.version ?? '',
    randCode: '',
    smsCode: '',
    otpCode,
    remTrustChk: 'false',
    redirUrl: IAS_PRELOGIN,
  })

  const res = await request(jar, IAAA_LOGIN, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      'x-requested-with': 'XMLHttpRequest',
      origin: 'https://iaaa.pku.edu.cn',
      referer: `${IAAA_BASE}/oauth.jsp`,
    },
    body: form,
  })
  if (res.status !== 200) throw new LoginError('upstream-unavailable', `IAAA 登录接口返回 HTTP ${res.status}`)

  const text = await res.text()
  let json: { success?: boolean; token?: string; errors?: IaaaError }
  try {
    json = JSON.parse(text)
  } catch {
    throw new LoginError('upstream-rejected', 'IAAA 返回了非 JSON 内容', text.slice(0, 200))
  }

  if (json.errors) throw toLoginError(json.errors)
  if (!json.success || !json.token) throw new LoginError('upstream-rejected', 'IAAA 未返回 token', text.slice(0, 200))
  return json.token
}

/**
 * IAS 拿到 token 后的下一步：
 * - 常见是 302 跳回校园卡；
 * - 也可能是 `{"result":"1","content":"<url>"}`，由页面脚本再跳。
 */
function nextHopFromJson(body: string): string | null {
  let json: { result?: string; content?: string }
  try {
    json = JSON.parse(body)
  } catch {
    return null
  }
  if (json.result && json.result !== '1') {
    throw new LoginError('invalid-credentials', `认证平台拒绝了登录：${json.content ?? '未知原因'}`)
  }
  const target = (json.content ?? '').trim()
  if (!/^https?:\/\//i.test(target)) return null
  return target
}

/**
 * 解析 IAS 返回的自动提交表单。
 *
 * token 校验通过后它吐一页 `#loginForm`（action 写在脚本里）：
 * `errorcode` / `continueurl` / `ssoticketid` 三个字段 POST 到校园卡，
 * 校园卡据此下发 `hallticket`。
 */
function parseAutoForm(html: string): { action: string; fields: Array<[string, string]> } | null {
  const block = /<form[^>]*>[\s\S]*?<\/form>/i.exec(html)?.[0]
  if (!block) return null

  // action 常常留空，真正的地址在脚本的 `form.action = '…'` 里
  const scriptAction = /\.action\s*=\s*['"]([^'"]+)['"]/i.exec(html)?.[1] ?? ''
  const attrAction = /<form[^>]*\baction="([^"]*)"/i.exec(block)?.[1] ?? ''
  const action = scriptAction || attrAction
  if (!/^https?:\/\//i.test(action)) return null

  const fields: Array<[string, string]> = []
  for (const [tag] of block.matchAll(/<input\b[^>]*>/gi)) {
    const name = /\bname="([^"]*)"/i.exec(tag)?.[1]
    if (!name) continue
    fields.push([name, /\bvalue="([^"]*)"/i.exec(tag)?.[1] ?? ''])
  }
  return fields.length > 0 ? { action, fields } : null
}

/**
 * 用 IAAA token 换校园卡的 `hallticket` Cookie。
 *
 * IAS 的会话（JSESSIONID）与 `continueurl` 绑在一起，所以先空跑一次 prelogin，
 * 再带 token 回来——这一步少走会拿不到回跳地址。
 */
async function hallticketFromToken(token: string): Promise<string> {
  const jar = new CookieJar()

  await follow(jar, `${IAS_PRELOGIN}&continueurl=${encodeURIComponent(CARD_SSO)}`)

  const hop = `${IAS_PRELOGIN}&rand=${Math.random()}&token=${encodeURIComponent(token)}`
  let { res, url } = await follow(jar, hop)

  // 上游有时用 JSON 给出下一跳，而不是 302
  let body = await res.text()
  const extra = nextHopFromJson(body)
  if (extra) {
    ;({ res, url } = await follow(jar, extra))
    body = await res.text()
  }

  // 校验通过后是一页自动提交表单，得替浏览器把它 POST 出去
  const form = parseAutoForm(body)
  if (form) {
    ;({ res, url } = await follow(jar, form.action, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams(form.fields),
    }))
    body = await res.text()
  }

  const host = new URL(CARD_BASE).host
  const hallticket = jar.get(host, 'hallticket')
  if (hallticket) return hallticket

  if (res.status === 200 && /<input[^>]+id="haccount"/i.test(body)) {
    throw new LoginError('upstream-rejected', '已登录校园卡，但未拿到 hallticket（上游合同可能变了）', url)
  }
  throw new LoginError('invalid-credentials', '统一身份认证未换到校园卡会话', `last=${url} status=${res.status}`)
}

interface CardInfo {
  retcode?: string
  errmsg?: string
  card?: { account?: string; cardname?: string }[]
}

/**
 * 读取登录账号。
 *
 * `/User/GetCardInfo` 是账号管理页用的接口：`{IsSucceed, Msg}`，`Msg` 是一段
 * JSON 字符串，`query_card.card[]` 里是名下所有卡；第一张即主卡。
 */
export async function fetchAccount(hallticket: string): Promise<string> {
  const res = await fetch(CARD_CARDS, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: `hallticket=${hallticket}`,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      'x-requested-with': 'XMLHttpRequest',
      referer: `${CARD_BASE}/User/Account`,
      'user-agent': UA,
    },
    body: new URLSearchParams({ json: 'true' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: Error) => {
    throw new LoginError('upstream-unavailable', `无法连接校园卡服务：${err.message}`)
  })

  if (res.status >= 300 && res.status < 400) {
    throw new LoginError('invalid-credentials', '校园卡会话无效（卡信息接口跳转到登录）')
  }
  if (res.status !== 200) throw new LoginError('upstream-unavailable', `校园卡卡信息接口返回 HTTP ${res.status}`)

  const text = await res.text()
  let payload: { IsSucceed?: boolean; Msg?: string }
  try {
    payload = JSON.parse(text)
  } catch {
    throw new LoginError('upstream-rejected', '卡信息接口返回了非 JSON 内容', text.slice(0, 200))
  }

  const msg = payload.Msg ?? ''
  // 会话失效时接口照样回 200，只在 Msg 里放一个 -405
  if (msg === '-405') throw new LoginError('invalid-credentials', '校园卡会话无效（卡信息接口返回 -405）')

  let cards: CardInfo | null = null
  try {
    cards = JSON.parse(msg)?.query_card ?? null
  } catch {
    cards = null
  }
  if (!cards) throw new LoginError('upstream-rejected', '卡信息接口的 Msg 无法解析', msg.slice(0, 200))
  if (cards.retcode !== '0')
    throw new LoginError('upstream-rejected', `查询卡信息失败：${cards.errmsg ?? cards.retcode}`)

  const account = cards.card?.[0]?.account
  if (!account) throw new LoginError('upstream-rejected', '名下没有可用的校园卡账号')
  return account
}

export async function loginWithIaaa(args: LoginArgs): Promise<LoginResult> {
  const token = await iaaaToken(args)
  const hallticket = await hallticketFromToken(token)
  const account = await fetchAccount(hallticket)
  return { account, hallticket }
}
