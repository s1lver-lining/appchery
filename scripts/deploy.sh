#!/usr/bin/env bash
# Builds the app and publishes it to a Cloudflare Pages project.
set -euo pipefail
cd "$(dirname "$0")/.."

# Two separate Pages projects rather than one project with preview branches: a preview deployment
# gets a random *.pages.dev hostname, and OPFS databases are per-origin, so a moving hostname would
# hand every deploy an empty database. Fixed projects keep preprod's data across deploys.
PROD_PROJECT="${APPCHERY_PAGES_PROD:-appchery}"
PREPROD_PROJECT="${APPCHERY_PAGES_PREPROD:-appchery-preprod}"

TARGET=""
DRY_RUN=0

usage() {
	echo "Usage: $0 <preprod|prod> [--dry-run]"
	echo
	echo "  preprod    Deploy to the ${PREPROD_PROJECT} Pages project."
	echo "  prod       Deploy to the ${PROD_PROJECT} Pages project. Asks for confirmation."
	echo "  --dry-run  Build and report what would be deployed, without uploading."
	echo
	echo "Project names come from APPCHERY_PAGES_PROD and APPCHERY_PAGES_PREPROD if set."
	echo "Authentication is wrangler's own: a browser login, or CLOUDFLARE_API_TOKEN and"
	echo "CLOUDFLARE_ACCOUNT_ID in the environment for CI."
}

while [ $# -gt 0 ]; do
	case "$1" in
	preprod | prod) TARGET="$1" ;;
	--dry-run) DRY_RUN=1 ;;
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
else
	PROJECT="$PREPROD_PROJECT"
fi

# A dirty tree deploys whatever happens to be on disk, which makes a production URL impossible to
# trace back to a commit. Preprod is where half-finished work belongs, so it only warns.
DIRTY=""
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
	DIRTY=" (working tree has uncommitted changes)"
fi
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

if [ "$TARGET" = prod ]; then
	echo "About to deploy ${COMMIT}${DIRTY} to production: ${PROJECT}"
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

npm run build

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
	echo "Dry run: would deploy build/ to the ${PROJECT} Pages project."
	du -sh build
	exit 0
fi

exec npx wrangler pages deploy build \
	--project-name "$PROJECT" \
	--branch "$([ "$TARGET" = prod ] && echo main || echo preprod)" \
	--commit-dirty="$([ -n "$DIRTY" ] && echo true || echo false)"
