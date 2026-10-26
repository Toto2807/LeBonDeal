import { useCategories, useCategorySchema } from '../../hooks/useCategories.js';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2';

// Filtres propres à la catégorie choisie, construits depuis sa définition MongoDB.
// Dans l'URL : ?attr.carburant=Diesel,Hybride  ?attr.kilometrage.max=100000  ?attr.meuble=true
function DynamicFilter({ field, filters, setFilters }) {
  const param = `attr.${field.key}`;

  if (field.type === 'select') {
    const selected = filters[param]?.split(',') ?? [];
    const toggle = (option) => {
      const next = selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option];
      setFilters({ [param]: next.join(',') });
    };
    return (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{field.label}</legend>
        {field.options.map((option) => (
          <label key={option} className="mr-3 inline-flex items-center gap-1 text-sm">
            <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /> {option}
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === 'number') {
    return (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{field.label}{field.unit && ` (${field.unit})`}</legend>
        <div className="flex gap-2">
          {['min', 'max'].map((bound) => (
            <input
              key={bound}
              type="number"
              inputMode="numeric"
              placeholder={bound === 'min' ? 'Min' : 'Max'}
              aria-label={`${field.label} ${bound === 'min' ? 'minimum' : 'maximum'}`}
              defaultValue={filters[`${param}.${bound}`] ?? ''}
              onBlur={(event) => setFilters({ [`${param}.${bound}`]: event.target.value })}
              className={inputClass}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={filters[param] === 'true'} onChange={(e) => setFilters({ [param]: e.target.checked ? 'true' : '' })} />
        {field.label}
      </label>
    );
  }
  return null;
}

export default function FilterPanel({ filters, setFilters }) {
  const { data: categories = [] } = useCategories();
  const { data: schema } = useCategorySchema(filters.category);
  const dynamicFilters = schema?.fields.filter((field) => field.filterable) ?? [];

  return (
    <aside aria-label="Filtres" className="space-y-4 self-start rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">Catégorie</label>
        <select id="category" value={filters.category ?? ''} onChange={(e) => setFilters({ category: e.target.value })} className={inputClass}>
          <option value="">Toutes les catégories</option>
          {categories.map((parent) => (
            <optgroup key={parent.id} label={parent.name}>
              <option value={parent.slug}>Tout : {parent.name}</option>
              {parent.children.map((child) => <option key={child.id} value={child.slug}>{child.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Prix (€)</legend>
        <div className="flex gap-2">
          {[['priceMin', 'Min'], ['priceMax', 'Max']].map(([param, label]) => (
            <input
              key={param}
              type="number"
              min="0"
              placeholder={label}
              aria-label={`Prix ${label === 'Min' ? 'minimum' : 'maximum'} en euros`}
              defaultValue={filters[param] ? Number(filters[param]) / 100 : ''}
              onBlur={(event) => setFilters({ [param]: event.target.value ? Math.round(Number(event.target.value) * 100) : '' })} // euros -> centimes
              className={inputClass}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">Trier par</label>
        <select id="sort" value={filters.sort ?? 'recent'} onChange={(e) => setFilters({ sort: e.target.value })} className={inputClass}>
          <option value="recent">Plus récentes</option>
          <option value="price_asc">Prix croissant</option>
          <option value="price_desc">Prix décroissant</option>
        </select>
      </div>

      {dynamicFilters.map((field) => <DynamicFilter key={`${filters.category}-${field.key}`} field={field} filters={filters} setFilters={setFilters} />)}
    </aside>
  );
}
