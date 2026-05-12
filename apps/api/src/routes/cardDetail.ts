import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { getSupabaseClient } from '../db/client'
import { CardDetailResponseSchema } from '../schemas/cardDetail'
import { ErrorResponseSchema } from '../schemas/common'

const router = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

const cardDetailRoute = createRoute({
  method: 'get',
  path: '/{cardId}',
  tags: ['card-list'],
  summary: 'カード詳細取得（ダイアログ用）',
  description:
    'カード詳細・画像一覧・収録セット（レアリティ）・ユーザ所持枚数（セット/イラスト単位）を返す。',
  request: {
    params: z.object({ cardId: z.coerce.number().int() }),
    query: z.object({
      userId: z.string().uuid().optional().openapi({ description: 'ユーザID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: CardDetailResponseSchema } },
      description: '取得成功',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'リソースが存在しない',
    },
  },
})

router.openapi(cardDetailRoute, async (c) => {
  const { cardId } = c.req.valid('param')
  const { userId } = c.req.valid('query')
  const supabase = getSupabaseClient(c.env)

  const { data: card, error } = await supabase
    .from('cards')
    .select(
      `id, konami_id, card_type, property, name, ruby, text, pendulum_text,
       monsters ( kind, attribute, type, level, rank, atk, def, scale, link_arrows, link_num, materials ),
       card_images ( id, idx, image_url, illustration_url ),
       card_sets ( id, set_number, set_name, rarity )`
    )
    .eq('id', cardId)
    .single()

  if (error || !card) {
    return c.json({ code: 'NOT_FOUND', message: 'カードが見つかりません' }, 404)
  }

  let user_counts: { card_set_id: number; image_idx: string; count: number }[] = []
  if (userId && Array.isArray(card.card_sets) && card.card_sets.length > 0) {
    const cardSetIds = card.card_sets.map((s: { id: number }) => s.id)
    const { data: counts } = await supabase
      .from('user_card_counts')
      .select('card_set_id, image_idx, count')
      .eq('user_id', userId)
      .in('card_set_id', cardSetIds)
    user_counts = counts ?? []
  }

  const response = {
    id: card.id,
    konami_id: card.konami_id,
    card_type: card.card_type,
    property: card.property,
    name: card.name,
    ruby: card.ruby,
    text: card.text,
    pendulum_text: card.pendulum_text,
    monster: Array.isArray(card.monsters) ? (card.monsters[0] ?? null) : (card.monsters ?? null),
    images: card.card_images ?? [],
    card_sets: card.card_sets ?? [],
    user_counts,
  }

  return c.json(response, 200)
})

export default router
