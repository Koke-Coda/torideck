import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import type { z } from '@hono/zod-openapi'
import { getSupabaseClient } from '../db/client'
import { CardListQuerySchema, CardListResponseSchema } from '../schemas/cardList'
import { ErrorResponseSchema } from '../schemas/common'

type CardListResponse = z.infer<typeof CardListResponseSchema>

const router = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

const cardListRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['card-list'],
  summary: 'カード一覧取得',
  description: 'カード一覧を返す。`userId` を渡すと各カードの所持枚数合計も含む。',
  request: {
    query: CardListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: CardListResponseSchema } },
      description: '取得成功',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'リクエスト不正',
    },
  },
})

router.openapi(cardListRoute, async (c) => {
  const query = c.req.valid('query')
  const supabase = getSupabaseClient(c.env)

  const { data, error } = await supabase.rpc('get_card_list', {
    p_card_type: query.card_type ?? null,
    p_attribute: query.attribute ?? null,
    p_kind: query.kind ?? null,
    p_keyword: query.keyword ?? null,
    p_limit: query.limit,
    p_offset: query.offset,
    p_user_id: query.userId ?? null,
  })

  if (error) {
    return c.json({ code: 'DB_ERROR', message: error.message }, 400)
  }

  return c.json(data as unknown as CardListResponse, 200)
})

export default router
