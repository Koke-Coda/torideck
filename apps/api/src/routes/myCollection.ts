import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import type { z } from '@hono/zod-openapi'
import { getSupabaseClient } from '../db/client'
import { MyCollectionQuerySchema, MyCollectionResponseSchema } from '../schemas/myCollection'
import { ErrorResponseSchema } from '../schemas/common'

type MyCollectionResponse = z.infer<typeof MyCollectionResponseSchema>

const router = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

const myCollectionRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['my-collection'],
  summary: '所持カード一覧取得',
  description:
    'ユーザが所持しているカード（枚数1以上）の一覧を返す。絞り込みパラメータは /screens/card-list と共通。',
  request: {
    query: MyCollectionQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MyCollectionResponseSchema } },
      description: '取得成功',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'リクエスト不正',
    },
  },
})

router.openapi(myCollectionRoute, async (c) => {
  const query = c.req.valid('query')
  const supabase = getSupabaseClient(c.env)

  const { data, error } = await supabase.rpc('get_my_collection', {
    p_user_id: query.userId,
    p_card_type: query.card_type ?? null,
    p_attribute: query.attribute ?? null,
    p_kind: query.kind ?? null,
    p_keyword: query.keyword ?? null,
    p_limit: query.limit,
    p_offset: query.offset,
  })

  if (error) {
    return c.json({ code: 'DB_ERROR', message: error.message }, 400)
  }

  return c.json(data as unknown as MyCollectionResponse, 200)
})

export default router
