import { cors } from '@elysiajs/cors'
import { Elysia, t } from 'elysia'
import { computeReport, yearRange } from './analytics'
import { CardError, fetchRows } from './card'

export const app = new Elysia()
  .use(
    cors({
      origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
      methods: ['GET', 'POST'],
      allowedHeaders: ['content-type'],
    }),
  )
  .post(
    '/api/report',
    async ({ body, status }) => {
      const account = body.account.trim()
      const hallticket = body.hallticket.trim()

      try {
        const { from, to } = yearRange(body.year)
        const rows = await fetchRows({ account, hallticket, from, to })
        return computeReport({ account, year: body.year, from, to, rows })
      } catch (err) {
        if (err instanceof CardError) {
          return status(err.code === 'invalid-credentials' ? 401 : 502, {
            code: err.code,
            message: err.message,
          })
        }
        console.error('[report]', err)
        return status(500, { code: 'internal' as const, message: '生成报告失败，请稍后重试' })
      }
    },
    {
      body: t.Object({
        account: t.String({ minLength: 4, maxLength: 24 }),
        hallticket: t.String({ minLength: 8, maxLength: 128 }),
        year: t.Integer({ minimum: 2000, maximum: 2100 }),
      }),
    },
  )

export type App = typeof app
