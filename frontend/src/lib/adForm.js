import { centsToEuros, eurosToCents } from './money.js';

export const CONDITIONS = { new: 'Neuf', like_new: 'Comme neuf', good: 'Bon état', fair: 'État correct', for_parts: 'Pour pièces' };

const MAX_PRICE_CENTS = 2_000_000_000; // limite du serveur (colonne integer)

// Règle de validation du champ « prix » pour react-hook-form : true si valide, sinon le message à afficher.
export function validatePrice(input) {
  const cents = eurosToCents(input);
  if (cents === null) return 'Indiquez un prix en euros (0 si gratuit)';
  if (cents > MAX_PRICE_CENTS) return 'Le prix ne peut pas dépasser 20 000 000 €';
  return true;
}

// Ne garde que les champs de la catégorie choisie (on a pu en changer après avoir saisi), avec le bon type.
// Les valeurs vides, NaN ou absentes sont omises : le serveur refuse un champ obligatoire manquant.
export function cleanAttributes(attributes, fields = []) {
  const result = {};
  for (const field of fields) {
    const raw = attributes?.[field.key];
    if (field.type === 'boolean') {
      if (typeof raw === 'boolean') result[field.key] = raw;
    } else if (field.type === 'number') {
      const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim().replace(',', '.')) : NaN;
      if (!Number.isNaN(number)) result[field.key] = number;
    } else if (typeof raw === 'string' && raw.trim() !== '') {
      result[field.key] = raw.trim();
    }
  }
  return result;
}

// values : valeurs du formulaire · fields : définition des champs de la catégorie (GET /api/categories/:slug/schema).
export function toUpdatePayload(values, fields) {
  const payload = {
    title: values.title.trim(),
    description: values.description.trim(),
    priceCents: eurosToCents(values.price),
    city: values.place.city,
    postalCode: values.place.postalCode,
    lat: values.place.lat,
    lng: values.place.lng,
    shippingAvailable: Boolean(values.shippingAvailable),
    attributes: cleanAttributes(values.attributes, fields),
  };
  if (values.itemCondition) payload.itemCondition = values.itemCondition;
  return payload;
}

// Fiche d'une annonce (AdDetail) -> valeurs initiales du formulaire de modification.
export function valuesFromAd(ad) {
  return {
    categorySlug: ad.category.slug,
    title: ad.title,
    description: ad.description,
    itemCondition: ad.itemCondition ?? '',
    attributes: { ...(ad.attributes ?? {}) },
    price: centsToEuros(ad.priceCents),
    place: { city: ad.city, postalCode: ad.postalCode, lat: ad.lat ?? undefined, lng: ad.lng ?? undefined },
    shippingAvailable: Boolean(ad.shippingAvailable),
  };
}

export const toCreatePayload = (values, fields) => ({ ...toUpdatePayload(values, fields), categorySlug: values.categorySlug });
