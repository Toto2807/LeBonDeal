// Génère les champs du formulaire « Déposer une annonce » depuis la définition de la catégorie (MongoDB).
// À utiliser avec react-hook-form : <DynamicFields fields={schema.fields} register={register} errors={errors} />
// Les valeurs sont envoyées dans `attributes` ; le backend les revalide (buildAttributesSchema).
export default function DynamicFields({ fields, register, errors }) {
  return fields.map((field) => {
    const name = `attributes.${field.key}`;
    const error = errors?.attributes?.[field.key];
    const label = `${field.label}${field.unit ? ` (${field.unit})` : ''}${field.required ? ' *' : ''}`;
    // Relie le champ à son message d'erreur pour les lecteurs d'écran (le message est aussi une alerte visible).
    const errorId = `${name}-error`;
    const a11y = { 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? errorId : undefined };

    return (
      <div key={field.key}>
        <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>

        {field.type === 'select' && (
          <select id={name} {...a11y} {...register(name, { required: field.required && 'Champ obligatoire' })} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">Choisir…</option>
            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        )}

        {field.type === 'boolean' && <input id={name} type="checkbox" {...a11y} {...register(name)} className="size-5" />}

        {(field.type === 'number' || field.type === 'text') && (
          <input
            id={name}
            type={field.type}
            min={field.min}
            max={field.max}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
            {...a11y}
            {...register(name, {
              required: field.required && 'Champ obligatoire',
              // champ numérique vide -> undefined (et non NaN), pour que l'API ne reçoive pas de valeur
              setValueAs: field.type === 'number' ? (value) => (value === '' ? undefined : Number(value)) : undefined,
            })}
          />
        )}

        {error && <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">{error.message}</p>}
      </div>
    );
  });
}
