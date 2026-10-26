# syntax=docker/dockerfile:1
# Contexte de build = racine du dépôt (le package-lock.json des workspaces npm y est).

# ── Développement : serveur Vite avec rechargement à chaud ──
FROM node:24-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend
COPY frontend ./frontend
ENV NODE_ENV=development
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "frontend", "--", "--host", "0.0.0.0"]

# ── Production, étape 1 : construire les fichiers statiques ──
FROM dev AS build
ENV NODE_ENV=production
RUN npm run build --workspace frontend

# ── Production, étape 2 : nginx sert le site et relaie /api vers le backend ──
FROM nginx:alpine AS prod
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
