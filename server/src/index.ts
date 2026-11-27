import { app } from './app'

const port = Number(Bun.env.PORT ?? 3000)
const host = Bun.env.HOST ?? '127.0.0.1'

app.listen({ port, hostname: host })