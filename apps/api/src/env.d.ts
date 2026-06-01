// wrangler secret put で管理するシークレットの型定義
// worker-configuration.d.ts は cf-typegen で上書きされるため、ここで拡張する
interface CloudflareBindings {
  SUPABASE_SERVICE_ROLE_KEY: string
}
