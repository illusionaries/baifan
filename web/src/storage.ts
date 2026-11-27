export interface StoredCreds {
  hallticket: string
  year: number
}

const KEY = 'baifan-eat.creds'

export function loadCreds(): StoredCreds {
  const fallback: StoredCreds = { hallticket: '', year: new Date().getFullYear() }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredCreds>
    return {
      hallticket: typeof parsed.hallticket === 'string' ? parsed.hallticket : '',
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
