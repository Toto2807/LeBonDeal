-- LeBonDeal : catégories de départ (6 racines, 21 sous-catégories)
-- Le champ icon contient un nom d'icône lucide-react (kebab-case) ; le frontend fait la correspondance.

INSERT INTO categories (slug, name, icon, position) VALUES
  ('vehicules',  'Véhicules',       'car',        1),
  ('immobilier', 'Immobilier',      'house',      2),
  ('multimedia', 'Multimédia',      'smartphone', 3),
  ('maison',     'Maison & Jardin', 'sofa',       4),
  ('mode',       'Mode',            'shirt',      5),
  ('loisirs',    'Loisirs',         'gamepad-2',  6);

INSERT INTO categories (parent_id, slug, name, position)
SELECT p.id, v.slug, v.name, v.position
FROM (VALUES
  ('vehicules',  'voitures',              'Voitures',                1),
  ('vehicules',  'motos',                 'Motos',                   2),
  ('vehicules',  'velos',                 'Vélos',                   3),
  ('vehicules',  'equipement-auto',       'Équipement auto',         4),
  ('immobilier', 'ventes-immobilieres',   'Ventes immobilières',     1),
  ('immobilier', 'locations',             'Locations',               2),
  ('immobilier', 'colocations',           'Colocations',             3),
  ('multimedia', 'informatique',          'Informatique',            1),
  ('multimedia', 'telephones',            'Téléphones',              2),
  ('multimedia', 'consoles-jeux-video',   'Consoles & jeux vidéo',   3),
  ('multimedia', 'image-son',             'Image & son',             4),
  ('maison',     'ameublement',           'Ameublement',             1),
  ('maison',     'electromenager',        'Électroménager',          2),
  ('maison',     'bricolage',             'Bricolage',               3),
  ('maison',     'jardinage',             'Jardinage',               4),
  ('mode',       'vetements',             'Vêtements',               1),
  ('mode',       'chaussures',            'Chaussures',              2),
  ('mode',       'montres-bijoux',        'Montres & bijoux',        3),
  ('mode',       'sacs-accessoires',      'Sacs & accessoires',      4),
  ('loisirs',    'sport',                 'Sport',                   1),
  ('loisirs',    'instruments-musique',   'Instruments de musique',  2)
) AS v(parent_slug, slug, name, position)
JOIN categories p ON p.slug = v.parent_slug;
