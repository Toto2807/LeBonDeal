// Contrastes vérifiés : texte sombre sur l'orange (jamais blanc, voir index.css), blanc sur le rouge foncé.
const VARIANTS = {
  primary: 'bg-brand-500 text-ink hover:bg-brand-400',
  secondary: 'border border-gray-300 bg-white text-ink hover:bg-gray-50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-ink hover:bg-gray-100',
};

// Classes d'un bouton, pour habiller un lien <Link> qui a l'allure d'un bouton (un lien reste un lien : il navigue).
export const buttonClasses = (variant = 'primary') =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]}`;

// `loading` désactive le bouton pendant un envoi (le texte « Publication… » est choisi par l'appelant).
// Cible tactile d'au moins 44 px (min-h-11).
export default function Button({ variant = 'primary', loading = false, disabled = false, className = '', children, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses(variant)} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
