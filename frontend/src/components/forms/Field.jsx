import { useId } from 'react';

// Champ de formulaire accessible : étiquette au-dessus (jamais seulement un placeholder), aide, et message d'erreur
// annoncé par les lecteurs d'écran. Se branche tel quel sur react-hook-form : <Field label="…" {...register('email')} />
// (React 19 : `ref` est une propriété ordinaire). `as` choisit l'élément : 'input' (défaut), 'textarea' ou 'select'.
export default function Field({ label, error, hint, as: Control = 'input', ref, className = '', children, ...controlProps }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && !error && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <Control
        id={id}
        ref={ref}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 aria-[invalid=true]:border-red-700"
        {...controlProps}
      >
        {children}
      </Control>
      {hint && !error && <p id={hintId} className="mt-1 text-sm text-gray-500">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
