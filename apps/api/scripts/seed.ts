/**
 * yaml-yugi カードデータを Supabase に投入するシードスクリプト
 *
 * 実行方法:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   pnpm tsx scripts/seed.ts
 *
 * 対象: DawnbrandBots/yaml-yugi の data/cards/*.yaml（日本語セットのみ）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// apps/api/scripts/ → apps/api/ → apps/ → torideck/ → Koke-Coda/ → github.com/ → DawnbrandBots/yaml-yugi/
const YAML_YUGI_PATH = path.resolve(__dirname, '../../../../../DawnbrandBots/yaml-yugi/data/cards')
const LANG = 'ja'
const BATCH_SIZE = 200

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// リンクマーカー Unicode → 英語文字列マッピング
const ARROW_MAP: Record<string, string> = {
  '⬆': 'Top',
  '↗': 'Top-Right',
  '➡': 'Right',
  '↘': 'Bottom-Right',
  '⬇': 'Bottom',
  '↙': 'Bottom-Left',
  '⬅': 'Left',
  '↖': 'Top-Left',
}

// yaml-yugi の name.ja は <ruby>テキスト<rt>ルビ</rt></ruby> 形式のことがある
function parseJaName(raw: string | undefined): string {
  if (!raw) return ''
  return raw.replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/g, '$1').replace(/<[^>]+>/g, '')
}

interface YamlImage {
  index: number
  image?: string
}

interface YamlSet {
  set_number: string
  set_name: string
  rarities: string[]
}

interface YamlCard {
  konami_id?: number
  password?: number
  name?: Record<string, string>
  text?: Record<string, string>
  card_type?: string
  property?: string
  monster_type_line?: string
  attribute?: string
  level?: number
  rank?: number
  atk?: number | string
  def?: number | string
  pendulum_scale?: number
  pendulum_effect?: Record<string, string>
  link_arrows?: string[]
  link_num?: number
  materials?: string
  images?: YamlImage[]
  sets?: Record<string, YamlSet[]>
  yugipedia_page_id?: number
}

async function upsertBatch<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(table).upsert(batch, { onConflict })
    if (error) {
      throw new Error(`${table} upsert failed: ${error.message}`)
    }
  }
}

async function main() {
  console.log(`Reading YAML files from: ${YAML_YUGI_PATH}`)

  const files = fs
    .readdirSync(YAML_YUGI_PATH)
    .filter((f) => f.endsWith('.yaml'))
    .sort()

  console.log(`Found ${files.length} YAML files`)

  const cardRows: Record<string, unknown>[] = []
  const monsterRows: Record<string, unknown>[] = []
  const imageRows: Record<string, unknown>[] = []
  const setRows: Record<string, unknown>[] = []

  let parsed = 0
  let skipped = 0

  for (const file of files) {
    const raw = yaml.load(
      fs.readFileSync(path.join(YAML_YUGI_PATH, file), 'utf8')
    ) as YamlCard

    if (!raw.konami_id) {
      skipped++
      continue
    }

    const cardType = raw.card_type?.toLowerCase() as 'monster' | 'spell' | 'trap' | undefined
    if (!cardType || !['monster', 'spell', 'trap'].includes(cardType)) {
      skipped++
      continue
    }

    const jaName = parseJaName(raw.name?.[LANG])
    if (!jaName) {
      skipped++
      continue
    }

    // CARDS
    cardRows.push({
      konami_id: raw.konami_id,
      card_type: cardType,
      property: raw.property ?? null,
      name: jaName,
      ruby: raw.name?.ja_romaji ?? null,
      text: raw.text?.[LANG] ?? null,
      pendulum_text: raw.pendulum_effect?.[LANG] ?? null,
      yugipedia_page_id: raw.yugipedia_page_id ?? null,
    })

    // MONSTERS
    if (cardType === 'monster' && raw.monster_type_line) {
      const parts = raw.monster_type_line.split(' / ')
      const kind = parts[0]
      const type = parts.slice(1)
      const isLink = type.includes('Link')
      const isXyz = type.includes('Xyz')

      monsterRows.push({
        konami_id: raw.konami_id,
        kind,
        attribute: raw.attribute ?? '',
        type,
        level: !isLink && !isXyz ? (raw.level ?? null) : null,
        rank: isXyz ? (raw.rank ?? null) : null,
        atk: raw.atk === '?' ? null : (raw.atk ?? null),
        def: isLink ? null : raw.def === '?' ? null : (raw.def ?? null),
        scale: raw.pendulum_scale ?? null,
        link_arrows: raw.link_arrows
          ? raw.link_arrows.map((a) => ARROW_MAP[a] ?? a)
          : null,
        link_num: isLink ? (raw.link_num ?? raw.link_arrows?.length ?? null) : null,
        materials: raw.materials ?? null,
      })
    }

    // CARD_IMAGES
    if (raw.images) {
      for (const img of raw.images) {
        imageRows.push({
          konami_id: raw.konami_id,
          idx: String(img.index),
          image_url: null,
          illustration_url: null,
        })
      }
    }

    // CARD_SETS (日本語セットのみ)
    const jaSets = raw.sets?.[LANG] ?? []
    for (const s of jaSets) {
      for (const rarity of s.rarities) {
        setRows.push({
          konami_id: raw.konami_id,
          set_number: s.set_number,
          set_name: s.set_name,
          rarity,
        })
      }
    }

    parsed++
    if (parsed % 1000 === 0) {
      console.log(`  Parsed ${parsed} cards...`)
    }
  }

  console.log(`Parsed: ${parsed}, Skipped: ${skipped}`)
  console.log('Upserting cards...')

  // 1. CARDS を upsert して konami_id → id のマッピングを取得
  for (let i = 0; i < cardRows.length; i += BATCH_SIZE) {
    const batch = cardRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('cards')
      .upsert(
        batch.map(({ konami_id, ...rest }) => ({ konami_id, ...rest })),
        { onConflict: 'konami_id' }
      )
    if (error) throw new Error(`cards upsert failed: ${error.message}`)
  }

  // konami_id → card.id のマップを取得
  console.log('Fetching card ID map...')
  const allKonamiIds = cardRows.map((r) => r.konami_id as number)
  const idMap = new Map<number, number>()
  for (let i = 0; i < allKonamiIds.length; i += 1000) {
    const chunk = allKonamiIds.slice(i, i + 1000)
    const { data, error } = await supabase
      .from('cards')
      .select('id, konami_id')
      .in('konami_id', chunk)
    if (error) throw new Error(`card id fetch failed: ${error.message}`)
    for (const row of data ?? []) {
      idMap.set(row.konami_id, row.id)
    }
  }

  // 2. MONSTERS upsert
  console.log('Upserting monsters...')
  const monsterUpsertRows = monsterRows
    .map(({ konami_id, ...rest }) => {
      const cardId = idMap.get(konami_id as number)
      if (!cardId) return null
      return { card_id: cardId, ...rest }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  await upsertBatch('monsters', monsterUpsertRows, 'card_id')

  // 3. CARD_IMAGES upsert
  console.log('Upserting card_images...')
  const imageUpsertRows = imageRows
    .map(({ konami_id, ...rest }) => {
      const cardId = idMap.get(konami_id as number)
      if (!cardId) return null
      return { card_id: cardId, ...rest }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  await upsertBatch('card_images', imageUpsertRows, 'card_id,idx')

  // 4. CARD_SETS upsert
  console.log('Upserting card_sets...')
  const setUpsertRows = setRows
    .map(({ konami_id, ...rest }) => {
      const cardId = idMap.get(konami_id as number)
      if (!cardId) return null
      return { card_id: cardId, ...rest }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  await upsertBatch('card_sets', setUpsertRows, 'card_id,set_number,rarity')

  console.log('Seed complete!')
  console.log(`  cards: ${cardRows.length}`)
  console.log(`  monsters: ${monsterUpsertRows.length}`)
  console.log(`  card_images: ${imageUpsertRows.length}`)
  console.log(`  card_sets: ${setUpsertRows.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
