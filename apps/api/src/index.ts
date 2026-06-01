import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import usersRouter from './routes/users'
import countsRouter from './routes/counts'
import cardListRouter from './routes/cardList'
import cardDetailRouter from './routes/cardDetail'
import myCollectionRouter from './routes/myCollection'

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

app.use('*', async (c, next) => {
  return cors({
    origin: c.env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 600,
  })(c, next)
})

app.route('/users', usersRouter)

// ⚠️ /counts（静的パス）を /:cardId（動的パス）より先に登録する
app.route('/screens/card-list', countsRouter)
app.route('/screens/card-list', cardListRouter)
app.route('/screens/card-list', cardDetailRouter)

app.route('/screens/my-collection', myCollectionRouter)

app.doc('/openapi.json', {
  openapi: '3.0.3',
  info: { title: 'Torideck API', version: '0.1.0' },
})

app.onError((err, c) => {
  console.error(err)
  const status = ('status' in err ? (err.status as number) : 500) as ContentfulStatusCode
  return c.json({ code: 'INTERNAL_ERROR', message: err.message }, status)
})

export default app
