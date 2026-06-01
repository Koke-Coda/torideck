import { z } from '@hono/zod-openapi'
import { CardImageSchema, CardSetSchema, MonsterInfoSchema } from './common'

export const UserCardCountSchema = z.object({
  card_set_id: z.number().int().openapi({ description: 'card_sets.id（型番＋レアリティを特定）' }),
  image_idx: z.string(),
  count: z.number().int(),
})

export const CardDetailResponseSchema = z.object({
  id: z.number().int(),
  konami_id: z.number().int(),
  card_type: z.enum(['monster', 'spell', 'trap']),
  property: z.string().nullable(),
  name: z.string(),
  ruby: z.string().nullable(),
  text: z.string().nullable(),
  pendulum_text: z.string().nullable(),
  monster: MonsterInfoSchema.nullable(),
  images: z.array(CardImageSchema),
  card_sets: z.array(CardSetSchema),
  user_counts: z.array(UserCardCountSchema).openapi({ description: 'userId 未指定時は空配列' }),
})
