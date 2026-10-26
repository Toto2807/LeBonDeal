# syntax=docker/dockerfile:1
# Contexte de build = racine du dépôt (le package-lock.json des workspaces npm y est).

# ── Dépendances de développement ──
FROM node:24-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend
COPY backend ./backend
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "backend"]

# ── Production : dépendances sans devDependencies, utilisateur non-root ──
FROM node:24-alpine AS prod
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --omit=dev
COPY backend ./backend
RUN mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "backend/src/server.js"]
