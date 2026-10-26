import { Link } from 'react-router';

export default function NotFound() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-gray-600">Cette adresse n'existe pas ou l'annonce a été supprimée.</p>
      <Link to="/" className="mt-6 inline-block font-medium text-brand-700 underline">Retour à l'accueil</Link>
    </section>
  );
}
