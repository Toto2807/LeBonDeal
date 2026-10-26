// Indicateur d'avancement d'un formulaire en plusieurs étapes. L'étape courante est annoncée aux lecteurs d'écran
// (aria-current) et les étapes terminées le sont par un texte, pas seulement par la couleur.
export default function Stepper({ steps, current }) {
  return (
    <ol aria-label="Étapes" className="flex flex-wrap gap-2 text-sm">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
              active ? 'border-brand-700 bg-brand-100 font-semibold' : done ? 'border-gray-300 bg-gray-100' : 'border-gray-200 text-gray-600'
            }`}
          >
            <span className="grid size-5 place-items-center rounded-full bg-white text-xs font-bold">{index + 1}</span>
            <span>{label}</span>
            {done && <span className="sr-only">(terminée)</span>}
          </li>
        );
      })}
    </ol>
  );
}
