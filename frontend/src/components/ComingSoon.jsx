// Page provisoire : indique à quelle phase de la feuille de route la vraie page sera construite.
export default function ComingSoon({ title, phase }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-gray-600">Page à construire en phase {phase}.</p>
    </section>
  );
}
