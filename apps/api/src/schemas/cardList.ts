import { z } from '@hono/zod-openapi'
import { CardImageSchema, MonsterInfoSchema } from './common'

export const CardListItemSchema = z.object({
  id: z.number().int(),
  konami_id: z.number().int(),
  card_type: z.enum(['monster', 'spell', 'trap']),
  property: z.string().nullable(),
  name: z.string(),
  ruby: z.string().nullable(),
  thumbnail: CardImageSchema.nullable(),
  monster: MonsterInfoSchema.nullable(),
  total_count: z.number().int().nullable().openapi({
    description: 'ユーザの所持枚数合計（userId 未指定時は null）',
  }),
})

export const CardListResponseSchema = z.object({
  total: z.number().int().openapi({ description: '絞り込み後の総件数' }),
  items: z.array(CardListItemSchema),
})

export const CardListQuerySchema = z.object({
  userId: z.string().uuid().optional().openapi({ description: 'ユーザID' }),
  card_type: z.enum(['monster', 'spell', 'trap']).optional(),
  attribute: z.string().optional().openapi({ description: '属性（モンスターのみ有効）', example: '闇' }),
  kind: z.string().optional().openapi({ description: '種族（モンスターのみ有効）', example: 'ドラゴン族' }),
  keyword: z.string().optional().openapi({ description: 'カード名部分一致' }),
  limit: z.coerce.number().int().max(200).default(50),
  offset: z.coerce.number().int().default(0),
})
