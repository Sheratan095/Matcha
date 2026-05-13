.PHONY: install build dev up down clean

# Build all apps and packages
build:
	pnpm build

# Install dependencies
install:
	pnpm install

# Start all services in dev mode
# Starts the PostgreSQL container and then runs the development server for other microservices
dev: generate_env
	@if [ ! -d node_modules ]; then \
		echo "node_modules missing — running pnpm install..."; \
		pnpm install; \
	fi; \
	# Only run a full build if no package produced a dist directory yet
	if ! find . -type d -name dist -mindepth 2 | grep -q .; then \
		echo "no dist folders found — running pnpm build..."; \
		pnpm build; \
	fi; \
	docker compose up -d postgres
	pnpm dev

# Copy the .env.example to .env if it doesn't exist
generate_env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Generated .env from .env.example"; \
	else \
		echo ".env already exists, skipping generation"; \
	fi

# Start Docker infrastructure (PostgreSQL, Redis)
up:
	pnpm docker:up

# Stop Docker infrastructure
down:
	pnpm docker:down

# Reset Database: Stop containers, remove volumes, and start again to trigger init scripts
db-reset:
	@echo "Resetting database..."
	docker compose down -v
	docker compose up -d postgres
	@echo "Database reset and initialized with migrations and seeds."

# Clean build artifacts and node_modules
clean:
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +
