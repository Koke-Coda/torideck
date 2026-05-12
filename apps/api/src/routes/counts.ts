import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { getSupabaseClient } from '../db/client'
import { CardCountBulkUpdateRequestSchema, CardCountBulkUpdateResponseSchema } from '../schemas/counts'
import { ErrorResponseSchema } from '../schemas/common'

const router = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

const bulkUpdateCountsRoute = createRoute({
  method: 'put',
  path: '/counts',
  tags: ['card-list'],
  summary: 'カード所持枚数一括更新',
  description:
    '複数カード・複数セット × イラストの組み合わせを一括で更新する。変更があった分だけ送ればよい（差分更新）。',
  request: {
    body: {
      content: { 'application/json': { schema: CardCountBulkUpdateRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: CardCountBulkUpdateResponseSchema } },
      description: '更新成功',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'リクエスト不正',
    },
  },
})

router.openapi(bulkUpdateCountsRoute, async (c) => {
  const { user_id, counts } = c.req.valid('json')
  const supabase = getSupabaseClient(c.env)

  const rows = counts.map((item) => ({
    user_id,
    card_set_id: item.card_set_id,
    image_idx: item.image_idx,
    count: item.count,
  }))

  const { data, error } = await supabase
    .from('user_card_counts')
    .upsert(rows, { onConflict: 'user_id,card_set_id,image_idx' })
    .select('card_set_id, image_idx, count')

  if (error) {
    return c.json({ code: 'DB_ERROR', message: error.message }, 400)
  }

  return c.json({ counts: data ?? [] }, 200)
})

export default router
