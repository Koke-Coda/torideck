import { z } from '@hono/zod-openapi'

export const UserCreateRequestSchema = z.object({
  name: z.string().openapi({ example: 'デュエリスト太郎' }),
})

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})
