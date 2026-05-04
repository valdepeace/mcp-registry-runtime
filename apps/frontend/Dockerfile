# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage — nginx as non-root on port 8080
FROM nginx:alpine

RUN addgroup -S nginxgroup && adduser -S nginxuser -G nginxgroup && \
    mkdir -p /var/cache/nginx /var/run && \
    chown -R nginxuser:nginxgroup /var/cache/nginx /var/run /etc/nginx/conf.d /usr/share/nginx/html

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER nginxuser

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
