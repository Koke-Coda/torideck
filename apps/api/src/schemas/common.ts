import { z } from '@hono/zod-openapi'

export const CardImageSchema = z.object({
  id: z.number().int(),
  idx: z.string(),
  image_url: z.string().nullable(),
  illustration_url: z.string().nullable(),
})

export const CardSetSchema = z.object({
  id: z.number().int(),
  set_number: z.string().openapi({ example: 'ROTD-JP001' }),
  set_name: z.string().openapi({ example: 'RISE OF THE DUELIST' }),
  rarity: z.string().openapi({ example: 'SR' }),
})

export const MonsterInfoSchema = z.object({
  kind: z.string().openapi({ example: 'ドラゴン族' }),
  attribute: z.string().openapi({ example: '闇' }),
  type: z.array(z.string()).openapi({ example: ['効果', 'チューナー'] }),
  level: z.number().int().nullable(),
  rank: z.number().int().nullable(),
  atk: z.number().int().nullable(),
  def: z.number().int().nullable(),
  scale: z.number().int().nullable(),
  link_arrows: z.array(z.string()).nullable().openapi({ example: ['Top', 'Bottom-Left'] }),
  link_num: z.number().int().nullable(),
  materials: z.string().nullable(),
})

export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
})
