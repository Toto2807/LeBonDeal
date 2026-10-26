-- Recherche tolérante aux fautes de frappe (pg_trgm) : utile quand la recherche plein texte ne renvoie rien.
-- Aussi pour détecter des annonces en double : similarity(title, autre_titre) > 0.6.
-- $1 = texte saisi, ex. 'vleo'
SELECT id, title, similarity(title, $1) AS score
FROM ads
WHERE status = 'active' AND title % $1          -- opérateur % : similarité au-dessus du seuil (0,3 par défaut)
ORDER BY score DESC
LIMIT 10;
