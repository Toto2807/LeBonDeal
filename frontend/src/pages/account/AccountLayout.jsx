import { Outlet } from 'react-router';

// Cadre de l'espace « Mon compte » : les sous-pages (annonces, favoris, messages, profil) s'affichent dans <Outlet />.
export default function AccountLayout() {
  return <Outlet />;
}
