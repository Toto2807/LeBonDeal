import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';

// Chaque page est chargée à la demande : le premier affichage reste léger.
const Search = lazy(() => import('./pages/Search.jsx'));
const AdDetail = lazy(() => import('./pages/AdDetail.jsx'));
const SellerProfile = lazy(() => import('./pages/SellerProfile.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const PostAd = lazy(() => import('./pages/PostAd.jsx'));
const AccountLayout = lazy(() => import('./pages/account/AccountLayout.jsx'));
const MyAds = lazy(() => import('./pages/account/MyAds.jsx'));
const Favorites = lazy(() => import('./pages/account/Favorites.jsx'));
const Messages = lazy(() => import('./pages/account/Messages.jsx'));
const Profile = lazy(() => import('./pages/account/Profile.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-gray-500">Chargement…</p>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="recherche" element={<Search />} />
          <Route path="annonces/:id" element={<AdDetail />} />
          <Route path="vendeur/:id" element={<SellerProfile />} />
          <Route path="connexion" element={<Login />} />
          <Route path="inscription" element={<Register />} />

          {/* Pages réservées aux utilisateurs connectés */}
          <Route element={<ProtectedRoute />}>
            <Route path="deposer" element={<PostAd />} />
            <Route path="annonces/:id/modifier" element={<PostAd />} />
            <Route path="compte" element={<AccountLayout />}>
              <Route index element={<MyAds />} />
              <Route path="favoris" element={<Favorites />} />
              <Route path="messages/:conversationId?" element={<Messages />} />
              <Route path="profil" element={<Profile />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
