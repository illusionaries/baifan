import { app } from './app'

const port = Number(Bun.env.PORT ?? 6370)
const host = Bun.env.HOST ?? '127.0.0.1'

const server = app.listen({ port, hostname: host }).server
console.log(`🍚 Server listening on ${server?.url}`)
console.log(`Set env.PORT and env.HOST to change the port and host.`)