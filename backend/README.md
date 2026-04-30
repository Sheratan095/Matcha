# My Platform Monorepo

## Requirements
- Node.js >= 18
- pnpm >= 8
- Docker

## Setup
1. Copy `.env.example` to `.env` in the root (if generating root envs)
2. Run `pnpm install`
3. Run `pnpm docker:up` to start backing services (PostgreSQL, Redis)
4. Run `pnpm db:push` in `packages/database` (or `pnpm build`) to push schema
5. Run `pnpm dev` to start all apps in watch mode

## Apps
- **Gateway**: `http://localhost:3000`
- **Auth Service**: `http://localhost:3001`
- **Users Service**: `http://localhost:3002`
- **Project Service**: `http://localhost:3003`

## Scripts
- `pnpm dev`: Start all apps
- `pnpm build`: Build all packages and apps
- `pnpm lint`: Lint code
- `pnpm test`: Run tests
