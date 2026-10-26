import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import CityPicker from './CityPicker.jsx';
import { searchCommunes } from '../../lib/geo.js';

vi.mock('../../lib/geo.js', () => ({ searchCommunes: vi.fn() }));

const lyon = { city: 'Lyon', postalCodes: ['69001', '69003'], lat: 45.758, lng: 4.8351 };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const field = () => screen.getByLabelText('Ville');
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// Le parent garde la valeur, comme dans le formulaire réel.
function Harness({ onChange }) {
  const [value, setValue] = useState(null);
  return <CityPicker value={value} onChange={(place) => { setValue(place); onChange(place); }} />;
}

beforeEach(() => {
  searchCommunes.mockReset();
});

describe('CityPicker', () => {
  it('propose une ligne par couple ville / code postal', async () => {
    searchCommunes.mockResolvedValue([lyon]);
    render(<Harness onChange={() => {}} />);
    await userEvent.type(field(), 'Lyon');
    expect(await screen.findByRole('button', { name: 'Lyon (69001)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lyon (69003)' })).toBeInTheDocument();
  });

  it('attend la fin de la saisie : deux frappes rapides ne font qu\'un appel', async () => {
    searchCommunes.mockResolvedValue([lyon]);
    render(<Harness onChange={() => {}} />);
    await userEvent.type(field(), 'Lyon');
    await waitFor(() => expect(searchCommunes).toHaveBeenCalledTimes(1));
    expect(searchCommunes.mock.calls[0][0]).toBe('Lyon');
  });

  it('renvoie la ville choisie avec son code postal et ses coordonnées', async () => {
    searchCommunes.mockResolvedValue([lyon]);
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(field(), 'Lyon');
    await userEvent.click(await screen.findByRole('button', { name: 'Lyon (69003)' }));
    expect(onChange).toHaveBeenLastCalledWith({ city: 'Lyon', postalCode: '69003', lat: 45.758, lng: 4.8351 });
    expect(field()).toHaveValue('Lyon (69003)');
    expect(screen.queryByRole('button', { name: 'Lyon (69001)' })).not.toBeInTheDocument();
  });

  it('oublie la ville choisie dès que l\'utilisateur retape (pas de ville et de coordonnées qui ne vont plus ensemble)', async () => {
    searchCommunes.mockResolvedValue([lyon]);
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(field(), 'Lyon');
    await userEvent.click(await screen.findByRole('button', { name: 'Lyon (69001)' }));
    await userEvent.type(field(), 'x');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('ignore la réponse d\'une recherche périmée arrivée après une frappe plus récente', async () => {
    const first = deferred();
    const second = deferred();
    searchCommunes.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<Harness onChange={() => {}} />);

    await userEvent.type(field(), 'Ly');
    await waitFor(() => expect(searchCommunes).toHaveBeenCalledTimes(1));
    await userEvent.type(field(), 'on');
    await waitFor(() => expect(searchCommunes).toHaveBeenCalledTimes(2));

    second.resolve([lyon]);
    expect(await screen.findByRole('button', { name: 'Lyon (69001)' })).toBeInTheDocument();
    first.resolve([{ city: 'Lyas', postalCodes: ['07000'], lat: 1, lng: 1 }]); // arrive en retard
    await wait(30);
    expect(screen.queryByRole('button', { name: /Lyas/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lyon (69001)' })).toBeInTheDocument();
  });

  it('annule la recherche en cours quand l\'utilisateur continue de taper', async () => {
    searchCommunes.mockReturnValue(new Promise(() => {}));
    render(<Harness onChange={() => {}} />);
    await userEvent.type(field(), 'Ly');
    await waitFor(() => expect(searchCommunes).toHaveBeenCalledTimes(1));
    const signal = searchCommunes.mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    await userEvent.type(field(), 'on');
    expect(signal.aborted).toBe(true);
  });

  it('affiche un message quand le service est indisponible, et garde la saisie', async () => {
    searchCommunes.mockRejectedValue(new Error('geo.api.gouv.fr a répondu 503'));
    render(<Harness onChange={() => {}} />);
    await userEvent.type(field(), 'Lyon');
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les villes');
    expect(field()).toHaveValue('Lyon');
  });

  it('indique quand aucune ville ne correspond', async () => {
    searchCommunes.mockResolvedValue([]);
    render(<Harness onChange={() => {}} />);
    await userEvent.type(field(), 'Zzzz');
    expect(await screen.findByText(/aucune ville/i)).toBeInTheDocument();
  });

  it('affiche l\'erreur de validation transmise par le formulaire', () => {
    render(<CityPicker value={null} onChange={() => {}} error="Choisissez une ville dans la liste" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une ville dans la liste');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });

  it('affiche la ville déjà choisie (brouillon restauré, modification d\'une annonce)', () => {
    render(<CityPicker value={{ city: 'Lyon', postalCode: '69003', lat: 1, lng: 2 }} onChange={() => {}} />);
    expect(field()).toHaveValue('Lyon (69003)');
  });
});
