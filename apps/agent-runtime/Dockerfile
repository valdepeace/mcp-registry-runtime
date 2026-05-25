# Build stage — includes native build tools for better-sqlite3
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage — slim, no build tools
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3027
ENV DB_PATH=/app/data/agent-runtime.db

EXPOSE 3027

CMD ["node", "dist/index.js"]
