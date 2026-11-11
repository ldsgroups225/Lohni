# base
FROM node:22.23.4-alpine AS base

WORKDIR /app

# builder
FROM base AS builder

COPY package*.json ./

RUN npm ci --legacy-peer-deps

COPY backend/ ./backend/

RUN npm run build

# runtime
FROM base AS runtime

# Podcasts join their audio segments with ffmpeg.
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
# Exam definitions, read from the working directory at runtime.
COPY modules/ ./modules/

EXPOSE 5000

CMD ["npm", "start"]
