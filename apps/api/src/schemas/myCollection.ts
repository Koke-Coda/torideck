import { z } from '@hono/zod-openapi'
import { CardImageSchema, MonsterInfoSchema } from './common'

export const MyCollectionItemSchema = z.object({
  id: z.number().int(),
  konami_id: z.number().int(),
  card_type: z.enum(['monster', 'spell', 'trap']),
  property: z.string().nullable(),
  name: z.string(),
  ruby: z.string().nullable(),
  thumbnail: CardImageSchema.nullable(),
  monster: MonsterInfoSchema.nullable(),
  total_count: z.number().int().openapi({ description: '全セット・全イラストの所持枚数合計' }),
})

export const MyCollectionResponseSchema = z.object({
  total: z.number().int(),
  items: z.array(MyCollectionItemSchema),
})

export const MyCollectionQuerySchema = z.object({
  userId: z.string().uuid().openapi({ description: 'ユーザID' }),
  card_type: z.enum(['monster', 'spell', 'trap']).optional(),
  attribute: z.string().optional(),
  kind: z.string().optional(),
  keyword: z.string().optional(),
  limit: z.coerce.number().int().max(200).default(50),
  offset: z.coerce.number().int().default(0),
})
