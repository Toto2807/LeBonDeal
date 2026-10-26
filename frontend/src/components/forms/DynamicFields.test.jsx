import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import DynamicFields from './DynamicFields.jsx';
import { carSchema } from '../../test/fixtures.js';

const fields = [
  ...carSchema.fields,
  { key: 'boite', label: 'Boîte de vitesse', type: 'select', options: ['Manuelle', 'Automatique'] },
  { key: 'meuble', label: 'Meublé', type: 'boolean' },
];

// Formulaire minimal : « Valider » déclenche la validation, « Envoyer » transmet les valeurs au test.
function Harness({ onValues = () => {}, defaults = {} }) {
  const { register, trigger, handleSubmit, formState: { errors } } = useForm({ defaultValues: { attributes: defaults } });
  return (
    <form onSubmit={handleSubmit((values) => onValues(values.attributes))}>
      <DynamicFields fields={fields} register={register} errors={errors} />
      <button type="button" onClick={() => trigger()}>Valider</button>
      <button type="submit">Envoyer</button>
    </form>
  );
}

describe('DynamicFields', () => {
  it('génère un champ par définition, avec libellé, unité et caractère obligatoire', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Marque *')).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText('Modèle *')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Kilométrage (km) *')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('Boîte de vitesse')).toBeInstanceOf(HTMLSelectElement); // facultatif : pas d'astérisque
    expect(screen.getByLabelText('Meublé')).toHaveAttribute('type', 'checkbox');
  });

  it('propose les options de la définition après « Choisir… »', () => {
    render(<Harness />);
    const options = [...screen.getByLabelText('Carburant *').querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['Choisir…', 'Essence', 'Diesel']);
  });

  it('signale chaque champ obligatoire vide, et relie le message au champ (lecteurs d\'écran)', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(5); // marque, modèle, année, kilométrage, carburant
    const field = screen.getByLabelText('Marque *');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(field.getAttribute('aria-describedby'))).toHaveTextContent('Champ obligatoire');
    expect(screen.getByLabelText('Boîte de vitesse')).not.toHaveAttribute('aria-invalid');
  });

  it('retire l\'erreur dès que le champ est correctement rempli', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await screen.findAllByRole('alert');
    await userEvent.selectOptions(screen.getByLabelText('Marque *'), 'Peugeot');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(screen.getByLabelText('Marque *')).not.toHaveAttribute('aria-invalid');
    expect(await screen.findAllByRole('alert')).toHaveLength(4);
  });

  it('transmet les nombres en tant que nombres, un champ numérique vidé en « undefined » (pas NaN) et une case décochée en false', async () => {
    const onValues = vi.fn();
    render(<Harness onValues={onValues} defaults={{ marque: 'Peugeot', modele: 'Clio', annee: 2019, carburant: 'Diesel' }} />);
    await userEvent.type(screen.getByLabelText('Kilométrage (km) *'), '80000');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(onValues).toHaveBeenCalledTimes(1);
    const values = onValues.mock.calls[0][0];
    expect(values.kilometrage).toBe(80000);
    expect(values.annee).toBe(2019);
    expect(values.meuble).toBe(false);

    await userEvent.clear(screen.getByLabelText('Kilométrage (km) *'));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findAllByRole('alert')).toHaveLength(1); // le kilométrage vidé redevient « obligatoire »
  });

  it('n\'affiche rien sans définition de champ', () => {
    function Empty() {
      const { register } = useForm();
      return <DynamicFields fields={[]} register={register} errors={{}} />;
    }
    const { container } = render(<Empty />);
    expect(container).toBeEmptyDOMElement();
  });
});
