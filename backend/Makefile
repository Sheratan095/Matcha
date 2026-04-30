.PHONY: install build dev up down clean

# Install dependencies
install:
	pnpm install

# Build all apps and packages
build:
	pnpm build

# Start all services in dev mode
dev:
	pnpm dev

# Start Docker infrastructure (PostgreSQL, Redis)
up:
	pnpm docker:up

# Stop Docker infrastructure
down:
	pnpm docker:down

# Clean build artifacts and node_modules
clean:
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +
