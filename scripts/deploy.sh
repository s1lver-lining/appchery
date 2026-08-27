#!/usr/bin/env bash
# Pushes the server migrations, then builds the app and publishes it to a Cloudflare Pages project.
#
# The database goes first and the app second, always: a client that pushes a column the server has
# never heard of gets an error, while a server holding a column no client sends yet is harmless.
set -euo pipefail
cd "$(dirname "$0")/.."

# Two separate Pages projects rather than one project with preview branches: a preview deployment
# gets a random *.pages.dev hostname, and OPFS databases are per-origin, so a moving hostname would
# hand every deploy an empty database. Fixed projects keep preprod's data across deploys.
PROD_PROJECT="${APPCHERY_PAGES_PROD:-appchery}"
PREPROD_PROJECT="${APPCHERY_PAGES_PREPROD:-appchery-preprod}"

# Production answers on its own domain, which is the address on the poster and the one Supabase
# redirects to. The *.pages.dev hostname still resolves, but it is a second origin with its own OPFS
# database, so nothing should send anybody there.
PROD_URL="${APPCHERY_URL_PROD:-https://app.appchery.com}"
PREPROD_URL="${APPCHERY_URL_PREPROD:-https://${PREPROD_PROJECT}.pages.dev}"

TARGET=""
DRY_RUN=0
SKIP_DB=0
SKIP_CHECKS=0

usage() {
	echo "Usage: $0 <preprod|prod> [--dry-run]"
	echo
	echo "  preprod    Deploy to ${PREPROD_PROJECT} → ${PREPROD_URL}"
	echo "  prod       Deploy to ${PROD_PROJECT} → ${PROD_URL}"
	echo "             Asks for confirmation."
	echo "  --dry-run  Report the migrations and the build that would go out, without sending either."
	echo "  --skip-db  Deploy the app alone, for a change that touches no migration."
	echo "  --skip-checks  Skip db:check before pushing. Refused for prod."
	echo
	echo "Project names come from APPCHERY_PAGES_PROD and APPCHERY_PAGES_PREPROD if set."
	echo "The database is APPCHERY_SUPABASE_PROD or APPCHERY_SUPABASE_PREPROD, with its password in"
	echo "SUPABASE_DB_PASSWORD or PROD_DB_PASS / PREPROD_DB_PASS in .env."
	echo "Authentication is wrangler's own: a browser login, or CLOUDFLARE_API_TOKEN and"
	echo "CLOUDFLARE_ACCOUNT_ID in the environment for CI."
}

while [ $# -gt 0 ]; do
	case "$1" in
	preprod | prod) TARGET="$1" ;;
	--dry-run) DRY_RUN=1 ;;
	--skip-db) SKIP_DB=1 ;;
	--skip-checks) SKIP_CHECKS=1 ;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "$0: unknown option $1" >&2
		exit 2
		;;
	esac
	shift
done

if [ -z "$TARGET" ]; then
	echo "$0: pick a target" >&2
	echo >&2
	usage >&2
	exit 2
fi

if [ "$TARGET" = prod ]; then
	PROJECT="$PROD_PROJECT"
	URL="$PROD_URL"
	DB_REF="${APPCHERY_SUPABASE_PROD:-}"
	DB_PASS_NAME="PROD_DB_PASS"
	ENV_FILE=.env.production
else
	PROJECT="$PREPROD_PROJECT"
	URL="$PREPROD_URL"
	DB_REF="${APPCHERY_SUPABASE_PREPROD:-}"
	DB_PASS_NAME="PREPROD_DB_PASS"
	ENV_FILE=.env.preprod
fi

# The ref is the first label of the project's own hostname, and that hostname is already in the env
# file this target builds with. Reading it there beats keeping the same string in two places, where
# the second one is remembered in a shell nobody has open when they need it.
if [ -z "$DB_REF" ] && [ -f "$ENV_FILE" ]; then
	DB_URL="$(grep -E '^PUBLIC_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'\r' || true)"
	case "$DB_URL" in
	https://*.supabase.co*)
		DB_REF="${DB_URL#https://}"
		DB_REF="${DB_REF%%.supabase.co*}"
		;;
	esac
fi

# Read from .env rather than asked for: a deploy that stops halfway to prompt is a deploy somebody
# runs in a hurry and answers wrong. Never echoed, and .env is not in the repository.
DB_PASS="${SUPABASE_DB_PASSWORD:-}"
if [ -z "$DB_PASS" ] && [ -f .env ]; then
	# `|| true`, or a .env without this name ends the script through `set -e` with nothing said.
	DB_PASS="$(grep -E "^${DB_PASS_NAME}=" .env | head -1 | cut -d= -f2- | tr -d '"'"'"'\r' || true)"
fi

if [ "$SKIP_DB" = 0 ] && [ -n "$DB_REF" ] && [ -z "$DB_PASS" ]; then
	echo "$0: no password for the ${TARGET} database." >&2
	echo "Put it in ${DB_PASS_NAME} in .env, or SUPABASE_DB_PASSWORD in the environment. Without one" >&2
	echo "the CLI stops to ask, which hangs a deploy nobody is watching." >&2
	exit 2
fi

