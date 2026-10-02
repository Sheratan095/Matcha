.PHONY: install build dev up down clean db-reset storage seed-pictures generate_env

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
	docker compose up -d postgres garage
	./infra/garage/init.sh
	$(MAKE) seed-pictures
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

# Reset Database: Stop containers, remove volumes, and start again to trigger init scripts.
# Garage volumes are wiped too: the picture URLs lived in the database that was just reset.
db-reset:
	@echo "Resetting database and picture storage..."
	docker compose down -v
	docker compose up -d postgres garage
	./infra/garage/init.sh
	$(MAKE) seed-pictures
	@echo "Database reset and initialized with migrations and seeds."

# Start Garage (object storage for pictures) and make sure it is initialized
storage:
	docker compose up -d garage
	./infra/garage/init.sh

# Upload the committed sample images (infra/garage/seed-images/) into the Garage bucket,
# so the demo profiles seeded in the database actually show pictures. Idempotent.
seed-pictures:
	pnpm --filter @matcha/profile seed:pictures

# Clean build artifacts and node_modules
clean:
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +
	find . -name "*.tsbuildinfo" -type f -delete
	find . -name ".turbo" -type d -prune -exec rm -rf '{}' +
