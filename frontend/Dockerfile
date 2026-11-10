# base
FROM node:22.23.4-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm i -g pnpm@10.13.1

WORKDIR /app/frontend

# deps
FROM base AS deps

COPY frontend/package*.json frontend/pnpm*.yaml ./

RUN pnpm i --frozen-lockfile

# build
FROM base AS build

ARG VITE_BACKEND_URL
ARG VITE_TIMEOUT
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_TIMEOUT=$VITE_TIMEOUT

COPY --from=deps /app/frontend/node_modules ./node_modules
COPY frontend/ ./
COPY backend/src/services/revision/policy.ts backend/src/services/revision/session.ts /app/backend/src/services/revision/

RUN pnpm build

# runtime
FROM base AS runtime

COPY --from=build /app/frontend/dist ./dist

RUN npm install -g serve

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
