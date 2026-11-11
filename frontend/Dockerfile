# base
FROM node:26.13.1-alpine AS base

WORKDIR /app/frontend

# deps
FROM base AS deps

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci

# build
FROM base AS build

ARG VITE_BACKEND_URL
ARG VITE_TIMEOUT
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_TIMEOUT=$VITE_TIMEOUT

COPY --from=deps /app/frontend/node_modules ./node_modules
COPY frontend/ ./
COPY backend/src/services/revision/policy.ts backend/src/services/revision/session.ts /app/backend/src/services/revision/

RUN npm run build

# runtime
FROM base AS runtime

COPY --from=build /app/frontend/dist ./dist

RUN npm install -g serve

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
