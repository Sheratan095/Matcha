.PHONY: install build setup dev up infra down clean db-migrate db-reset storage seed-pictures generate_env

# Plain `make` starts the whole backend in production mode, whatever target comes first in this file
.DEFAULT_GOAL := up

# Build all apps and packages
build:
	pnpm build

# Install dependencies
install:
	pnpm install

# Everything the services need, without starting them: .env, dependencies, builds, the Docker
# infrastructure and the seed pictures. Each step skips itself when already done, so this is also
# what a fresh clone runs. Split from `dev` so the root Makefile can start the servers itself.
setup: generate_env
	@if [ ! -d node_modules ]; then \
		echo "node_modules missing — running pnpm install..."; \
		pnpm install --frozen-lockfile; \
	fi
	@# Only run a full build if no package produced a dist directory yet
	@if ! find . -mindepth 2 -type d -name dist | grep -q .; then \
		echo "no dist folders found — running pnpm build..."; \
		pnpm build; \
	fi
	$(MAKE) infra
	./infra/garage/init.sh
	$(MAKE) seed-pictures

# Start the whole backend in production mode: setup, then every service compiled (`node dist/main`),
# no watchers. turbo rebuilds first (start:prod depends on build in turbo.json), so what runs always
# matches the sources. Runtime settings such as NODE_ENV still come from .env.
# Ctrl-C stops the services, `make down` the Docker infrastructure.
up: setup
	pnpm start

# Start the whole backend in dev mode: setup, then every service in watch mode
dev: setup
	pnpm dev


# Create .env from .env.example if it doesn't exist: random secrets, and the SMTP / GitHub OAuth
# credentials asked in the terminal. An existing .env is never touched (see the script).
generate_env:
	@./infra/generate-env.sh

# Start the Docker infrastructure (PostgreSQL, Garage). Only those two: the app images in
# docker-compose.yml do not build, the services run on the host through `make dev`.
# --wait returns once postgres passes its healthcheck, so nothing starts against a database still booting.
infra: generate_env
	docker compose up -d --wait postgres garage

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
