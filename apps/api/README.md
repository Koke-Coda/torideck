# Torideck API

Cloudflare Workers + Hono による遊戯王TCGカード管理 API。

## ローカル環境セットアップ手順

### 前提条件

| ツール | バージョン | インストール方法 |
|---|---|---|
| Docker | 29+ | Docker Desktop |
| Node.js | 24.14.0 | mise install（後述） |
| pnpm | 10 | mise install |
| Supabase CLI | 2.98+ | `brew install supabase/tap/supabase` |

**mise を使う場合（推奨）：**

```bash
brew install mise
mise install   # mise.toml の Node + pnpm が自動でインストールされる
```

---

### 初回セットアップ

```bash
# 1. リポジトリのクローン
git clone git@github.com:Koke-Coda/torideck.git
cd torideck

# 2. 依存関係インストール
pnpm install
```

---

### DB セットアップ（初回のみ）

```bash
# 3. ローカル Supabase を起動（Docker が必要）
supabase start
```

起動後に以下が表示されます：

```
API URL: http://127.0.0.1:54321
DB URL:  postgresql://postgres:postgres@127.0.0.1:54322/postgres
...
Secret: sb_secret_xxxx...
```

> **⚠️ Supabase CLI 2.98+ について**
> `supabase status` に表示される `sb_secret_*` キーは `supabase-js` では使用できません。
> Kong の設定から対応する JWT を取得する必要があります：
>
> ```bash
> docker exec supabase_kong_torideck cat /home/kong/kong.yml \
>   | grep -o '"Bearer eyJ[^"]*service_role[^"]*"' | head -1
> ```

```bash
# 4. .dev.vars を作成して値を記入
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

`apps/api/.dev.vars` を開いて上記で取得した JWT を貼り付けます：

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...（↑で取得した JWT）
CORS_ORIGIN=http://localhost:5173
```

```bash
# 5. マイグレーション適用（テーブル・RPC 関数を作成）
supabase db reset

# 6. TypeScript 型を生成
supabase gen types typescript --local > apps/api/src/db/database.types.ts

# 7. カードデータ投入（約 14,000 件、5〜10 分かかります）
pnpm seed
```

---

### 開発サーバー起動

```bash
# API（http://localhost:8787）
pnpm api

# Web（http://localhost:5173）—— 別ターミナルで
pnpm web
```

Supabase Studio は http://127.0.0.1:54323 で確認できます。

---

### 動作確認

`apps/api/requests.http` を VS Code（[REST Client 拡張](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)）または JetBrains で開きます。

最初にユーザを作成して UUID を取得：

```http
POST http://localhost:8787/users
Content-Type: application/json

{ "name": "テストユーザ" }
```

レスポンスの `id` を `requests.http` の先頭変数にセットします：

```http
@userId = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

その後、各リクエストをクリックして動作確認できます。

---

### 2 回目以降の起動

```bash
supabase start   # Supabase 再起動（初回以降は DB データが保持される）
pnpm api         # API 起動
```

---

### デプロイ

`main` ブランチへの push で GitHub Actions が自動デプロイします（`apps/api/**` 変更時のみ）。

```bash
# 手動デプロイ
pnpm deploy
```
