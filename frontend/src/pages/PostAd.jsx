import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError, api } from '../api/client.js';
import ExistingImages from '../components/ads/ExistingImages.jsx';
import CityPicker from '../components/forms/CityPicker.jsx';
import DynamicFields from '../components/forms/DynamicFields.jsx';
import Field from '../components/forms/Field.jsx';
import ImageUploader from '../components/forms/ImageUploader.jsx';
import Stepper from '../components/forms/Stepper.jsx';
import Button, { buttonClasses } from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAd } from '../hooks/useAd.js';
import { useCategories, useCategorySchema } from '../hooks/useCategories.js';
import { useDraft } from '../hooks/useDraft.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { formatAttributeValue } from '../lib/attributes.js';
import { CONDITIONS, cleanAttributes, toCreatePayload, toUpdatePayload, validatePrice, valuesFromAd } from '../lib/adForm.js';
import { formatPrice } from '../lib/format.js';
import { eurosToCents } from '../lib/money.js';

const MAX_PHOTOS = 10;
const ALL_STEPS = [
  { key: 'category', label: 'Catégorie' },
  { key: 'details', label: 'Détails' },
  { key: 'photos', label: 'Photos' },
  { key: 'price', label: 'Prix et lieu' },
  { key: 'summary', label: 'Récapitulatif' },
];
const EMPTY = { categorySlug: '', title: '', description: '', itemCondition: '', attributes: {}, price: '', place: null, shippingAvailable: false };
const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

// /deposer : nouveau formulaire · /annonces/:id/modifier : même formulaire prérempli depuis l'annonce.
export default function PostAd() {
  const { id } = useParams();
  return id ? <EditAd id={id} /> : <AdForm />;
}

function Notice({ title, children }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </section>
  );
}

// Charge l'annonce et vérifie les droits AVANT d'afficher le formulaire (le serveur les revérifie à l'enregistrement).
function EditAd({ id }) {
  usePageTitle("Modifier l'annonce");
  const { user } = useAuth();
  const { data: ad, isPending, isError, error, refetch } = useAd(id);

  if (isPending) {
    return (
      <div role="status" className="mx-auto max-w-2xl space-y-3 px-4 py-6">
        <span className="sr-only">Chargement de l'annonce…</span>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Notice title="Annonce introuvable">
          <Link to="/compte" className="mt-6 inline-block font-medium text-brand-700 underline">Retour à mes annonces</Link>
        </Notice>
      );
    }
    return (
      <section role="alert" className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-red-700">Impossible de charger cette annonce. Vérifiez votre connexion et réessayez.</p>
        <Button className="mt-4" onClick={() => refetch()}>Réessayer</Button>
      </section>
    );
  }
  if (ad.seller.id !== user.id) {
    return (
      <Notice title="Vous ne pouvez pas modifier cette annonce">
        <Link to={`/annonces/${ad.id}`} className="mt-6 inline-block font-medium text-brand-700 underline">Voir l'annonce</Link>
      </Notice>
    );
  }
  if (ad.status === 'sold') {
    return (
      <Notice title="Une annonce vendue ne peut plus être modifiée">
        <Link to={`/annonces/${ad.id}`} className="mt-6 inline-block font-medium text-brand-700 underline">Voir l'annonce</Link>
      </Notice>
    );
  }
  return <AdForm ad={ad} />;
}

