import { io } from 'socket.io-client';

// Une seule connexion WebSocket par onglet, ouverte à la connexion de l'utilisateur.
// Même origine que le site : en développement le proxy Vite relaie /socket.io, en production nginx.
let socket = null;

export function connectSocket(token) {
  socket?.disconnect();
  socket = io({ auth: { token } }); // le backend vérifie le jeton dans io.use(...)
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
