import { treaty } from '@elysia/eden'
import type { App } from '../../server/src/app'

/** 开发期走 Vite 代理（同源），生产期由 Elysia 直接托管 dist（同源） */
export const api = treaty<App>(import.meta.env.VITE_API_BASE || location.origin, {
  // Eden 默认会把 "2025-01-01" 这类字符串转成 Date；报告里要的是原始字符串
  parseDate: false,
})
