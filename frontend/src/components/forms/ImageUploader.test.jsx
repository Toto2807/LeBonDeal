import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import ImageUploader from './ImageUploader.jsx';

const photo = (name, { type = 'image/jpeg', size = 1000, lastModified = 1 } = {}) => {
  const file = new File(['x'], name, { type, lastModified });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

// Le parent garde la liste, comme dans le formulaire réel.
function Harness({ initial = [], max, onChange }) {
  const [files, setFiles] = useState(initial);
  return <ImageUploader files={files} max={max} onChange={(next) => { setFiles(next); onChange?.(next); }} />;
}
const input = () => screen.getByLabelText(/glissez vos photos/i);
// applyAccept: false : on teste aussi des fichiers que le navigateur laisserait passer (glisser-déposer).
const user = userEvent.setup({ applyAccept: false });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:aperçu');
  URL.revokeObjectURL = vi.fn();
});

describe('ImageUploader', () => {
  it('propose l\'ajout de photos et explique les limites', () => {
    render(<Harness />);
    expect(input()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input()).toHaveAttribute('multiple');
    expect(screen.getByText(/10 photos maximum/i)).toBeInTheDocument();
  });

  it('affiche un aperçu par photo ajoutée, dans l\'ordre', async () => {
    render(<Harness />);
    await user.upload(input(), [photo('a.jpg', { lastModified: 1 }), photo('b.jpg', { lastModified: 2 }), photo('c.jpg', { lastModified: 3 })]);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Retirer la photo 1 (a.jpg)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer la photo 3 (c.jpg)' })).toBeInTheDocument();
  });

  it('refuse un fichier qui n\'est pas une image, en le disant', async () => {
    render(<Harness />);
    await user.upload(input(), [photo('doc.pdf', { type: 'application/pdf' })]);
    expect(screen.getByRole('alert')).toHaveTextContent('doc.pdf : format non accepté');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('refuse une photo de 9 Mo', async () => {
    render(<Harness />);
    await user.upload(input(), [photo('lourde.jpg', { size: 9 * 1024 * 1024 })]);
    expect(screen.getByRole('alert')).toHaveTextContent('lourde.jpg : plus de 8 Mo');
  });

  it('refuse la 11e photo', async () => {
    const initial = Array.from({ length: 10 }, (_, i) => photo(`p${i}.jpg`, { lastModified: i }));
    render(<Harness initial={initial} />);
    await user.upload(input(), [photo('onzieme.jpg', { lastModified: 99 })]);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('alert')).toHaveTextContent('10 photos maximum');
  });

  it('retire une photo', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[photo('a.jpg', { lastModified: 1 }), photo('b.jpg', { lastModified: 2 })]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Retirer la photo 1 (a.jpg)' }));
    expect(onChange.mock.lastCall[0].map((f) => f.name)).toEqual(['b.jpg']);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('monte et descend une photo, avec des boutons désactivés aux extrémités', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[photo('a.jpg', { lastModified: 1 }), photo('b.jpg', { lastModified: 2 }), photo('c.jpg', { lastModified: 3 })]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Monter la photo 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descendre la photo 3' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Descendre la photo 1' }));
    expect(onChange.mock.lastCall[0].map((f) => f.name)).toEqual(['b.jpg', 'a.jpg', 'c.jpg']);
    await user.click(screen.getByRole('button', { name: 'Monter la photo 3' }));
    expect(onChange.mock.lastCall[0].map((f) => f.name)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
  });

  it('accepte des photos déposées par glisser-déposer', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [photo('glisse.jpg')] } });
    expect(onChange.mock.lastCall[0].map((f) => f.name)).toEqual(['glisse.jpg']);
  });

  it('efface les messages d\'erreur après un ajout valide', async () => {
    render(<Harness />);
    await user.upload(input(), [photo('doc.pdf', { type: 'application/pdf' })]);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.upload(input(), [photo('a.jpg')]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('libère les aperçus (mémoire) quand une photo est retirée', async () => {
    render(<Harness initial={[photo('a.jpg')]} />);
    await user.click(screen.getByRole('button', { name: 'Retirer la photo 1 (a.jpg)' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:aperçu');
  });
});
