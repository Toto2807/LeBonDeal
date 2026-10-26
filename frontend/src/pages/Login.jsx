import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError } from '../api/client.js';
import Field from '../components/forms/Field.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const schema = z.object({
  email: z.email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export default function Login() {
  usePageTitle('Connexion');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Page protégée qui a demandé la connexion (voir ProtectedRoute) : on y retourne une fois connecté.
  const origin = location.state?.from;
  const destination = origin ? `${origin.pathname}${origin.search ?? ''}` : '/';

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={destination} replace />;

  async function onSubmit(values) {
    try {
      await login(values);
      navigate(destination, { replace: true });
    } catch (error) {
      setError('root', {
        message: error instanceof ApiError ? error.message : 'Connexion impossible, vérifiez votre connexion et réessayez.',
      });
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Connexion</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <Field label="Adresse e-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Field label="Mot de passe" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        {errors.root && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{errors.root.message}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">{isSubmitting ? 'Connexion…' : 'Se connecter'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        Pas encore de compte ? <Link to="/inscription" state={location.state} className="font-medium text-brand-700 underline">Créer un compte</Link>
      </p>
    </section>
  );
}
