#!/bin/bash
#
# gRPC API integration test for the blog-system sample app.
# Start the server first: pnpm run debug
# Requires: grpcurl (https://github.com/fullstorydev/grpcurl)
#
# Usage: ./grpc.sh [host:port]
#

set -euo pipefail

HOST="${1:-localhost:18080}"
PASS=0
FAIL=0
TOTAL=0

green() { printf "\033[32m%s\033[0m" "$*"; }
red()   { printf "\033[31m%s\033[0m" "$*"; }
dim()   { printf "\033[2m%s\033[0m" "$*"; }

# Check grpcurl is installed
if ! command -v grpcurl &> /dev/null; then
  echo "$(red "ERROR"): grpcurl is required but not installed."
  echo "  Install: brew install grpcurl  (macOS)"
  echo "           go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest  (Go)"
  exit 1
fi

# ── Detect proto file ─────────────────────────────────────────────────
PROTO=""
if [ -f ".webda/app.proto" ]; then
  PROTO="-proto .webda/app.proto"
elif [ -f "app.proto" ]; then
  PROTO="-proto app.proto"
fi

# -insecure skips TLS cert validation (dev self-signed). Swap for -plaintext
# when targeting the h2c port (default 50051) instead of the TLS main port.
GRPC="grpcurl -insecure $PROTO"

# ── helpers ────────────────────────────────────────────────────────────
check() {
  local label="$1" service="$2" method="$3"
  shift 3
  TOTAL=$((TOTAL + 1))

  local output
  if output=$($GRPC "$@" "$HOST" "${service}/${method}" 2>&1); then
    PASS=$((PASS + 1))
    echo "  $(green "PASS") ${service}/${method}  $(dim "$label")"
  else
    # Check if it's a known gRPC error vs connection failure
    if echo "$output" | grep -q "UNIMPLEMENTED\|NOT_FOUND"; then
      FAIL=$((FAIL + 1))
      echo "  $(red "FAIL") ${service}/${method}  $label"
      echo "        $(dim "$(echo "$output" | head -c 200)")"
    elif echo "$output" | grep -q "connection refused\|transport"; then
      FAIL=$((FAIL + 1))
      echo "  $(red "FAIL") ${service}/${method}  $label (connection failed)"
    else
      # Some gRPC errors (like NOT_FOUND for missing objects) are expected
      FAIL=$((FAIL + 1))
      echo "  $(red "FAIL") ${service}/${method}  $label"
      echo "        $(dim "$(echo "$output" | head -c 200)")"
    fi
  fi
}

section() { echo; echo "── $1 ──"; }

# ── Service Discovery ─────────────────────────────────────────────────
section "Service Discovery"

TOTAL=$((TOTAL + 1))
if services=$($GRPC "$HOST" list 2>&1); then
  PASS=$((PASS + 1))
  echo "  $(green "PASS") list services"
  echo "$services" | while read -r svc; do echo "        $(dim "$svc")"; done
else
  FAIL=$((FAIL + 1))
  echo "  $(red "FAIL") list services"
  echo "        $(dim "$services" | head -c 200)"
  echo
  echo "gRPC may not be enabled. Ensure GrpcService is configured."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $(red "$FAIL FAILED"), $PASS passed out of $TOTAL tests"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

# ── Tags ───────────────────────────────────────────────────────────────
section "Tags"

check "Create tag" webda.TagService Create \
  -d '{"slug":"grpc-tag","name":"gRPC Tag","description":"From gRPC","color":"#00b4d8"}'

check "Get tag" webda.TagService Get \
  -d '{"slug":"grpc-tag"}'

check "Query tags" webda.TagsService Query \
  -d '{"query":""}'

check "Update tag" webda.TagService Update \
  -d '{"slug":"grpc-tag","name":"gRPC Tag Updated"}'

# ── Users ──────────────────────────────────────────────────────────────
section "Users"

GRPC_USER="550e8400-e29b-41d4-a716-446655440020"

check "Create user" webda.UserService Create \
  -d "{\"uuid\":\"$GRPC_USER\",\"username\":\"grpcuser\",\"email\":\"grpc@example.com\",\"password\":\"secret\",\"name\":\"gRPC User\"}"

check "Get user" webda.UserService Get \
  -d "{\"uuid\":\"$GRPC_USER\"}"

check "Query users" webda.UsersService Query \
  -d '{"query":""}'

# ── Posts ──────────────────────────────────────────────────────────────
section "Posts"

check "Create post" webda.PostService Create \
  -d '{"title":"gRPC Test Post","slug":"grpc-test","content":"Testing gRPC with the blog system sample app.","status":"draft","viewCount":0}'

check "Get post" webda.PostService Get \
  -d '{"slug":"grpc-test"}'

check "Query posts" webda.PostsService Query \
  -d '{"query":""}'

check "Update post" webda.PostService Update \
  -d '{"slug":"grpc-test","title":"gRPC Updated","content":"Updated via gRPC with enough content here.","status":"published","viewCount":1}'

# ── Post Actions ───────────────────────────────────────────────────────
section "Post Actions"

check "Publish post" webda.PostService Publish \
  -d '{"uuid":"grpc-test"}'

# ── Comments ───────────────────────────────────────────────────────────
section "Comments"

GRPC_COMMENT="770e8400-e29b-41d4-a716-446655440001"

check "Create comment" webda.CommentService Create \
  -d "{\"uuid\":\"$GRPC_COMMENT\",\"content\":\"gRPC comment\",\"post\":\"grpc-test\",\"author\":\"$GRPC_USER\",\"isEdited\":false}"

check "Get comment" webda.CommentService Get \
  -d "{\"uuid\":\"$GRPC_COMMENT\"}"

check "Query comments" webda.CommentsService Query \
  -d '{"query":""}'

# ── Service Operations ─────────────────────────────────────────────────
section "Service Operations"

check "Version" webda.VersionService Get -d '{}'

check "Publisher.publish" webda.PublisherService Publish \
  -d '{"message":"Hello from gRPC"}'

check "Publisher.publishPost" webda.PublisherService PublishPost \
  -d '{"postId":"grpc-test"}'

check "TestBean.testOperation" webda.TestBeanService TestOperation \
  -d '{"counter":42}'

# ── Cleanup ────────────────────────────────────────────────────────────
section "Cleanup"

check "Delete comment" webda.CommentService Delete -d "{\"uuid\":\"$GRPC_COMMENT\"}"
check "Delete post" webda.PostService Delete -d '{"slug":"grpc-test"}'
check "Delete tag" webda.TagService Delete -d '{"slug":"grpc-tag"}'
check "Delete user" webda.UserService Delete -d "{\"uuid\":\"$GRPC_USER\"}"

# ── Summary ────────────────────────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  echo "  $(green "ALL PASSED") $PASS/$TOTAL tests"
else
  echo "  $(red "$FAIL FAILED"), $PASS passed out of $TOTAL tests"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit "$FAIL"
