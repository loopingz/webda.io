#!/bin/bash
#
# REST API integration test for the blog-system sample app.
# Start the server first: pnpm run debug
#
# Usage: ./rest.sh [base_url]
#

set -euo pipefail

BASE="${1:-http://localhost:18080}"
PASS=0
FAIL=0
TOTAL=0

green() { printf "\033[32m%s\033[0m" "$*"; }
red()   { printf "\033[31m%s\033[0m" "$*"; }
dim()   { printf "\033[2m%s\033[0m" "$*"; }

# ── helpers ────────────────────────────────────────────────────────────
check() {
  local method="$1" path="$2" expect="$3" label="$4"
  shift 4
  TOTAL=$((TOTAL + 1))

  local args=(-s -o /tmp/webda-rest-body -w "%{http_code}" -X "$method" "$BASE$path")
  args+=("$@")

  local code
  code=$(curl "${args[@]}" 2>/dev/null) || code="000"
  local body
  body=$(cat /tmp/webda-rest-body 2>/dev/null || echo "")

  if [ "$code" = "$expect" ]; then
    PASS=$((PASS + 1))
    echo "  $(green "PASS") $method $path → $code  $(dim "$label")"
  else
    FAIL=$((FAIL + 1))
    echo "  $(red "FAIL") $method $path → $code (expected $expect)  $label"
    [ -n "$body" ] && echo "        $(dim "$body" | head -c 200)"
  fi
}

section() { echo; echo "── $1 ──"; }

# ── Tags CRUD ──────────────────────────────────────────────────────────
section "Tags"

check POST /tags 200 "Create tag" \
  -H "Content-Type: application/json" \
  -d '{"slug":"javascript","name":"JavaScript","description":"All things JS","color":"#f7df1e"}'

check POST /tags 200 "Create second tag" \
  -H "Content-Type: application/json" \
  -d '{"slug":"webda","name":"Webda","description":"Webda framework","color":"#f7992c"}'

check GET /tags/javascript 200 "Get tag by slug"

check PUT /tags/javascript 200 "Update tag" \
  -H "Content-Type: application/json" \
  -d '{"slug":"javascript","name":"JavaScript Updated","description":"Updated description","color":"#f7df1e"}'

check PUT /tags 200 "Query tags" \
  -H "Content-Type: application/json" \
  -d '{"q":""}'

# ── Users CRUD ─────────────────────────────────────────────────────────
section "Users"

USER1_UUID="550e8400-e29b-41d4-a716-446655440001"
USER2_UUID="550e8400-e29b-41d4-a716-446655440002"

check POST /users 200 "Create user 1" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$USER1_UUID\",\"username\":\"alice\",\"email\":\"alice@example.com\",\"password\":\"secret123\",\"name\":\"Alice Smith\",\"bio\":\"Blogger\"}"

check POST /users 200 "Create user 2" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$USER2_UUID\",\"username\":\"bob\",\"email\":\"bob@example.com\",\"password\":\"secret456\",\"name\":\"Bob Jones\"}"

check GET "/users/$USER1_UUID" 200 "Get user by uuid"

check PUT /users 200 "Query users" \
  -H "Content-Type: application/json" \
  -d '{"q":""}'

check PATCH "/users/$USER1_UUID" 200 "Patch user" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$USER1_UUID\",\"bio\":\"Senior Blogger\"}"

# ── Posts CRUD ─────────────────────────────────────────────────────────
section "Posts"

check POST /posts 200 "Create post" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","slug":"hello-world","content":"This is my first blog post with enough content.","status":"draft","viewCount":0}'

check POST /posts 200 "Create second post" \
  -H "Content-Type: application/json" \
  -d '{"title":"Webda Framework","slug":"webda-framework","content":"Webda is a great DDD framework for Node.js applications.","status":"draft","viewCount":0}'

check GET /posts/hello-world 200 "Get post by slug"

check PUT /posts/hello-world 200 "Update post" \
  -H "Content-Type: application/json" \
  -d '{"slug":"hello-world","title":"Hello World Updated","content":"Updated content for first blog post with enough text.","status":"draft","viewCount":5}'

check PUT /posts 200 "Query posts" \
  -H "Content-Type: application/json" \
  -d '{"q":""}'

check PATCH /posts/hello-world 200 "Patch post" \
  -H "Content-Type: application/json" \
  -d '{"slug":"hello-world","viewCount":10}'

# ── Post Actions ───────────────────────────────────────────────────────
section "Post Actions"

check POST /posts/hello-world/publish 200 "Publish post" \
  -H "Content-Type: application/json" \
  -d '{"destination":"twitter"}'

# ── Comments CRUD ──────────────────────────────────────────────────────
section "Comments"

COMMENT_UUID="660e8400-e29b-41d4-a716-446655440001"

check POST /comments 200 "Create comment" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$COMMENT_UUID\",\"content\":\"Great post!\",\"post\":\"hello-world\",\"author\":\"$USER1_UUID\",\"isEdited\":false}"

check GET "/comments/$COMMENT_UUID" 200 "Get comment"

check PUT /comments 200 "Query comments" \
  -H "Content-Type: application/json" \
  -d '{"q":""}'

check PATCH "/comments/$COMMENT_UUID" 200 "Patch comment" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$COMMENT_UUID\",\"content\":\"Great post! (edited)\",\"isEdited\":true}"

# ── Service Operations ─────────────────────────────────────────────────
section "Service Operations"

check GET /version 200 "Get version"

check PUT /publisher/publish 200 "Publisher.publish" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from REST"}'

check PUT /publisher/publishpost 200 "Publisher.publishPost" \
  -H "Content-Type: application/json" \
  -d '{"postId":"hello-world"}'

check PUT /testbean/testoperation 200 "TestBean.testOperation" \
  -H "Content-Type: application/json" \
  -d '{"counter":42}'

check PUT /testbean/demonstratetypesafety 200 "TestBean.demonstrateTypeSafety" \
  -H "Content-Type: application/json" \
  -d '{}'

# ── Cleanup ────────────────────────────────────────────────────────────
section "Cleanup"

check DELETE "/comments/$COMMENT_UUID" 204 "Delete comment"
check DELETE /posts/webda-framework 204 "Delete post"
check DELETE /posts/hello-world 204 "Delete post"
check DELETE /tags/webda 204 "Delete tag"
check DELETE /tags/javascript 204 "Delete tag"
check DELETE "/users/$USER2_UUID" 204 "Delete user 2"
check DELETE "/users/$USER1_UUID" 204 "Delete user 1"

# ── Summary ────────────────────────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  echo "  $(green "ALL PASSED") $PASS/$TOTAL tests"
else
  echo "  $(red "$FAIL FAILED"), $PASS passed out of $TOTAL tests"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

rm -f /tmp/webda-rest-body
exit "$FAIL"
