-- Indicateur « bon prix » : compare le prix d'une annonce à la médiane des annonces actives de sa catégorie.
-- $1 = id de l'annonce. Moins de 5 annonces comparables : pas d'avis.
SELECT a.id,
       a.price_cents,
       m.median_cents,
       CASE
         WHEN m.n < 5                              THEN 'unknown'
         WHEN a.price_cents <= m.median_cents*0.85 THEN 'good_deal'
         WHEN a.price_cents >= m.median_cents*1.15 THEN 'high'
         ELSE 'fair'
       END AS price_hint
FROM ads a
CROSS JOIN LATERAL (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s.price_cents) AS median_cents,
         count(*) AS n
  FROM ads s
  WHERE s.category_id = a.category_id AND s.status = 'active' AND s.id <> a.id
) m
WHERE a.id = $1;
