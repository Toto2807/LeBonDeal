import Button from './Button.jsx';

// page : page courante (à partir de 1) · pageCount : nombre total de pages · onPage(n) : demande la page n.
export default function Pagination({ page, pageCount, onPage }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-4">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</Button>
      <span>Page {page} sur {pageCount}</span>
      <Button variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Suivant</Button>
    </nav>
  );
}
