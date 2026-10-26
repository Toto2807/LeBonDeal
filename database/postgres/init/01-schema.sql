-- LeBonDeal : schéma PostgreSQL
-- PostgreSQL est la source de vérité : identités, annonces, favoris, ventes, avis, signalements.
-- Ce script ne s'exécute qu'au PREMIER démarrage du volume pgdata (voir « Réinitialiser les bases »).

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS citext;         -- e-mails insensibles à la casse
CREATE EXTENSION IF NOT EXISTS unaccent;       -- « velo » doit trouver « vélo »
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- recherche floue (fautes de frappe)
CREATE EXTENSION IF NOT EXISTS cube;           -- requis par earthdistance
CREATE EXTENSION IF NOT EXISTS earthdistance;  -- distance entre deux points GPS (recherche par rayon)

-- Configuration de recherche plein texte : français + insensible aux accents
CREATE TEXT SEARCH CONFIGURATION french_unaccent (COPY = french);
ALTER TEXT SEARCH CONFIGURATION french_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;

-- ─── Types énumérés ──────────────────────────────────────────────────────────
CREATE TYPE user_role     AS ENUM ('user', 'admin');
CREATE TYPE ad_status     AS ENUM ('draft', 'active', 'reserved', 'sold', 'archived', 'deleted');
CREATE TYPE ad_condition  AS ENUM ('new', 'like_new', 'good', 'fair', 'for_parts');
CREATE TYPE report_status AS ENUM ('open', 'dismissed', 'actioned');

-- ─── Mise à jour automatique de updated_at ───────────────────────────────────
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ─── Utilisateurs ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext      NOT NULL UNIQUE,
  password_hash     text        NOT NULL,
  display_name      varchar(60) NOT NULL CHECK (char_length(display_name) >= 2),
  avatar_url        text,
  phone             varchar(20),
  bio               text,
  city              varchar(120),
  postal_code       varchar(10),
  role              user_role   NOT NULL DEFAULT 'user',
  is_banned         boolean     NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Catégories (arbre à 2 niveaux : parent_id NULL = catégorie racine) ─────
CREATE TABLE categories (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id integer     REFERENCES categories(id) ON DELETE RESTRICT,
  slug      varchar(80) NOT NULL UNIQUE,
  name      varchar(80) NOT NULL,
  icon      varchar(40),                      -- nom d'icône lucide-react, ex. 'car'
  position  integer     NOT NULL DEFAULT 0
);
CREATE INDEX categories_parent_idx ON categories (parent_id);

-- ─── Annonces ────────────────────────────────────────────────────────────────
-- Les champs propres à une catégorie (kilométrage, surface, taille…) vivent dans MongoDB
-- (collection ad_details), reliés par ads.id.
CREATE TABLE ads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id          uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id        integer       NOT NULL REFERENCES categories(id),
  title              varchar(120)  NOT NULL CHECK (char_length(title) >= 3),
  description        text          NOT NULL CHECK (char_length(description) >= 10),
  price_cents        integer       NOT NULL CHECK (price_cents >= 0),   -- 12,50 € = 1250
  item_condition     ad_condition,
  status             ad_status     NOT NULL DEFAULT 'active',
  city               varchar(120)  NOT NULL,
  postal_code        varchar(10)   NOT NULL,
  lat                double precision CHECK (lat BETWEEN -90 AND 90),
  lng                double precision CHECK (lng BETWEEN -180 AND 180),
  shipping_available boolean       NOT NULL DEFAULT false,
  published_at       timestamptz   NOT NULL DEFAULT now(),              -- « remonter l'annonce » = mettre à jour
  expires_at         timestamptz   NOT NULL DEFAULT now() + interval '60 days',
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  search_vector      tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('french_unaccent', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french_unaccent', coalesce(description, '')), 'B')
  ) STORED,
  CHECK ((lat IS NULL) = (lng IS NULL))
);
CREATE TRIGGER ads_updated_at BEFORE UPDATE ON ads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ads_feed_idx       ON ads (published_at DESC) WHERE status = 'active';
CREATE INDEX ads_category_idx   ON ads (category_id, published_at DESC) WHERE status = 'active';
CREATE INDEX ads_seller_idx     ON ads (seller_id, status);
CREATE INDEX ads_price_idx      ON ads (price_cents) WHERE status = 'active';
CREATE INDEX ads_search_idx     ON ads USING gin (search_vector);
CREATE INDEX ads_title_trgm_idx ON ads USING gin (title gin_trgm_ops);
CREATE INDEX ads_geo_idx        ON ads USING gist (ll_to_earth(lat, lng));

