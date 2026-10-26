import { describe, expect, it } from 'vitest';
import { carSchema } from '../test/fixtures.js';
import { CONDITIONS, toCreatePayload, toUpdatePayload, validatePrice, valuesFromAd } from './adForm.js';

const values = (overrides = {}) => ({
  categorySlug: 'voitures',
  title: '  Peugeot 208  ',
  description: ' Très bon état, entretien suivi. ',
  itemCondition: 'good',
  attributes: { marque: 'Peugeot', modele: ' 208 ', annee: '2019', kilometrage: 80000, carburant: 'Diesel' },
  price: '8 500',
  place: { city: 'Lyon', postalCode: '69003', lat: 45.758, lng: 4.8351 },
  shippingAvailable: true,
  ...overrides,
});

describe('validatePrice', () => {
  it('accepte un prix valide, y compris gratuit', () => {
    expect(validatePrice('8 500')).toBe(true);
    expect(validatePrice('12,50')).toBe(true);
    expect(validatePrice('0')).toBe(true);
  });

  it('refuse le vide, le négatif, le texte et les trop grands montants avec un message', () => {
    expect(validatePrice('')).toBe('Indiquez un prix en euros (0 si gratuit)');
    expect(validatePrice('-5')).toBe('Indiquez un prix en euros (0 si gratuit)');
    expect(validatePrice('abc')).toBe('Indiquez un prix en euros (0 si gratuit)');
    expect(validatePrice('12,999')).toBe('Indiquez un prix en euros (0 si gratuit)');
    expect(validatePrice('30 000 000')).toBe('Le prix ne peut pas dépasser 20 000 000 €');
  });
});

describe('toCreatePayload', () => {
  const payload = toCreatePayload(values(), carSchema.fields);

  it('convertit le prix en centimes et nettoie les textes', () => {
    expect(payload.priceCents).toBe(850000);
    expect(payload.title).toBe('Peugeot 208');
    expect(payload.description).toBe('Très bon état, entretien suivi.');
  });

  it('envoie la catégorie, la ville et les coordonnées', () => {
    expect(payload).toMatchObject({ categorySlug: 'voitures', city: 'Lyon', postalCode: '69003', lat: 45.758, lng: 4.8351, shippingAvailable: true, itemCondition: 'good' });
  });

  it('convertit les champs numériques et nettoie les textes des champs dynamiques', () => {
    expect(payload.attributes).toEqual({ marque: 'Peugeot', modele: '208', annee: 2019, kilometrage: 80000, carburant: 'Diesel' });
  });

  it('écarte les attributs qui n\'appartiennent pas à la catégorie (catégorie changée après saisie)', () => {
    const result = toCreatePayload(values({ attributes: { marque: 'Peugeot', surface: 40, taille: 'M' } }), carSchema.fields);
    expect(result.attributes).toEqual({ marque: 'Peugeot' });
  });

  it('omet les valeurs vides, NaN ou absentes', () => {
    const result = toCreatePayload(values({ attributes: { marque: '', modele: '  ', annee: NaN, kilometrage: undefined, carburant: 'Diesel' } }), carSchema.fields);
    expect(result.attributes).toEqual({ carburant: 'Diesel' });
  });

  it('omet l\'état s\'il n\'est pas renseigné', () => {
    expect(toCreatePayload(values({ itemCondition: '' }), carSchema.fields)).not.toHaveProperty('itemCondition');
  });

  it('garde une case à cocher décochée (false) pour un champ booléen', () => {
    const fields = [{ key: 'meuble', label: 'Meublé', type: 'boolean' }];
    expect(toCreatePayload(values({ attributes: { meuble: false } }), fields).attributes).toEqual({ meuble: false });
  });

  it('fonctionne pour une catégorie sans champ dynamique', () => {
    expect(toCreatePayload(values({ attributes: { marque: 'x' } }), []).attributes).toEqual({});
    expect(toCreatePayload(values({ attributes: undefined }), undefined).attributes).toEqual({});
  });
});

describe('toUpdatePayload', () => {
  it('est identique au dépôt sans la catégorie, que le serveur refuse de modifier', () => {
    const update = toUpdatePayload(values(), carSchema.fields);
    expect(update).not.toHaveProperty('categorySlug');
    expect(update.priceCents).toBe(850000);
    expect(update.attributes.annee).toBe(2019);
  });
});

describe('CONDITIONS', () => {
  it('couvre les cinq états acceptés par le serveur', () => {
    expect(Object.keys(CONDITIONS)).toEqual(['new', 'like_new', 'good', 'fair', 'for_parts']);
  });
});

describe('valuesFromAd', () => {
  const ad = {
    title: 'Peugeot 208', description: 'Très bon état.', priceCents: 850000, itemCondition: 'good',
    city: 'Lyon', postalCode: '69003', lat: 45.76, lng: 4.84, shippingAvailable: true,
    category: { slug: 'voitures' }, attributes: { marque: 'Peugeot', kilometrage: 80000 },
  };

  it('prépare les valeurs du formulaire de modification à partir de la fiche', () => {
    expect(valuesFromAd(ad)).toEqual({
      categorySlug: 'voitures', title: 'Peugeot 208', description: 'Très bon état.', itemCondition: 'good',
      attributes: { marque: 'Peugeot', kilometrage: 80000 }, price: '8500',
      place: { city: 'Lyon', postalCode: '69003', lat: 45.76, lng: 4.84 }, shippingAvailable: true,
    });
  });

  it('affiche les centimes avec une virgule et gère un état absent ou une annonce sans coordonnées', () => {
    const values = valuesFromAd({ ...ad, priceCents: 1250, itemCondition: null, lat: null, lng: null, attributes: undefined });
    expect(values.price).toBe('12,50');
    expect(values.itemCondition).toBe('');
    expect(values.attributes).toEqual({});
    expect(values.place).toEqual({ city: 'Lyon', postalCode: '69003', lat: undefined, lng: undefined });
  });

  it('est l\'inverse de toUpdatePayload (aller-retour sans perte)', () => {
    const payload = toUpdatePayload(valuesFromAd(ad), [{ key: 'marque', type: 'select' }, { key: 'kilometrage', type: 'number' }]);
    expect(payload).toMatchObject({ title: 'Peugeot 208', priceCents: 850000, city: 'Lyon', lat: 45.76, itemCondition: 'good' });
    expect(payload.attributes).toEqual({ marque: 'Peugeot', kilometrage: 80000 });
  });
});
