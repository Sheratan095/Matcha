#!/bin/bash
set -e

echo "Running migrations..."
for f in /init-scripts/migrations/*.sql; do
    echo "Executing $f..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "Running seeds..."
for f in /init-scripts/seeds/*.sql; do
    echo "Executing $f..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done
