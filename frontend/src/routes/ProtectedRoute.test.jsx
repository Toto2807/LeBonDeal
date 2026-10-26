import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import ProtectedRoute from './ProtectedRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/connexion" element={<p>Page de connexion</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/compte" element={<p>Mon compte</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirige un visiteur non connecté vers la connexion', () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderAt('/compte');
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });

  it('laisse passer un utilisateur connecté', () => {
    useAuth.mockReturnValue({ user: { id: '1', role: 'user' }, loading: false });
    renderAt('/compte');
    expect(screen.getByText('Mon compte')).toBeInTheDocument();
  });
});
