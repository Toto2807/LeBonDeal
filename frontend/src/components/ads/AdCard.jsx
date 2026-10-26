import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { formatPrice, timeAgo } from '../../lib/format.js';
import FavoriteButton from './FavoriteButton.jsx';

// ad : une ligne de GET /api/ads -> { id, title, priceCents, city, coverUrl, publishedAt, distanceKm }
export default function AdCard({ ad }) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-md">
      <Link to={`/annonces/${ad.id}`} className="block">
        <div className="aspect-[4/3] bg-gray-100">
          {ad.coverUrl && <img src={ad.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 font-medium">{ad.title}</h3>
          <p className="text-lg font-bold text-brand-700">{formatPrice(ad.priceCents)}</p>
          <p className="flex items-center gap-1 text-sm text-gray-500">
            <MapPin size={14} aria-hidden="true" />
            {ad.city}{ad.distanceKm != null && ` (${ad.distanceKm} km)`} · {timeAgo(ad.publishedAt)}
          </p>
        </div>
      </Link>
      <FavoriteButton adId={ad.id} className="absolute right-2 top-2" />
    </article>
  );
}