function AdForm({ ad }) {
  const edit = Boolean(ad);
  usePageTitle(edit ? "Modifier l'annonce" : 'Déposer une annonce');
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const draft = useDraft(`lbd_draft_ad:${user.id}`); // un brouillon par utilisateur, même sur un navigateur partagé
  const steps = edit ? ALL_STEPS.filter((s) => s.key !== 'category') : ALL_STEPS; // la catégorie ne change plus après le dépôt
  const last = steps.length - 1;

  // Pas de brouillon en modification : l'annonce elle-même est la référence.
  const [restored, setRestored] = useState(() => {
    if (edit) return null;
    const saved = draft.load();
    return saved && typeof saved === 'object' ? saved : null;
  });
  const [formKey, setFormKey] = useState(0);
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState([]);
  const [submit, setSubmit] = useState({ busy: false, error: null, done: null });
  const publishing = useRef(false); // garde contre le double clic : un état React n'est mis à jour qu'au rendu suivant
  const published = useRef(false);
  const headingRef = useRef(null);
  const shownStep = useRef(0); // dernière étape dont le titre a reçu le focus

  const { register, control, watch, trigger, reset, formState: { errors } } = useForm({
    defaultValues: edit ? valuesFromAd(ad) : { ...EMPTY, ...restored },
  });
  const values = watch();
  const { data: categories = [] } = useCategories();
  const { data: schema } = useCategorySchema(values.categorySlug);
  const live = useAd(edit ? ad.id : undefined); // photos à jour après chaque suppression ou réordonnancement
  const existingImages = live.data?.images ?? ad?.images ?? [];
  const photoRoom = MAX_PHOTOS - existingImages.length;

  // Brouillon : enregistré à chaque modification faite par l'utilisateur (pas lors d'une réinitialisation).
  useEffect(() => {
    if (edit) return undefined;
    const subscription = watch((current, { type }) => {
      if (type === 'change' && !published.current) draft.save(current);
    });
    return () => subscription.unsubscribe();
  }, [edit, watch, draft]);

  // À chaque changement d'étape, le focus passe au titre de l'étape : indispensable au clavier et aux lecteurs d'écran.
  // On compare à l'étape précédente plutôt qu'à « premier rendu » : en développement, StrictMode exécute chaque effet deux fois,
  // et le titre volerait alors le focus dès l'ouverture de la page.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  const currentKey = steps[step].key;
  const fieldsOfStep = {
    category: ['categorySlug'],
    details: ['title', 'description', 'itemCondition', ...(schema?.fields ?? []).map((field) => `attributes.${field.key}`)],
    photos: [],
    price: ['price', 'place'],
    summary: [],
  }[currentKey];

  async function goNext() {
    // `shouldFocus` amène le curseur sur le premier champ invalide : sans cela, un utilisateur au clavier ne sait pas où est l'erreur.
    if (fieldsOfStep.length === 0 || (await trigger(fieldsOfStep, { shouldFocus: true }))) setStep((current) => Math.min(current + 1, last));
  }

  function startOver() {
    draft.clear();
    reset(EMPTY);
    setRestored(null);
    setFiles([]);
    setStep(0);
    setFormKey((key) => key + 1);
  }

  async function submitAd() {
    if (publishing.current) return;
    publishing.current = true;
    setSubmit({ busy: true, error: null, done: null });

    let saved;
    try {
      saved = edit
        ? (await api(`/ads/${ad.id}`, { method: 'PATCH', body: toUpdatePayload(values, schema?.fields) })).data
        : (await api('/ads', { method: 'POST', body: toCreatePayload(values, schema?.fields) })).data;
    } catch (error) {
      publishing.current = false;
      const message = error instanceof ApiError
        ? [error.message, ...(error.details ?? []).map((detail) => detail.message)].join(' — ')
        : `${edit ? 'Enregistrement' : 'Publication'} impossible, vérifiez votre connexion et réessayez.`;
      setSubmit({ busy: false, error: message, done: null });
      return;
    }

    // L'annonce est enregistrée : on ne la recrée plus jamais, même si l'envoi des photos échoue.
    published.current = true;
    draft.clear();
    const adId = saved.id ?? ad?.id;

    // Une photo par requête : chaque requête reste petite (limite de taille du serveur web) et une panne ne perd que la suite.
    const refreshLists = () => {
      for (const key of [['ads'], ['my-ads'], ['ad', adId]]) queryClient.invalidateQueries({ queryKey: key });
    };
    let sent = 0;
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('photos', file);
        await api(`/ads/${adId}/images`, { method: 'POST', body: form });
        sent += 1;
      } catch {
        refreshLists();
        setSubmit({ busy: false, error: null, done: { id: adId, sent, total: files.length } });
        return;
      }
    }
    refreshLists();
    toast.success(edit ? 'Annonce modifiée' : 'Annonce publiée !');
    navigate(`/annonces/${adId}`);
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (step < last) await goNext();
    else await submitAd();
  }

  if (submit.done) {
    const { id, sent, total } = submit.done;
    return (
      <section className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold">Presque terminé</h1>
        <p role="status" className="mt-4 rounded-lg bg-amber-100 px-4 py-3 text-amber-900">
          {edit ? 'Modifications enregistrées' : 'Annonce créée'}, mais les photos n'ont pas pu être envoyées. {plural(sent, 'photo')} sur {total} {sent > 1 ? 'envoyées' : 'envoyée'}.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={`/annonces/${id}/modifier`} className={buttonClasses('primary')}>Modifier mon annonce</Link>
          <Link to={`/annonces/${id}`} className={buttonClasses('secondary')}>Voir mon annonce</Link>
        </div>
      </section>
    );
  }

  const categoryName = edit
    ? ad.category.name
    : categories.flatMap((parent) => parent.children).find((child) => child.slug === values.categorySlug)?.name;
  const attributes = cleanAttributes(values.attributes, schema?.fields);
  const submitLabel = edit ? 'Enregistrer les modifications' : 'Publier mon annonce';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">{edit ? "Modifier l'annonce" : 'Déposer une annonce'}</h1>

      {restored && (
        <p role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-100 px-4 py-2">
          <span>Brouillon restauré.</span>
          <Button variant="ghost" onClick={startOver}>Recommencer à zéro</Button>
        </p>
      )}

      <div className="my-6"><Stepper steps={steps.map((s) => s.label)} current={step} /></div>

      <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-6">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">{steps[step].label}</h2>

        {currentKey === 'category' && (
          <div className="space-y-4">
            {categories.map((parent) => (
              <fieldset key={parent.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <legend className="px-2 font-semibold">{parent.name}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {parent.children.map((child) => (
                    <label key={child.id} className="flex min-h-11 items-center gap-2">
                      <input type="radio" value={child.slug} {...register('categorySlug', { required: 'Choisissez une catégorie' })} />
                      {child.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {errors.categorySlug && <p role="alert" className="text-sm text-red-700">{errors.categorySlug.message}</p>}
          </div>
        )}

        {currentKey === 'details' && (
          <div className="space-y-4">
            {edit && <p className="text-gray-600">Catégorie : <strong className="text-ink">{ad.category.name}</strong> (elle ne peut plus être modifiée)</p>}
            <Field
              label="Titre"
              maxLength={120}
              error={errors.title?.message}
              {...register('title', { validate: (value) => value.trim().length >= 3 || 'Le titre doit contenir au moins 3 caractères' })}
            />
            <Field
              as="textarea"
              rows={6}
              label="Description"
              maxLength={5000}
              error={errors.description?.message}
              {...register('description', { validate: (value) => value.trim().length >= 10 || 'La description doit contenir au moins 10 caractères' })}
            />
            <Field as="select" label="État" {...register('itemCondition')}>
              <option value="">Non précisé</option>
              {Object.entries(CONDITIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Field>
            {schema && <DynamicFields fields={schema.fields} register={register} errors={errors} />}
          </div>
        )}

        {currentKey === 'photos' && (
          <div className="space-y-4">
            <p className="text-gray-600">Les annonces avec photos reçoivent beaucoup plus de contacts. La première photo sert de couverture.</p>
            {edit && <ExistingImages adId={ad.id} images={existingImages} />}
            {photoRoom > 0 ? (
              <ImageUploader files={files} onChange={setFiles} max={photoRoom} />
            ) : (
              <p className="rounded-lg bg-gray-100 px-3 py-2">Cette annonce a déjà {MAX_PHOTOS} photos, le maximum. Retirez-en une pour en ajouter.</p>
            )}
          </div>
        )}

        {currentKey === 'price' && (
          <div className="space-y-4">
            <Field label="Prix (€)" inputMode="decimal" error={errors.price?.message} {...register('price', { validate: validatePrice })} />
            <Controller
              control={control}
              name="place"
              rules={{ validate: (place) => Boolean(place) || 'Choisissez une ville dans la liste' }}
              render={({ field, fieldState }) => <CityPicker value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
            />
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" {...register('shippingAvailable')} />
              Livraison possible
            </label>
          </div>
        )}

        {currentKey === 'summary' && (
          <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white px-4">
            <SummaryRow label="Catégorie">{categoryName}</SummaryRow>
            <SummaryRow label="Titre">{values.title}</SummaryRow>
            <SummaryRow label="Prix">{formatPrice(eurosToCents(values.price) ?? 0)}</SummaryRow>
            <SummaryRow label="Lieu">{values.place && `${values.place.city} (${values.place.postalCode})`}</SummaryRow>
            {values.itemCondition && <SummaryRow label="État">{CONDITIONS[values.itemCondition]}</SummaryRow>}
            {(schema?.fields ?? []).filter((field) => attributes[field.key] !== undefined).map((field) => (
              <SummaryRow key={field.key} label={field.label}>{formatAttributeValue(attributes[field.key], field)}</SummaryRow>
            ))}
            <SummaryRow label="Livraison">{values.shippingAvailable ? 'Possible' : 'Non proposée'}</SummaryRow>
            <SummaryRow label="Photos">
              {edit ? `${plural(existingImages.length, 'photo')} en ligne${files.length > 0 ? `, ${plural(files.length, 'nouvelle')} à ajouter` : ''}` : files.length > 0 ? plural(files.length, 'photo') : 'Aucune photo'}
            </SummaryRow>
          </dl>
        )}

        {submit.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{submit.error}</p>}

        <div className="flex justify-between gap-3">
          {step > 0 ? <Button variant="secondary" onClick={() => setStep((current) => current - 1)}>Retour</Button> : <span />}
          {step < last ? (
            <Button type="submit">Continuer</Button>
          ) : (
            <Button type="submit" loading={submit.busy}>{submit.busy ? 'Enregistrement…' : submitLabel}</Button>
          )}
        </div>
      </form>
    </div>
  );
}

function SummaryRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
