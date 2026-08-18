#!/usr/bin/env bash
# Applies the server migrations to a throwaway Postgres and runs the policy tests against them.
#
# Plain Postgres with stubs rather than the full Supabase stack, because this has to be runnable in
# a few seconds on a laptop and in CI. It proves the migrations apply and the policies behave; it
# says nothing about auth or PostgREST, which the app's own tests cover.
set -euo pipefail

cd "$(dirname "$0")/.."

CONTAINER=appchery-sqlcheck
IMAGE=${POSTGRES_IMAGE:-postgres:16}

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=check "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
	docker exec "$CONTAINER" pg_isready -q && break
	sleep 1
done

run() {
	docker exec -i "$CONTAINER" psql -q -U postgres -v ON_ERROR_STOP=1 "${@:2}" < "$1"
}

run supabase/tests/stubs.sql
for migration in supabase/migrations/*.sql; do
	echo "applying $(basename "$migration")"
	run "$migration"
done

# One transaction, so a failed assertion rolls back and the tests can be read in any order.
echo "running policy tests"
run supabase/tests/rls.sql -1

# The two schemas are written by hand in two languages, so they are held against each other rather
# than assumed to match. Drift shows up in front of an archer as a permission or a not null error.
echo "comparing the client schema with the server one"
COLUMNS=$(mktemp)
docker exec "$CONTAINER" psql -X -A -t -U postgres -c \
	"copy (select table_name, column_name, is_nullable, case when column_default is null then 'NO' else 'YES' end
		from information_schema.columns where table_schema = 'public' order by table_name, column_name)
		to stdout with csv" > "$COLUMNS"
APPCHERY_SERVER_COLUMNS="$COLUMNS" npx vitest run src/lib/db/synced.schema.test.ts --reporter=dot
rm -f "$COLUMNS"

echo "server schema and policies pass"