if [ "$SKIP_DB" = 0 ] && [ -z "$DB_REF" ]; then
	echo "$0: no database configured for ${TARGET}." >&2
	echo "It is read from PUBLIC_SUPABASE_URL in ${ENV_FILE}, which is missing or holds no" >&2
	echo "*.supabase.co address. Set APPCHERY_SUPABASE_$(echo "$TARGET" | tr '[:lower:]' '[:upper:]') instead for a self hosted server," >&2
	echo "or pass --skip-db to deploy the app alone. Shipping an app whose columns the server lacks is" >&2
	echo "the one order that breaks." >&2
	exit 2
fi

if [ "$SKIP_CHECKS" = 1 ] && [ "$TARGET" = prod ]; then
	echo "$0: --skip-checks is refused for prod: the policies guard everybody's data." >&2
	exit 2
fi

# A dirty tree deploys whatever happens to be on disk, which makes a production URL impossible to
# trace back to a commit. Preprod is where half-finished work belongs, so it only warns.
DIRTY=""
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
	DIRTY=" (working tree has uncommitted changes)"
fi
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# What the database would take, worked out before anything is asked or sent, so a production
# confirmation names the migrations rather than hiding them behind a yes.
PENDING=""
if [ "$SKIP_DB" = 0 ]; then
	# A database that cannot be reached is not a database with nothing to apply. Swallowing the
	# difference would ship an app against a schema that never got its migrations, which is the one
	# failure this whole ordering exists to prevent.
	if ! PREVIEW="$(npx supabase db push --project-ref "$DB_REF" --password "$DB_PASS" --dry-run 2>&1)"; then
		echo "$0: could not read the ${TARGET} database, so nothing was deployed." >&2
		echo "$PREVIEW" | tail -3 >&2
		exit 1
	fi
	PENDING="$(echo "$PREVIEW" | grep -oE '[0-9]{14}_[a-z0-9_]+\.sql' | sort -u || true)"
fi

if [ "$TARGET" = prod ]; then
	echo "About to deploy ${COMMIT}${DIRTY} to production: ${PROJECT}"
	if [ -n "$PENDING" ]; then
		echo "Migrations that would be applied to the production database first:"
		echo "$PENDING" | sed 's/^/  /'
		echo "A migration cannot be rolled back by deploying the old app again."
	elif [ "$SKIP_DB" = 0 ]; then
		echo "The production database is already up to date."
	fi
	if [ -n "$DIRTY" ] && [ "${CI:-}" != true ]; then
		echo "Commit first, or the deployed bundle will not match any commit." >&2
	fi
	if [ "${CI:-}" != true ]; then
		read -r -p "Continue? [y/N] " reply
		case "$reply" in
		y | Y | yes | Yes) ;;
		*)
			echo "Aborted."
			exit 1
			;;
		esac
	fi
else
	echo "Deploying ${COMMIT}${DIRTY} to ${PROJECT}"
fi

# The database first, and only then the app. `db push` applies what the project has not seen, so a
# deploy that changes no migration reaches this and does nothing.
if [ "$SKIP_DB" = 0 ] && [ -n "$PENDING" ]; then
	if [ "$SKIP_CHECKS" = 0 ]; then
		echo "Checking the migrations and the policies before they leave"
		npm run db:check
	fi

	if [ "$DRY_RUN" = 1 ]; then
		echo "Dry run: would apply to ${DB_REF}:"
		echo "$PENDING" | sed 's/^/  /'
	else
		npx supabase db push --project-ref "$DB_REF" --password "$DB_PASS" --yes
	fi
elif [ "$SKIP_DB" = 0 ]; then
	echo "Database already up to date"
fi

# Each target builds in its own Vite mode, so preprod bakes in .env.preprod and production bakes in
# .env.production. That is what points the two bundles at their own Supabase project.
if [ "$TARGET" = prod ]; then
	npm run build
else
	npm run build:preprod
fi

# A bundle with no server configured is a working offline app, so this warns rather than refusing.
if [ ! -f "$ENV_FILE" ]; then
	echo "Note: no ${ENV_FILE}, so this bundle ships without sync. See .env.example." >&2
fi

# _headers carries the cross-origin isolation the OPFS database needs, and it is easy to lose to a
# stray change in static/. Without it the app still boots, but on an in-memory database that loses
# everything on reload, so it is worth failing the deploy over.
if ! grep -q 'Cross-Origin-Embedder-Policy' build/_headers 2>/dev/null; then
	echo "$0: build/_headers is missing the isolation headers; refusing to deploy." >&2
	echo "See static/_headers and the comment in vite.config.ts." >&2
	exit 1
fi

if [ "$DRY_RUN" = 1 ]; then
	echo
	echo "Dry run: would deploy build/ to ${PROJECT}, serving ${URL}"
	du -sh build
	exit 0
fi

# Each project's production branch is set to the branch deployed here, so these land as production
# deployments and answer on the project root. Deploy a branch that is not the production branch and
# Cloudflare makes it a preview instead, reachable only at <branch>.<project>.pages.dev — a
# different origin, and so a different OPFS database.
BRANCH="$([ "$TARGET" = prod ] && echo main || echo preprod)"

# Not exec'd: wrangler reports the per-deployment hostname, which is a fresh origin every time and
# therefore an empty database. The stable URL is the one worth acting on, so it is printed last.
npx wrangler pages deploy build \
	--project-name "$PROJECT" \
	--branch "$BRANCH" \
	--commit-dirty="$([ -n "$DIRTY" ] && echo true || echo false)"

# Wrangler bundles the functions under here and leaves the scratch behind whenever it is interrupted.
rm -rf .wrangler/tmp

echo
echo "Deployed to ${URL}"
