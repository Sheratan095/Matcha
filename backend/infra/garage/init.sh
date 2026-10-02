#!/usr/bin/env bash
# One-time Garage setup: cluster layout, bucket, access key, public web access.
# Safe to run multiple times: every step is skipped if already done.
#
# Usage (from the backend/ directory, with the garage container running):
#   ./infra/garage/init.sh

set -euo pipefail

cd "$(dirname "$0")/../.."
ENV_FILE=".env"

# Read one variable from .env, ignoring trailing comments and quotes
env_value()
{
	grep -E "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '"' | tr -d "'"
}

S3_BUCKET="$(env_value S3_BUCKET)"
S3_ACCESS_KEY="$(env_value S3_ACCESS_KEY)"
S3_SECRET_KEY="$(env_value S3_SECRET_KEY)"

if [ -z "$S3_BUCKET" ] || [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]
then
	echo "S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY must be set in $ENV_FILE" >&2
	exit 1
fi

garage()
{
	# RUST_LOG=warn hides the per-command "Connected to ..." info logs
	docker compose exec -T -e RUST_LOG=warn garage /garage "$@" 2> >(grep -v "attribute \`version\` is obsolete" >&2)
}

# 0. Wait for the daemon: right after "docker compose up" the CLI can't connect yet,
#    and a failed "garage status" would be mistaken for an already configured layout below.
for attempt in $(seq 1 30)
do
	if garage status >/dev/null 2>&1
	then
		break
	fi

	if [ "$attempt" -eq 30 ]
	then
		echo "Garage is not responding, is the container running? (docker compose up -d garage)" >&2
		exit 1
	fi

	sleep 1
done

# 1. Give the single node a storage role. A fresh node shows "NO ROLE ASSIGNED" and refuses to store anything.
if garage status 2>/dev/null | grep -q "NO ROLE ASSIGNED"
then
	NODE_ID="$(garage node id -q | cut -d@ -f1)"
	garage layout assign -z dc1 -c 1G "$NODE_ID"
	garage layout apply --version 1
	echo "Layout applied"
else
	echo "Layout already configured"
fi

# 2. Bucket
if garage bucket info "$S3_BUCKET" >/dev/null 2>&1
then
	echo "Bucket \"$S3_BUCKET\" already exists"
else
	garage bucket create "$S3_BUCKET"
fi

# 3. Access key: imported with the values from .env, so the profile service already knows them
if garage key info "$S3_ACCESS_KEY" >/dev/null 2>&1
then
	echo "Key $S3_ACCESS_KEY already exists"
else
	garage key import --yes -n matcha-profile "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
fi

garage bucket allow --read --write --owner "$S3_BUCKET" --key "$S3_ACCESS_KEY"

# 4. Public read-only access through the web endpoint (port 3902), so <img src> works without credentials
garage bucket website --allow "$S3_BUCKET"

echo "Garage ready: bucket \"$S3_BUCKET\" served at http://$S3_BUCKET.web.garage.localhost:3902/"
