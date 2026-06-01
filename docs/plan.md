# Torideck API 実装計画

## Context
遊戯王TCGのカード管理アプリ。`apps/api` は Cloudflare Workers + Hono のスケルトン状態（"Hello Hono!" のみ）。
OpenAPI 仕様（`openapi.yaml`）は完成済み。DB は Supabase (Postgres) を使用。カードデータは yaml-yugi（DawnbrandBots）から投入する。
本計画ではスキーマ・マイグレーション・APIルート実装・シードスクリプト・デプロイCI の整備を行う。

---

## 技術スタック

| 役割 | 採用技術 |
|------|---------|
| API フレームワーク | Hono v4 + `@hono/zod-openapi` |
| リクエストバリデーション | Zod v3 |
| DB クライアント（Workers 内） | `@supabase/supabase-js` v2（PostgREST 経由、edge 対応） |
| DB マイグレーション | Supabase CLI（SQL ファイル） |
| ローカル DB | Supabase CLI local dev（Docker） |
| シードスクリプト実行 | `tsx` + `js-yaml` |
| デプロイ | Wrangler + GitHub Actions |

---

## 実装ステップ

### Step 1 — DDL マイグレーション整備

**対象ファイル：**
- `supabase/migrations/20240001000000_initial_schema.sql`（新規作成）
- `supabase/migrations/20240001000001_rpc_functions.sql`（新規作成）

**作業内容：**

1. プロジェクトルートで `supabase init` を実行し `supabase/` ディレクトリを作成
2. `docs/ddl` の内容を `20240001000000_initial_schema.sql` にコピー
3. **バグ修正**：`card_sets` の制約を変更
   ```sql
   -- 変更前（誤り: 同一 set_number + rarity が別カードに存在しうる）
   UNIQUE (set_number, rarity)
   -- 変更後
   UNIQUE (card_id, set_number, rarity)
   ```
4. **追加**：seed upsert 用の制約を `card_images` に追加
   ```sql
   -- card_images テーブルに追加
   UNIQUE (card_id, idx)
   ```
5. `20240001000001_rpc_functions.sql` に以下の2つの PostgreSQL 関数を作成：
   - `get_card_list(p_card_type, p_attribute, p_kind, p_keyword, p_limit, p_offset, p_user_id)` → JSON
     - cards × monsters (LEFT JOIN) × card_images (LATERAL, 1件のみ) を結合
     - userId 指定時は user_card_counts を SUM して total_count を返す
     - 総件数 + ページ済みアイテム配列を JSON で返す
   - `get_my_collection(p_user_id, p_card_type, p_attribute, p_kind, p_keyword, p_limit, p_offset)` → JSON
     - card_list と同構造だが user_card_counts の INNER JOIN で count > 0 を条件とする

**注意：** wrangler dev のポートは 8787 がデフォルトなので、openapi.yaml のサーバーURL（現在 8080）は後でドキュメント上の値として扱う。

---

### Step 2 — apps/api パッケージ設定

**対象ファイル：**
- `apps/api/package.json`
- `apps/api/wrangler.jsonc`
- `apps/api/.dev.vars`（新規、gitignore 済み）

**インストール：**
```bash
cd apps/api
pnpm add @hono/zod-openapi zod @supabase/supabase-js
pnpm add -D tsx js-yaml @types/js-yaml
```

> **注意**: `zod` は **v3** (`^3.23.x`) を使用。`@hono/zod-openapi` は現時点で zod v4 非対応。

**wrangler.jsonc 追記：**
```jsonc
{
  // ...既存設定...
  "vars": {
    "SUPABASE_URL": "",
    "CORS_ORIGIN": "http://localhost:5173"
  }
}
// SUPABASE_SERVICE_ROLE_KEY は wrangler secret put で管理（jsonc には書かない）
```

