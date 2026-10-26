import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import Pagination from './Pagination.jsx';
import Skeleton from './Skeleton.jsx';

describe('Button', () => {
  it('déclenche onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Publier</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Publier' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('est désactivé et signalé « occupé » pendant un envoi', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Publication…</Button>);
    const button = screen.getByRole('button', { name: 'Publication…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('laisse choisir le type « submit »', () => {
    render(<Button type="submit">Envoyer</Button>);
    expect(screen.getByRole('button', { name: 'Envoyer' })).toHaveAttribute('type', 'submit');
  });
});

describe('Skeleton', () => {
  it('est ignoré des lecteurs d\'écran', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Pagination', () => {
  it('n\'affiche rien quand il n\'y a qu\'une page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('désactive « Précédent » sur la première page et « Suivant » sur la dernière', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} onPage={() => {}} />);
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled();
    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument();

    rerender(<Pagination page={3} pageCount={3} onPage={() => {}} />);
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  });

  it('demande la page voisine', async () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pageCount={5} onPage={onPage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await userEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(onPage.mock.calls).toEqual([[3], [1]]);
  });
});

describe('ConfirmDialog', () => {
  const setup = (props = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Supprimer l'annonce ?" message="Cette action est définitive." confirmLabel="Supprimer"
        onConfirm={onConfirm} onCancel={onCancel} {...props} />
    );
    return { onConfirm, onCancel };
  };

  it('n\'affiche rien tant qu\'il est fermé', () => {
    render(<ConfirmDialog open={false} title="Titre" message="Message" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('affiche titre et message, et met le focus sur « Annuler » (action prudente)', () => {
    setup();
    const dialog = screen.getByRole('alertdialog', { name: "Supprimer l'annonce ?" });
    expect(dialog).toHaveAccessibleDescription('Cette action est définitive.');
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });

  it('confirme ou annule, et se ferme avec Échap', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
