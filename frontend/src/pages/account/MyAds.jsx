import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError, api } from '../../api/client.js';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { MY_ADS_PAGE_SIZE, useMyAds } from '../../hooks/useMyAds.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatPrice, timeAgo } from '../../lib/format.js';

const TABS = [[undefined, 'Toutes'], ['active', 'Actives'], ['reserved', 'Réservées'], ['sold', 'Vendues'], ['archived', 'Archivées']];
const STATUS_LABELS = { draft: 'Brouillon', active: 'En ligne', reserved: 'Réservée', sold: 'Vendue', archived: 'Archivée' };
const EMPTY_MESSAGES = {
  active: 'Aucune annonce en ligne.',
  reserved: 'Aucune annonce réservée.',
  sold: 'Aucune annonce vendue.',
  archived: 'Aucune annonce archivée.',
};

const setStatus = (status) => (ad) => api(`/ads/${ad.id}/status`, { method: 'PATCH', body: { status } });
// Chaque action : la requête et le message de réussite. Les statuts autorisés suivent les règles du serveur (adService.js).
const ACTIONS = {
  reserve: { label: 'Marquer comme réservée', request: setStatus('reserved'), success: 'Annonce marquée comme réservée' },
  reopen: { label: 'Remettre en vente', request: setStatus('active'), success: 'Annonce remise en vente' },
  archive: { label: 'Archiver', request: setStatus('archived'), success: 'Annonce archivée' },
  republish: { label: 'Republier', request: setStatus('active'), success: 'Annonce republiée' },
  publish: { label: 'Publier', request: setStatus('active'), success: 'Annonce publiée' },
  sold: { label: 'Marquer comme vendue', request: setStatus('sold'), success: 'Annonce marquée comme vendue', confirm: true },
  delete: { label: 'Supprimer', request: (ad) => api(`/ads/${ad.id}`, { method: 'DELETE' }), success: 'Annonce supprimée', confirm: true },
};
const ACTIONS_BY_STATUS = {
  draft: ['publish', 'delete'],
  active: ['reserve', 'sold', 'archive', 'delete'],
  reserved: ['reopen', 'sold', 'archive', 'delete'],
  sold: ['delete'], // une vente est définitive
  archived: ['republish', 'delete'],
};

function confirmationFor(action, ad) {
  return action === 'sold'
    ? {
        title: 'Marquer comme vendue ?',
        message: `« ${ad.title} » ne pourra plus être modifiée ni remise en vente. Cette action est définitive.`,
        confirmLabel: 'Marquer comme vendue',
        danger: false,
      }
    : {
        title: "Supprimer l'annonce ?",
        message: `« ${ad.title} » sera définitivement retirée de LeBonDeal.`,
        confirmLabel: 'Supprimer',
        danger: true,
      };
}

export default function MyAds() {
  usePageTitle('Mes annonces');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get('statut') || undefined;
  const page = Number(params.get('page')) || 1;
  const { data, isPending, isError, refetch } = useMyAds({ status, page });
  const [confirming, setConfirming] = useState(null); // { action, ad }
  const [actionError, setActionError] = useState(null);

  const run = useMutation({
    mutationFn: ({ action, ad }) => ACTIONS[action].request(ad),
    onMutate: () => setActionError(null),
    onSuccess: (_result, { action, ad }) => {
      toast.success(ACTIONS[action].success);
      queryClient.invalidateQueries({ queryKey: ['my-ads'] });
      queryClient.invalidateQueries({ queryKey: ['ad', ad.id] });
      queryClient.invalidateQueries({ queryKey: ['ads'] });
    },
    onError: (error) =>
      setActionError(error instanceof ApiError ? error.message : 'Action impossible, vérifiez votre connexion et réessayez.'),
  });

  function chooseStatus(next) {
    setParams(next ? { statut: next } : {}); // changer de filtre ramène à la page 1
  }

  function ask(action, ad) {
    if (ACTIONS[action].confirm) setConfirming({ action, ad });
    else run.mutate({ action, ad });
  }

  const pageCount = data ? Math.ceil(data.meta.total / MY_ADS_PAGE_SIZE) : 0;

  return (
    <section>
      <h2 className="mb-4 text-xl font-bold">Mes annonces</h2>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
        {TABS.map(([value, label]) => (
          <Button key={label} variant="secondary" aria-pressed={status === value} onClick={() => chooseStatus(value)}
            className={status === value ? 'border-brand-700 bg-brand-100' : ''}>
            {label}
          </Button>
        ))}
      </div>

      {actionError && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{actionError}</p>}

      {isPending && (
        <div role="status">
          <span className="sr-only">Chargement de vos annonces…</span>
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
        </div>
      )}

      {isError && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-700">
          <p>Impossible de charger vos annonces. Vérifiez votre connexion et réessayez.</p>
          <Button className="mt-3" onClick={() => refetch()}>Réessayer</Button>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-600">
          {status ? (
            <p>{EMPTY_MESSAGES[status]}</p>
          ) : (
            <>
              <p>Vous n'avez pas encore d'annonce.</p>
              <Link to="/deposer" className={`${buttonClasses('primary')} mt-4`}>Déposer une annonce</Link>
            </>
          )}
        </div>
      )}

      {data && data.data.length > 0 && (
        <ul className="space-y-3">
          {data.data.map((ad) => (
            <li key={ad.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row">
              <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:w-40">
                {ad.coverUrl && <img src={ad.coverUrl} alt="" loading="lazy" className="size-full object-cover" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/annonces/${ad.id}`} className="font-semibold hover:underline">{ad.title}</Link>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-sm">{STATUS_LABELS[ad.status]}</span>
                </div>
                <p className="font-bold text-brand-700">{formatPrice(ad.priceCents)}</p>
                <p className="text-sm text-gray-600">{ad.city} · {timeAgo(ad.publishedAt)}</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  {ad.status !== 'sold' && (
                    <Link to={`/annonces/${ad.id}/modifier`} className={buttonClasses('secondary')}>Modifier</Link>
                  )}
                  {ACTIONS_BY_STATUS[ad.status].map((action) => (
                    <Button key={action} variant={action === 'delete' ? 'ghost' : 'secondary'} disabled={run.isPending}
                      className={action === 'delete' ? 'text-red-700' : ''} onClick={() => ask(action, ad)}>
                      {ACTIONS[action].label}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && (
        <Pagination
          page={page}
          pageCount={pageCount}
          onPage={(next) => setParams({ ...(status && { statut: status }), page: String(next) })}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        {...(confirming ? confirmationFor(confirming.action, confirming.ad) : { title: '', message: '' })}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          run.mutate(confirming);
          setConfirming(null);
        }}
      />
    </section>
  );
}
