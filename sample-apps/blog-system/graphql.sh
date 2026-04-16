#!/bin/bash
#
# GraphQL API integration test for the blog-system sample app.
# Start the server first: pnpm run debug
#
# Usage: ./graphql.sh [base_url]
#

set -euo pipefail

BASE="${1:-http://localhost:18080}"
GQL="$BASE/graphql"
PASS=0
FAIL=0
TOTAL=0

green() { printf "\033[32m%s\033[0m" "$*"; }
red()   { printf "\033[31m%s\033[0m" "$*"; }
dim()   { printf "\033[2m%s\033[0m" "$*"; }

# ── helpers ────────────────────────────────────────────────────────────
gql() {
  local label="$1" expect="$2" query="$3"
  TOTAL=$((TOTAL + 1))

  local payload
  payload=$(printf '{"query":"%s"}' "$(echo "$query" | tr '\n' ' ' | sed 's/"/\\"/g')")

  local code
  code=$(curl -s -o /tmp/webda-gql-body -w "%{http_code}" \
    -X POST "$GQL" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null) || code="000"
  local body
  body=$(cat /tmp/webda-gql-body 2>/dev/null || echo "")

  # Check for GraphQL errors in response
  local has_errors
  has_errors=$(echo "$body" | grep -c '"errors"' 2>/dev/null || echo "0")

  if [ "$code" = "$expect" ] && [ "$has_errors" = "0" ]; then
    PASS=$((PASS + 1))
    echo "  $(green "PASS") $label"
  elif [ "$code" = "$expect" ] && [ "$expect" = "200" ] && [ "$has_errors" != "0" ]; then
    FAIL=$((FAIL + 1))
    echo "  $(red "FAIL") $label → GraphQL errors"
    echo "        $(dim "$(echo "$body" | head -c 200)")"
  else
    FAIL=$((FAIL + 1))
    echo "  $(red "FAIL") $label → HTTP $code (expected $expect)"
    echo "        $(dim "$(echo "$body" | head -c 200)")"
  fi
}

gql_mutation() {
  local label="$1" expect="$2" query="$3"
  gql "$label" "$expect" "$query"
}

section() { echo; echo "── $1 ──"; }

# ── Setup via REST (GraphQL needs data to query) ──────────────────────
section "Setup (REST)"

curl -s -X POST "$BASE/tags" -H "Content-Type: application/json" \
  -d '{"slug":"graphql-tag","name":"GraphQL","description":"GraphQL testing","color":"#e535ab"}' > /dev/null

curl -s -X POST "$BASE/users" -H "Content-Type: application/json" \
  -d '{"uuid":"550e8400-e29b-41d4-a716-446655440010","username":"gqluser","email":"gql@example.com","password":"secret","name":"GQL User"}' > /dev/null

curl -s -X POST "$BASE/posts" -H "Content-Type: application/json" \
  -d '{"title":"GraphQL Test Post","slug":"graphql-test","content":"Testing GraphQL queries with enough content here.","status":"draft","viewCount":0}' > /dev/null

echo "  $(dim "Created test data via REST")"

# ── Queries ────────────────────────────────────────────────────────────
section "Queries"

gql "Query all posts" 200 '{ Posts { results { slug title status } } }'

gql "Query single post" 200 '{ Post(slug: "graphql-test") { slug title content status viewCount } }'

gql "Query all tags" 200 '{ Tags { results { slug name color } } }'

gql "Query single tag" 200 '{ Tag(slug: "graphql-tag") { slug name description } }'

gql "Query all users" 200 '{ Users { results { uuid username email } } }'

gql "Query single user" 200 '{ User(uuid: "550e8400-e29b-41d4-a716-446655440010") { uuid username name bio } }'

gql "Query all comments" 200 '{ Comments { results { uuid content } } }'

# ── Mutations ──────────────────────────────────────────────────────────
section "Mutations"

gql_mutation "Create post via mutation" 200 \
  'mutation { createPost(Post: {title: "GQL Created", slug: "gql-created", content: "Created via GraphQL mutation with enough text.", status: "draft", viewCount: 0}) { slug title } }'

gql_mutation "Update post via mutation" 200 \
  'mutation { updatePost(uuid: "gql-created", Post: {title: "GQL Updated", slug: "gql-created", content: "Updated via GraphQL mutation with enough text.", status: "draft", viewCount: 5}) { slug title viewCount } }'

gql_mutation "Delete post via mutation" 200 \
  'mutation { deletePost(uuid: "gql-created") { success } }'

gql_mutation "Create tag via mutation" 200 \
  'mutation { createTag(Tag: {slug: "gql-new-tag", name: "GQL Tag", description: "From GraphQL"}) { slug name } }'

gql_mutation "Delete tag via mutation" 200 \
  'mutation { deleteTag(uuid: "gql-new-tag") { success } }'

# ── Introspection ─────────────────────────────────────────────────────
section "Introspection"

gql "Schema introspection" 200 '{ __schema { queryType { name } mutationType { name } subscriptionType { name } } }'

gql "List types" 200 '{ __schema { types { name kind } } }'

# ── Cleanup ────────────────────────────────────────────────────────────
section "Cleanup (REST)"

curl -s -X DELETE "$BASE/posts/graphql-test" > /dev/null
curl -s -X DELETE "$BASE/tags/graphql-tag" > /dev/null
curl -s -X DELETE "$BASE/users/550e8400-e29b-41d4-a716-446655440010" > /dev/null

echo "  $(dim "Cleaned up test data")"

# ── Summary ────────────────────────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  echo "  $(green "ALL PASSED") $PASS/$TOTAL tests"
else
  echo "  $(red "$FAIL FAILED"), $PASS passed out of $TOTAL tests"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

rm -f /tmp/webda-gql-body
exit "$FAIL"
