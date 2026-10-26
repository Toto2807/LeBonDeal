import { MapPin, Truck } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { ApiError } from '../api/client.js';
import AdAttributes from '../components/ads/AdAttributes.jsx';
import FavoriteButton from '../components/ads/FavoriteButton.jsx';
import Gallery from '../components/ads/Gallery.jsx';
import PriceHint from '../components/ads/PriceHint.jsx';
import SellerCard from '../components/ads/SellerCard.jsx';
import Button, { buttonClasses } from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAd } from '../hooks/useAd.js';
import { useCategorySchema } from '../hooks/useCategories.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { CONDITIONS } from '../lib/adForm.js';
import { formatPrice, timeAgo } from '../lib/format.js';

// Bandeau selon le statut. Brouillon et archivée ne sont visibles que de leur propriétaire.
const BANNERS = {
  sold: 'Cette annonce a été vendue.',
  reserved: 'Cette annonce est réservée.',
  archived: "Annonce archivée : elle n'est visible que de vous.",
  draft: "Brouillon : cette annonce n'est visible que de vous.",
};

export default function AdDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const { data: ad, isPending, isError, error, refetch } = useAd(id);
  const { data: schema } = useCategorySchema(ad?.category.slug);
  usePageTitle(ad?.title ?? 'Annonce');

  if (isPending) {
    return (
      <div role="status" className="mx-auto max-w-6xl px-4 py-6">
        <span className="sr-only">Chargement de l'annonce…</span>
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Annonce introuvable</h1>
          <p className="mt-2 text-gray-600">Elle a peut-être été supprimée ou n'est plus en ligne.</p>
          <Link to="/recherche" className="mt-6 inline-block font-medium text-brand-700 underline">Voir d'autres annonces</Link>
        </section>
      );
    }
    return (
      <section role="alert" className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-red-700">Impossible de charger cette annonce. Vérifiez votre connexion et réessayez.</p>
        <Button className="mt-4" onClick={() => refetch()}>Réessayer</Button>
      </section>
    );
  }

  const isOwner = user?.id === ad.seller.id;
  const { category } = ad;

  return (
    <article className="mx-auto max-w-6xl px-4 py-6">
      <nav aria-label="Fil d'Ariane" className="mb-4 text-sm text-gray-600">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link to="/" className="hover:underline">Accueil</Link></li>
          {category.parent && (
            <li>› <Link to={`/recherche?category=${category.parent.slug}`} className="hover:underline">{category.parent.name}</Link></li>
          )}
          <li>› <Link to={`/recherche?category=${category.slug}`} className="hover:underline">{category.name}</Link></li>
        </ol>
      </nav>

      {BANNERS[ad.status] && (
        <p role="status" className="mb-4 rounded-lg bg-amber-100 px-4 py-3 font-medium text-amber-900">{BANNERS[ad.status]}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <Gallery images={ad.images} title={ad.title} />
          <section aria-labelledby="description-title">
            <h2 id="description-title" className="mb-2 text-lg font-bold">Description</h2>
            <p className="whitespace-pre-line">{ad.description}</p>
          </section>
          <section aria-labelledby="attributes-title">
            <h2 id="attributes-title" className="mb-2 text-lg font-bold">Caractéristiques</h2>
            <div className="grid gap-2">
              {ad.itemCondition && <p>État : <span className="font-medium">{CONDITIONS[ad.itemCondition]}</span></p>}
              <AdAttributes attributes={ad.attributes} fields={schema?.fields} />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold">{ad.title}</h1>
              {!isOwner && <FavoriteButton adId={ad.id} className="shrink-0 border border-gray-200" />}
            </div>
            <p className="text-2xl font-extrabold text-brand-700">{formatPrice(ad.priceCents)}</p>
            <PriceHint hint={ad.priceHint} />
            <p className="flex items-center gap-1 text-sm text-gray-600">
              <MapPin size={16} aria-hidden="true" />
              {ad.city} ({ad.postalCode}) · {timeAgo(ad.publishedAt)}
            </p>
            {ad.shippingAvailable && (
              <p className="flex items-center gap-1 text-sm text-gray-600">
                <Truck size={16} aria-hidden="true" />
                <span>Livraison possible</span>
              </p>
            )}
          </div>

          <SellerCard seller={ad.seller} />

          {isOwner ? (
            <Link to={`/annonces/${ad.id}/modifier`} className={`${buttonClasses('secondary')} w-full`}>Modifier mon annonce</Link>
          ) : ad.status === 'sold' ? null : user ? (
            <Link to="/compte/messages" className={`${buttonClasses('primary')} w-full`}>Contacter le vendeur</Link>
          ) : (
            <Link to="/connexion" state={{ from: location }} className={`${buttonClasses('primary')} w-full text-center`}>
              Se connecter pour contacter le vendeur
            </Link>
          )}
        </aside>
      </div>
    </article>
  );
}
