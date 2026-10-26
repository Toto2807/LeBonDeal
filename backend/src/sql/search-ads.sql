-- Recherche d'annonces : texte + catégorie (et ses sous-catégories) + prix + rayon.
-- $1 texte | $2 slug de catégorie | $3 prix min (centimes) | $4 prix max (centimes)
-- $5 latitude | $6 longitude | $7 rayon en mètres | $8 limite | $9 décalage (pagination)
-- $10 liste d'identifiants autorisés (résultat d'un filtre MongoDB sur les champs dynamiques), ou NULL
-- Un paramètre NULL désactive son filtre. Le tri (ORDER BY) est à construire côté Node
-- depuis une liste blanche (recent | price_asc | price_desc | relevance) : jamais d'entrée utilisateur brute.
WITH RECURSIVE cat AS (
  SELECT id FROM categories WHERE slug = $2
  UNION ALL
  SELECT c.id FROM categories c JOIN cat ON c.parent_id = cat.id
)
SELECT v.id, v.title, v.price_cents, v.city, v.cover_url, v.published_at,
       CASE WHEN $5::float8 IS NULL THEN NULL
            ELSE round(earth_distance(ll_to_earth($5, $6), ll_to_earth(v.lat, v.lng)) / 1000)
       END AS distance_km,
       count(*) OVER () AS total                       -- nombre total de résultats, pour la pagination
FROM v_ad_cards v
WHERE v.status = 'active'
  AND ($10::uuid[] IS NULL OR v.id = ANY($10))
  AND ($1::text   IS NULL OR v.search_vector @@ websearch_to_tsquery('french_unaccent', $1))
  AND ($2::text   IS NULL OR v.category_id IN (SELECT id FROM cat))
  AND ($3::int    IS NULL OR v.price_cents >= $3)
  AND ($4::int    IS NULL OR v.price_cents <= $4)
  AND ($5::float8 IS NULL OR (earth_box(ll_to_earth($5, $6), $7) @> ll_to_earth(v.lat, v.lng)   -- utilise l'index GiST
                              AND earth_distance(ll_to_earth($5, $6), ll_to_earth(v.lat, v.lng)) <= $7))
ORDER BY v.published_at DESC
LIMIT $8 OFFSET $9;
