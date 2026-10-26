import { Car, Gamepad2, House, Shirt, Smartphone, Sofa, Tag } from 'lucide-react';

// La base stocke un nom d'icône par catégorie (colonne categories.icon) ; on n'importe que les icônes utilisées.
const ICONS = { car: Car, house: House, smartphone: Smartphone, sofa: Sofa, shirt: Shirt, 'gamepad-2': Gamepad2 };

export const categoryIcon = (name) => ICONS[name] ?? Tag;
