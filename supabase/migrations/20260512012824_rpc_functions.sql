-- ============================================================
-- RPC 関数: カード一覧・マイコレクション取得
-- ============================================================

-- ----------------------------------------------------------
-- get_card_list: カード一覧取得（フィルタ・ページネーション・所持枚数集計）
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_card_list(
    p_card_type TEXT    DEFAULT NULL,
    p_attribute TEXT    DEFAULT NULL,
    p_kind      TEXT    DEFAULT NULL,
    p_keyword   TEXT    DEFAULT NULL,
    p_limit     INTEGER DEFAULT 50,
    p_offset    INTEGER DEFAULT 0,
    p_user_id   UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total INTEGER;
    v_items JSON;
BEGIN
    -- 絞り込み後の総件数
    SELECT COUNT(DISTINCT c.id) INTO v_total
    FROM cards c
    LEFT JOIN monsters m ON m.card_id = c.id
    WHERE
        (p_card_type IS NULL OR c.card_type = p_card_type)
        AND (p_attribute IS NULL OR m.attribute = p_attribute)
        AND (p_kind IS NULL OR m.kind = p_kind)
        AND (p_keyword IS NULL OR c.name ILIKE '%' || p_keyword || '%');

    -- ページネーション済みアイテム取得
    SELECT json_agg(row_to_json(q)) INTO v_items
    FROM (
        SELECT
            c.id,
            c.konami_id,
            c.card_type,
            c.property,
            c.name,
            c.ruby,
            row_to_json(img.*) AS thumbnail,
            CASE
                WHEN c.card_type = 'monster' THEN row_to_json(m.*)
                ELSE NULL
            END AS monster,
            CASE
                WHEN p_user_id IS NOT NULL THEN (
                    SELECT COALESCE(SUM(ucc.count), 0)
                    FROM user_card_counts ucc
                    JOIN card_sets cs ON cs.id = ucc.card_set_id
                    WHERE cs.card_id = c.id AND ucc.user_id = p_user_id
                )
                ELSE NULL
            END AS total_count
        FROM cards c
        LEFT JOIN monsters m ON m.card_id = c.id
        LEFT JOIN LATERAL (
            SELECT ci.id, ci.idx, ci.image_url, ci.illustration_url
            FROM card_images ci
            WHERE ci.card_id = c.id
            ORDER BY ci.idx ASC
            LIMIT 1
        ) img ON true
        WHERE
            (p_card_type IS NULL OR c.card_type = p_card_type)
            AND (p_attribute IS NULL OR m.attribute = p_attribute)
            AND (p_kind IS NULL OR m.kind = p_kind)
            AND (p_keyword IS NULL OR c.name ILIKE '%' || p_keyword || '%')
        ORDER BY c.id ASC
        LIMIT p_limit OFFSET p_offset
    ) q;

    RETURN json_build_object(
        'total', v_total,
        'items', COALESCE(v_items, '[]'::json)
    );
END;
$$;

-- ----------------------------------------------------------
-- get_my_collection: 所持カード一覧取得（枚数1枚以上のみ）
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_collection(
    p_user_id   UUID,
    p_card_type TEXT    DEFAULT NULL,
    p_attribute TEXT    DEFAULT NULL,
    p_kind      TEXT    DEFAULT NULL,
    p_keyword   TEXT    DEFAULT NULL,
    p_limit     INTEGER DEFAULT 50,
    p_offset    INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total INTEGER;
    v_items JSON;
BEGIN
    -- 絞り込み後の総件数（所持枚数 > 0 のカードのみ）
    SELECT COUNT(DISTINCT c.id) INTO v_total
    FROM cards c
    LEFT JOIN monsters m ON m.card_id = c.id
    WHERE
        EXISTS (
            SELECT 1
            FROM user_card_counts ucc
            JOIN card_sets cs ON cs.id = ucc.card_set_id
            WHERE cs.card_id = c.id
              AND ucc.user_id = p_user_id
              AND ucc.count > 0
        )
        AND (p_card_type IS NULL OR c.card_type = p_card_type)
        AND (p_attribute IS NULL OR m.attribute = p_attribute)
        AND (p_kind IS NULL OR m.kind = p_kind)
        AND (p_keyword IS NULL OR c.name ILIKE '%' || p_keyword || '%');

    -- ページネーション済みアイテム取得
    SELECT json_agg(row_to_json(q)) INTO v_items
    FROM (
        SELECT
            c.id,
            c.konami_id,
            c.card_type,
            c.property,
            c.name,
            c.ruby,
            row_to_json(img.*) AS thumbnail,
            CASE
                WHEN c.card_type = 'monster' THEN row_to_json(m.*)
                ELSE NULL
            END AS monster,
            (
                SELECT COALESCE(SUM(ucc.count), 0)
                FROM user_card_counts ucc
                JOIN card_sets cs ON cs.id = ucc.card_set_id
                WHERE cs.card_id = c.id AND ucc.user_id = p_user_id
            ) AS total_count
        FROM cards c
        LEFT JOIN monsters m ON m.card_id = c.id
        LEFT JOIN LATERAL (
            SELECT ci.id, ci.idx, ci.image_url, ci.illustration_url
            FROM card_images ci
            WHERE ci.card_id = c.id
            ORDER BY ci.idx ASC
            LIMIT 1
        ) img ON true
        WHERE
            EXISTS (
                SELECT 1
                FROM user_card_counts ucc
                JOIN card_sets cs ON cs.id = ucc.card_set_id
                WHERE cs.card_id = c.id
                  AND ucc.user_id = p_user_id
                  AND ucc.count > 0
            )
            AND (p_card_type IS NULL OR c.card_type = p_card_type)
            AND (p_attribute IS NULL OR m.attribute = p_attribute)
            AND (p_kind IS NULL OR m.kind = p_kind)
            AND (p_keyword IS NULL OR c.name ILIKE '%' || p_keyword || '%')
        ORDER BY c.id ASC
        LIMIT p_limit OFFSET p_offset
    ) q;

    RETURN json_build_object(
        'total', v_total,
        'items', COALESCE(v_items, '[]'::json)
    );
END;
$$;
