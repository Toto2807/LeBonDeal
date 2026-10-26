// Emplacement gris animé affiché pendant un chargement. Ignoré des lecteurs d'écran.
export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}
