import { z } from '@hono/zod-openapi'
import { UserCardCountSchema } from './cardDetail'

export const CardCountBulkUpdateRequestSchema = z.object({
  user_id: z.string().uuid(),
  counts: z
    .array(
      z.object({
        card_set_id: z.number().int().openapi({ description: 'card_sets.id（型番＋レアリティを特定）' }),
        image_idx: z.string().openapi({ description: 'card_images.idx（イラスト違い識別）' }),
        count: z.number().int().min(0),
      })
    )
    .min(1)
    .openapi({ description: '更新対象の所持枚数一覧（変更があった分だけ送る）' }),
})

export const CardCountBulkUpdateResponseSchema = z.object({
  counts: z.array(UserCardCountSchema).openapi({ description: '更新後の所持枚数一覧' }),
})