`.dev.vars`（ローカル専用、gitignore 済み）：
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<supabase start 出力の service_role key>
CORS_ORIGIN=http://localhost:5173
```

型生成：
```bash
pnpm cf-typegen  # CloudflareBindings 型を worker-configuration.d.ts に生成
```

---

### Step 3 — ファイル構成と実装

**最終的なディレクトリ構成：**
```
apps/api/
├── src/
│   ├── index.ts                   # OpenAPIHono app, ミドルウェア, ルート登録
│   ├── db/
│   │   └── client.ts              # getSupabaseClient(env) factory
│   ├── schemas/
│   │   ├── common.ts              # CardImage, CardSet, MonsterInfo, ErrorResponse
│   │   ├── users.ts               # User, UserCreateRequest
│   │   ├── cardList.ts            # CardListItem, CardListResponse
│   │   ├── cardDetail.ts          # CardDetailResponse, UserCardCount
│   │   ├── counts.ts              # CardCountBulkUpdateRequest/Response
│   │   └── myCollection.ts        # MyCollectionItem, MyCollectionResponse
│   └── routes/
│       ├── users.ts               # POST /users, GET /users/:userId
│       ├── cardList.ts            # GET /screens/card-list
│       ├── cardDetail.ts          # GET /screens/card-list/:cardId
│       ├── counts.ts              # PUT /screens/card-list/counts
│       └── myCollection.ts        # GET /screens/my-collection
├── .dev.vars                      # ローカル開発用シークレット（gitignore済み）
├── wrangler.jsonc
├── package.json
└── tsconfig.json

supabase/
├── config.toml
└── migrations/
    ├── 20240001000000_initial_schema.sql
    └── 20240001000001_rpc_functions.sql

scripts/
└── seed.ts                        # yaml-yugi データ投入スクリプト
```

**DB クライアント (`src/db/client.ts`)：**
```typescript
import { createClient } from '@supabase/supabase-js'

