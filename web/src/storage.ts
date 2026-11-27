export type LoginMode = 'cookie' | 'iaaa'

/** 已保存的输入：密码永不落盘；成功的 IAAA 登录会换成 hallticket 存下来 */
export interface StoredCreds {
  mode: LoginMode
  /** 校园卡账号，服务端回带，换年份时直接复用 */
  account: string
  hallticket: string
  /** IAAA 学号 */
  username: string
  year: number
}

export type EntryPayload =
  | { mode: 'cookie'; hallticket: string; account?: string; year: number }
  | { mode: 'iaaa'; username: string; password: string; otp?: string; year: number }

const KEY = 'baifan.creds'

export function loadCreds(): StoredCreds {
  const fallback: StoredCreds = {
    mode: 'cookie',
    account: '',
    hallticket: '',
    username: '',
    year: new Date().getFullYear(),
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredCreds>
    return {
      mode: parsed.mode === 'iaaa' ? 'iaaa' : 'cookie',
      account: typeof parsed.account === 'string' ? parsed.account : '',
      hallticket: typeof parsed.hallticket === 'string' ? parsed.hallticket : '',
      username: typeof parsed.username === 'string' ? parsed.username : '',
      year: typeof parsed.year === 'number' && parsed.year >= 2000 ? parsed.year : fallback.year,
    }
  } catch {
    return fallback
  }
}

export function saveCreds(creds: StoredCreds) {
  try {
    localStorage.setItem(KEY, JSON.stringify(creds))
  } catch {
    /* 隐身模式下忽略 */
  }
}

export function clearCreds() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