-- ─── Photos des annonces ─────────────────────────────────────────────────────
CREATE TABLE ad_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id      uuid     NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  url        text     NOT NULL,
  thumb_url  text,
  position   smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9),   -- 10 photos max
  created_at timestamptz NOT NULL DEFAULT now(),
  -- DEFERRABLE : permet d'échanger deux positions dans une même transaction (réorganiser les photos)
  UNIQUE (ad_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- ─── Favoris (relation N-N entre users et ads) ───────────────────────────────
CREATE TABLE favorites (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id      uuid NOT NULL REFERENCES ads(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ad_id)
);
CREATE INDEX favorites_ad_idx ON favorites (ad_id);

-- ─── Ventes : « marquer comme vendue à X » ───────────────────────────────────
CREATE TABLE transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id       uuid    NOT NULL UNIQUE REFERENCES ads(id) ON DELETE CASCADE,   -- une annonce = une vente
  seller_id   uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id    uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (seller_id <> buyer_id)
);

-- ─── Avis : uniquement entre les deux parties d'une vente réelle ─────────────
CREATE TABLE reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid     NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  reviewer_id    uuid     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id    uuid     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, reviewer_id),          -- un seul avis par personne et par vente
  CHECK (reviewer_id <> reviewee_id)
);
CREATE INDEX reviews_reviewee_idx ON reviews (reviewee_id);

CREATE FUNCTION check_review_participants() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t transactions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM transactions WHERE id = NEW.transaction_id;
  IF NOT ((NEW.reviewer_id = t.buyer_id  AND NEW.reviewee_id = t.seller_id)
       OR (NEW.reviewer_id = t.seller_id AND NEW.reviewee_id = t.buyer_id)) THEN
    RAISE EXCEPTION 'Avis refusé : auteur et destinataire doivent être les deux parties de la vente';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reviews_participants BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION check_review_participants();

-- ─── Signalements (modération) ───────────────────────────────────────────────
CREATE TABLE reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id            uuid        REFERENCES ads(id)   ON DELETE CASCADE,
  reported_user_id uuid        REFERENCES users(id) ON DELETE CASCADE,
  reason           varchar(40) NOT NULL CHECK (reason IN ('spam', 'scam', 'prohibited', 'wrong_category', 'other')),
  details          text,
  status           report_status NOT NULL DEFAULT 'open',
  handled_by       uuid        REFERENCES users(id) ON DELETE SET NULL,
  handled_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ad_id IS NOT NULL OR reported_user_id IS NOT NULL)
);
CREATE INDEX reports_open_idx ON reports (created_at) WHERE status = 'open';

-- ─── Vues ────────────────────────────────────────────────────────────────────
-- Carte d'annonce : ce dont la liste de résultats a besoin, sans la description complète.
CREATE VIEW v_ad_cards AS
SELECT a.id, a.seller_id, a.category_id, a.title, a.price_cents, a.item_condition, a.status,
       a.city, a.postal_code, a.lat, a.lng, a.shipping_available, a.published_at, a.search_vector,
       u.display_name AS seller_name,
       (SELECT i.thumb_url FROM ad_images i WHERE i.ad_id = a.id ORDER BY i.position LIMIT 1) AS cover_url
FROM ads a
JOIN users u ON u.id = a.seller_id
WHERE a.deleted_at IS NULL;

-- Note moyenne et nombre d'avis reçus par utilisateur.
CREATE VIEW v_seller_stats AS
SELECT u.id AS user_id,
       round(avg(r.rating), 1) AS rating_avg,
       count(r.id)             AS rating_count
FROM users u
LEFT JOIN reviews r ON r.reviewee_id = u.id
GROUP BY u.id;
