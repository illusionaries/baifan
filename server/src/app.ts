import { cors } from '@elysiajs/cors'
import { Elysia, t } from 'elysia'
import { computeReport, yearRange } from './analytics'
import { CardError, fetchRows } from './card'
import { LoginError, fetchAccount, loginWithIaaa } from './login'
import type { ReportResponse } from './types'

type FailStatus = 400 | 401 | 403 | 429 | 500 | 502

interface Failure {
  status: FailStatus
  body: { code: string; message: string }
}

const Year = t.Integer({ minimum: 2000, maximum: 2100 })

function toFailure(err: unknown): Failure {
  if (err instanceof LoginError) {
    const body = { code: err.code, message: err.message }
    // E21 限频 / 令牌错误 / 认证失败各有对应语义，别都塞成 401
    if (err.code === 'invalid-input') return { status: 400, body }
    if (err.code === 'rate-limited') return { status: 429, body }
    if (err.code === 'invalid-credentials' || err.code === 'otp-required') return { status: 401, body }
    return { status: 502, body }
  }
  if (err instanceof CardError) {
    return {
      status: err.code === 'invalid-credentials' ? 401 : 502,
      body: { code: err.code, message: err.message },
    }
  }
  console.error('[report]', err)
  return { status: 500, body: { code: 'internal', message: '生成报告失败，请稍后重试' } }
}

/** 拿到 (account, hallticket, year) 之后的共同流程；session 回带给前端复用 */
async function buildReport(account: string, hallticket: string, year: number): Promise<ReportResponse> {
  const { from, to } = yearRange(year)
  const rows = await fetchRows({ account, hallticket, from, to })
  return { ...computeReport({ account, year, from, to, rows }), session: { account, hallticket } }
}

export const app = new Elysia()
  .use(
    cors({
      origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
      methods: ['GET', 'POST'],
      allowedHeaders: ['content-type'],
    }),
  )
  .post(
    '/api/report/cookie',
    async ({ body, status }) => {
      try {
        const hallticket = body.hallticket.trim()
        const account = body.account?.trim() || (await fetchAccount(hallticket))
        return await buildReport(account, hallticket, body.year)
      } catch (err) {
        const failure = toFailure(err)
        return status(failure.status, failure.body)
      }
    },
    {
      body: t.Object({
        account: t.Optional(t.String({ minLength: 4, maxLength: 24 })),
        hallticket: t.String({ minLength: 8, maxLength: 128 }),
        year: Year,
      }),
    },
  )
  .post(
    '/api/report/iaaa',
    async ({ body, status }) => {
      try {
        const { account, hallticket } = await loginWithIaaa({
          username: body.username.trim(),
          password: body.password,
          otp: body.otp?.trim() || undefined,
        })
        return await buildReport(account, hallticket, body.year)
      } catch (err) {
        const failure = toFailure(err)
        return status(failure.status, failure.body)
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1, maxLength: 64 }),
        password: t.String({ minLength: 1, maxLength: 128 }),
        // IAAA 的手机令牌固定 6 位数字
        otp: t.Optional(t.String({ pattern: '^\\d{6}$' })),
        year: Year,
      }),
    },
  )

export type App = typeof app
