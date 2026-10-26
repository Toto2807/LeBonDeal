import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

let io = null;

// Le jeton JWT est envoyé à la connexion (io({ auth: { token } }) côté frontend) et vérifié avant d'accepter le client.
export function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.corsOrigin } });

  io.use((socket, next) => {
    try {
      socket.data.userId = jwt.verify(socket.handshake.auth.token, config.jwtSecret).sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // Une « salle » par utilisateur : tous ses onglets et appareils connectés reçoivent les événements.
  io.on('connection', (socket) => socket.join(`user:${socket.data.userId}`));
  return io;
}

// emitToUser(destinataireId, 'message:new', message) — sans effet si personne n'est connecté.
export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
