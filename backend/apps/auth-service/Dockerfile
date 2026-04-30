FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install && pnpm build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3001
CMD ["pnpm", "--filter", "auth-service", "start:prod"]