export function getSupabaseClient(env: CloudflareBindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
```
> **必須**: `persistSession: false` 忘れると Workers で `localStorage is not defined` エラーが発生する。

**Zod スキーマ（`src/schemas/` 以下）：**
`import { z } from '@hono/zod-openapi'` を使用（bare `zod` ではなく）。openapi.yaml の各スキーマを 1:1 で Zod に変換する。

**エントリポイント (`src/index.ts`)：**
```typescript
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
// ... ルートのインポート

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

app.use('*', async (c, next) => cors({ origin: c.env.CORS_ORIGIN })(c, next))

// ⚠️ ルート登録順序: counts は cardDetail より先に登録すること
// GET /screens/card-list/:cardId が PUT /screens/card-list/counts を先に捕まえるため
app.route('/screens/card-list', countsRouter)   // PUT /counts
app.route('/screens/card-list', cardListRouter)  // GET /
app.route('/screens/card-list', cardDetailRouter)// GET /:cardId

app.route('/users', usersRouter)
app.route('/screens/my-collection', myCollectionRouter)

app.onError((err, c) => {
  const status = 'status' in err ? (err.status as number) : 500
  return c.json({ code: 'INTERNAL_ERROR', message: err.message }, status)
})
export default app
```

**各ルートの実装方針：**

| エンドポイント | DB アクセス方法 |
|---|---|
| POST /users | `supabase.from('users').insert().select().single()` |
| GET /users/:userId | `supabase.from('users').select().eq('id', userId).single()` |
| GET /screens/card-list | `supabase.rpc('get_card_list', params)` |
| GET /screens/card-list/:cardId | PostgREST embedding: `select('*, monsters(*), card_images(*), card_sets(*)')` + user_counts 別クエリ |
| PUT /screens/card-list/counts | `supabase.from('user_card_counts').upsert([...], { onConflict: 'user_id,card_set_id,image_idx' })` |
| GET /screens/my-collection | `supabase.rpc('get_my_collection', params)` |

---

### Step 4 — シードスクリプト

**対象ファイル：** `scripts/seed.ts`

**yaml-yugi データ形式メモ（実ファイル確認済み）：**
- `name.ja`: Ruby マークアップ含む例: `<ruby>白銀の城の狂時計<rt>ラビュリンス・クックロック</rt></ruby>`
  → `cards.name` には `<ruby>...</ruby>` を除去した地文字を格納（正規表現で抽出）
- `name.ja_romaji`: ローマ字読み → `cards.ruby`
- `text.ja`: 日本語テキスト → `cards.text`
- `card_type`: `"Monster"` → `"monster"` （lowercase変換）
- `monster_type_line`: `"Fiend / Effect"` → split by ` / ` → first = kind, rest = type（JSONB配列）
- `images[].index`: 整数 → `idx` は `String(index)` に変換
- `images[].image`: ファイル名（URL ではない）→ `image_url` / `illustration_url` は `null` で投入（後で解決）
- `sets.ja[].rarities`: 配列 → レアリティ 1件ずつ `card_sets` に1レコード生成
- リンクマーカー: Unicode 矢印 (`⬆⬇⬅➡↗↘↙↖`) → 英語文字列にマッピング

**実行方法：**
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<key> \
pnpm tsx scripts/seed.ts
```

**パフォーマンス対策：** PostgREST への HTTP リクエスト数を減らすため、upsert は配列単位（最大500件ずつバッチ）で実行する。

---

### Step 5 — GitHub Actions デプロイ CI

**対象ファイル：** `.github/workflows/deploy-api.yml`（新規作成）

```yaml
name: Deploy API
on:
  push:
    branches: [main]
    paths:
      - 'apps/api/**'
      - '.github/workflows/deploy-api.yml'
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - working-directory: apps/api
        run: pnpm deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**必要なシークレット（一度だけ設定）：**
- GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Cloudflare Worker Secrets（`wrangler secret put` で設定）:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CORS_ORIGIN`

---

## ローカル開発の起動手順

```bash
# 初回セットアップ
pnpm install
supabase start          # Docker でローカル Supabase 起動
# → API URL と service_role key が表示される

supabase db reset       # マイグレーション適用

# .dev.vars に上記の値を記入
supabase gen types typescript --local > apps/api/src/db/database.types.ts

# カードデータ投入（初回のみ）
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<key> pnpm tsx scripts/seed.ts

# 日常起動
pnpm api    # wrangler dev（http://localhost:8787）
pnpm web    # Vite dev（http://localhost:5173）
# Supabase Studio: http://127.0.0.1:54323
```

---

## ブランチ・PR 戦略

各 Step を独立したブランチとして作業し、`main` へ PR を作成する。

| ブランチ名 | 対応 Step | PR 内容 |
|---|---|---|
| `feat/db-schema-migration` | Step 1 | Supabase init + DDL マイグレーション + RPC 関数 |
| `feat/api-setup` | Step 2 | packages インストール・wrangler.jsonc 設定 |
| `feat/api-routes` | Step 3 | DB クライアント・Zod スキーマ・全ルート実装 |
| `feat/seed-script` | Step 4 | yaml-yugi シードスクリプト |
| `feat/deploy-ci` | Step 5 | GitHub Actions デプロイワークフロー |

各 PR は前の PR がマージされてから作成する（順次依存）。

---

## 実装順序（依存関係に従う）

0. **この計画書を `docs/plan.md` に保存**（最初に実施）
1. **Supabase init + マイグレーション SQL 作成**（Step 1 → ブランチ `feat/db-schema-migration`）
2. **パッケージインストール + wrangler.jsonc / .dev.vars 設定**（Step 2 → ブランチ `feat/api-setup`）
3. **`supabase db reset` でスキーマ適用**
4. **型生成**（`supabase gen types` + `pnpm cf-typegen`）
5. **DB クライアント + Zod スキーマ + ルート実装**（Step 3 → ブランチ `feat/api-routes`）
6. **シードスクリプト作成**（Step 4 → ブランチ `feat/seed-script`）
7. **GitHub Actions CI 作成**（Step 5 → ブランチ `feat/deploy-ci`）

---

## 検証方法

```bash
# 1. マイグレーション確認
supabase db reset  # エラーなく完了すること

# 2. API 起動確認（TypeScript エラーなし）
cd apps/api && pnpm cf-typegen && pnpm dev

# 3. 各エンドポイント動作確認
curl http://localhost:8787/screens/card-list?limit=5
curl -X POST http://localhost:8787/users -H "Content-Type: application/json" -d '{"name":"テスト"}'
curl "http://localhost:8787/screens/card-list?userId=<uuid>&limit=5"
curl http://localhost:8787/screens/card-list/1
curl -X PUT http://localhost:8787/screens/card-list/counts \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<uuid>","counts":[{"card_set_id":1,"image_idx":"1","count":2}]}'
curl "http://localhost:8787/screens/my-collection?userId=<uuid>"

# 4. CORS 確認
curl -H "Origin: http://localhost:5173" -X OPTIONS http://localhost:8787/screens/card-list

# 5. デプロイ dry-run
cd apps/api && pnpm wrangler deploy --dry-run
```

---

## 重要な注意点まとめ

- `zod` は v3 系を使うこと（v4 は @hono/zod-openapi 未対応）
- Supabase クライアントは必ず `persistSession: false` を設定（Workers に localStorage がないため）
- `node_compat` 不要（@supabase/supabase-js は fetch ベース、edge 対応済み）
- Hono ルート登録順序：`PUT /counts` → `GET /` → `GET /:cardId`（静的パスを先に登録）
- `card_sets` の UNIQUE 制約は `(card_id, set_number, rarity)` が正しい（DDL のバグを修正する）
- `card_images` には `UNIQUE (card_id, idx)` が必要（upsert の onConflict 用）
- yaml-yugi の `name.ja` は `<ruby>...</ruby>` マークアップを含む → 正規表現でテキスト抽出が必要
