import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { getSupabaseClient } from '../db/client'
import { UserCreateRequestSchema, UserSchema } from '../schemas/users'
import { ErrorResponseSchema } from '../schemas/common'

const router = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

const createUserRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['users'],
  summary: 'ユーザ登録',
  request: {
    body: {
      content: { 'application/json': { schema: UserCreateRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: UserSchema } },
      description: '登録成功',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'リクエスト不正',
    },
  },
})

const getUserRoute = createRoute({
  method: 'get',
  path: '/{userId}',
  tags: ['users'],
  summary: 'ユーザ情報取得',
  request: {
    params: z.object({ userId: z.string().uuid() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: UserSchema } },
      description: '取得成功',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'リソースが存在しない',
    },
  },
})

router.openapi(createUserRoute, async (c) => {
  const { name } = c.req.valid('json')
  const supabase = getSupabaseClient(c.env)

  const { data, error } = await supabase.from('users').insert({ name }).select().single()

  if (error) {
    return c.json({ code: 'DB_ERROR', message: error.message }, 400)
  }

  return c.json(data, 201)
})

router.openapi(getUserRoute, async (c) => {
  const { userId } = c.req.valid('param')
  const supabase = getSupabaseClient(c.env)

  const { data, error } = await supabase.from('users').select().eq('id', userId).single()

  if (error || !data) {
    return c.json({ code: 'NOT_FOUND', message: 'ユーザが見つかりません' }, 404)
  }

  return c.json(data, 200)
})

export default router
