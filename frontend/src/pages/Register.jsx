import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError, api } from '../api/client.js';
import Field from '../components/forms/Field.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

// Mêmes règles que le serveur (authController) : le serveur revérifie toujours.
const schema = z.object({
  displayName: z.string().trim().min(2, 'Au moins 2 caractères').max(60, '60 caractères au maximum'),
  email: z.email('Adresse e-mail invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(72, '72 caractères au maximum'),
});
const FIELDS = ['displayName', 'email', 'password'];

export default function Register() {
  usePageTitle('Inscription');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const origin = location.state?.from;
  const destination = origin ? `${origin.pathname}${origin.search ?? ''}` : '/';

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={destination} replace />;

  async function onSubmit(values) {
    try {
      await api('/auth/register', { method: 'POST', body: values });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_EXISTS') {
        setError('email', { message: 'Cette adresse e-mail est déjà utilisée' });
      } else if (error instanceof ApiError && error.code === 'VALIDATION' && error.details?.length) {
        // le serveur a refusé un champ que le formulaire avait laissé passer : on l'affiche sous le bon champ
        for (const { path, message } of error.details) setError(FIELDS.includes(path) ? path : 'root', { message });
      } else {
        setError('root', {
          message: error instanceof ApiError ? error.message : 'Inscription impossible, vérifiez votre connexion et réessayez.',
        });
      }
      return;
    }

    try {
      await login({ email: values.email, password: values.password });
    } catch {
      toast.info('Compte créé. Connectez-vous pour continuer.');
      navigate('/connexion', { replace: true, state: location.state });
      return;
    }
    toast.success('Compte créé, bienvenue !');
    navigate(destination, { replace: true });
  }

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Inscription</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <Field label="Prénom ou pseudo" autoComplete="nickname" error={errors.displayName?.message} {...register('displayName')} />
        <Field label="Adresse e-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Field
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          hint="8 caractères minimum"
          error={errors.password?.message}
          {...register('password')}
        />
        {errors.root && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{errors.root.message}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">{isSubmitting ? 'Création…' : 'Créer mon compte'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        Déjà inscrit ? <Link to="/connexion" state={location.state} className="font-medium text-brand-700 underline">Se connecter</Link>
      </p>
    </section>
  );
}
