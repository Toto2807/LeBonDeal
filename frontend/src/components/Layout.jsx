import { Outlet } from 'react-router';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

// Les pages s'affichent à la place de <Outlet />
export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
