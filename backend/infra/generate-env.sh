#!/usr/bin/env bash
# First-time setup of .env from .env.example. Run by `make generate_env`, and so by `make dev`.
#
# 1. Every placeholder secret is replaced with a fresh random value. The example values are public
#    (they are in git), so copying them as they are would let anyone forge JWTs or call the
#    internal endpoints.
# 2. The credentials only a person can provide (SMTP for the emails, the GitHub OAuth app) are asked
#    for in the terminal. Without a terminal (CI, piped input) they stay empty and are listed at the end.
#
# An existing .env is never touched: postgres and garage keep the credentials they were created with.
# Kept compatible with bash 3.2 (macOS's /bin/bash), hence no associative arrays.

set -euo pipefail

cd "$(dirname "$0")/.."
EXAMPLE_FILE=".env.example"
ENV_FILE=".env"

# The keys whose line gets replaced, space-separated; each value lives in a variable named value_<KEY>.
replaced_keys=" "

set_value()
{
	printf -v "value_$1" '%s' "$2"
	replaced_keys="$replaced_keys$1 "
}

# Value of a key in .env.example, without its trailing comment. Mirrors env_value() in garage/init.sh.
example_value()
{
	grep -E "^$1=" "$EXAMPLE_FILE" | head -n 1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//'
}

# Asks for a key until the answer is non-empty; Enter keeps the example's value when it has one.
# A secret is read without echo, so it never shows on screen or in a terminal recording.
ask()
{
	local	key="$1"
	local	label="$2"
	local	is_secret="${3:-}"
	local	default=""
	local	answer

	# A secret gets no default: its prompt hides it, so Enter would store a value nobody saw.
	if [ -z "$is_secret" ]
	then
		default="$(example_value "$key")"
	fi

	while true
	do
		if [ -n "$is_secret" ]
		then
			read -r -s -p "  $label: " answer
			# -s also swallows the newline of Enter
			echo
		else
			read -r -p "  $label${default:+ [$default]}: " answer
		fi

		answer="${answer:-$default}"

		if [ -z "$answer" ]
		then
			echo "  Required." >&2
		elif [[ "$answer" == *"'"* ]]
		then
			# A value that needs quoting is single-quoted (see dotenv_line), and dotenv has no
			# escape for a quote inside single quotes.
			echo "  Single quotes are not supported." >&2
		else
			break
		fi
	done

	set_value "$key" "$answer"
}

# One KEY=value line. Plain values stay unquoted like the rest of the file; anything else is
# single-quoted, or dotenv would cut a password at its first '#' and read the rest as a comment.
dotenv_line()
{
	local	plain='^[A-Za-z0-9@._:/+-]*$'

	if [[ "$2" =~ $plain ]]
	then
		printf '%s=%s\n' "$1" "$2"
	else
		printf "%s='%s'\n" "$1" "$2"
	fi
}

if [ -f "$ENV_FILE" ]
then
	echo ".env already exists, skipping generation"
	exit 0
fi

if ! command -v openssl >/dev/null
then
	echo "openssl is required to generate the .env secrets" >&2
	exit 1
fi

# The temp file holds secrets and its name is not covered by .gitignore: never leave it behind.
trap 'rm -f "$ENV_FILE.tmp"' EXIT
# Readable by the owner only, since it is full of credentials.
umask 077

# Hex only, so every value is safe unquoted for dotenv, docker compose and the DATABASE_URL.
set_value INTERNAL_KEY "$(openssl rand -hex 32)"
set_value DOCS_PASSWORD "$(openssl rand -hex 16)"
set_value POSTGRES_PASSWORD "$(openssl rand -hex 16)"
set_value GARAGE_RPC_SECRET "$(openssl rand -hex 32)"
set_value S3_ACCESS_KEY "GK$(openssl rand -hex 12)" # Garage requires the GK prefix
set_value S3_SECRET_KEY "$(openssl rand -hex 32)"
set_value JWT_ACCESS_SECRET "$(openssl rand -hex 32)"
set_value JWT_REFRESH_SECRET "$(openssl rand -hex 32)"

if [ -t 0 ]
then
	echo "Credentials only you can provide, all required."
	echo
	# No host or port question: both stay the example's values. The port could not change anyway,
	# since the mailer hardcodes `secure: false` (STARTTLS on 587, see notification's mailer.service.ts).
	echo "SMTP, for the verification and password-reset emails ($(example_value SMTP_HOST), port $(example_value SMTP_PORT))."
	echo "  With Gmail the password is an App Password (https://myaccount.google.com/apppasswords), not the account one."
	ask SMTP_USER "User (the sender address)"
	ask SMTP_PASS "Password" secret
	echo
	echo "GitHub OAuth app (https://github.com/settings/developers). The auth service does not start without it."
	echo "  Its callback URL must be $(example_value GITHUB_CALLBACK_URL)"
	ask GITHUB_CLIENT_ID "Client ID"
	ask GITHUB_CLIENT_SECRET "Client secret" secret
	echo
fi

# One pass over the example: a replaced key gets its new line, every other line (comments, ports,
# timeouts...) is copied as it is. Plain bash rather than sed, so nothing typed above can ever be
# read as part of a sed expression. Written to a temp file first, so an interrupted run never leaves
# a half-filled .env behind that the next run would then skip.
while IFS= read -r line || [ -n "$line" ]
do
	key="${line%%=*}"

	if [[ "$line" == *=* && "$replaced_keys" == *" $key "* ]]
	then
		value_var="value_$key"
		dotenv_line "$key" "${!value_var}"
	else
		printf '%s\n' "$line"
	fi
done < "$EXAMPLE_FILE" > "$ENV_FILE.tmp"

mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "Generated .env from .env.example with fresh random secrets"

# Only reachable without a terminal: say what is still empty instead of failing later at startup.
missing=""

for key in SMTP_USER SMTP_PASS GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET
do
	if grep -qE "^$key=$" "$ENV_FILE"
	then
		missing="$missing $key"
	fi
done

if [ -n "$missing" ]
then
	echo "Still empty in .env, fill them in before starting the services:$missing" >&2
fi
