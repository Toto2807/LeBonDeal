import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';

// Enveloppe des routes privées. <ProtectedRoute role="admin" /> pour les pages d'administration.
export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // on ne sait pas encore si le visiteur est connecté : évite un faux redirect
  if (!user) return <Navigate to="/connexion" replace state={{ from: location }} />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
