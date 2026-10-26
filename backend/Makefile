.PHONY: install build dev up down clean db-migrate db-reset storage seed-pictures generate_env

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


# Create .env from .env.example if it doesn't exist: random secrets, and the SMTP / GitHub OAuth
# credentials asked in the terminal. An existing .env is never touched (see the script).
generate_env:
	@./infra/generate-env.sh

# Start Docker infrastructure (PostgreSQL, Redis)
up: generate_env
	pnpm docker:up

# Stop Docker infrastructure
down:
	pnpm docker:down

# Apply any NEW SQL migrations to the ALREADY-RUNNING database — no reset, no data loss, no
# re-seeding. Runs the migration files inside the postgres container (where infra/db/migrations is
# mounted at /init-scripts/migrations). Every migration uses CREATE ... IF NOT EXISTS / ADD COLUMN
# IF NOT EXISTS, so re-running already-applied ones is a harmless no-op — only new ones take effect.
# Use this after adding a migration; use db-reset only when you want a clean slate.
db-migrate:
	@echo "Applying migrations to the running database..."
	docker compose up -d --wait postgres
	docker compose exec -T postgres sh -c 'for f in /init-scripts/migrations/*.sql; do echo "-- applying $$(basename $$f)"; psql -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -f "$$f"; done'
	@echo "Migrations applied (no reset, data preserved)."

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
