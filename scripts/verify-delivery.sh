#!/bin/sh
# Reproducible local delivery gate used before enabling live billing or AI.
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(CDPATH='' cd -- "$script_dir/.." && pwd)
mode=${1:-all}
image=${MUSEFLOW_VERIFY_IMAGE:-museflow-ai-music:verify}
verify_project="museflow-verify-$$"
verify_tmp=''
provider_pid=''
platform_pid=''
npm_bin=''
node_bin=''

cd "$project_dir"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "required command not found: $1" >&2
    exit 127
  fi
}

resolve_javascript_runtime() {
  npm_bin=$(command -v npm 2>/dev/null || true)
  node_bin=$(command -v node 2>/dev/null || true)
  if [ -z "$node_bin" ] && [ -n "${MUSEFLOW_NODE_BIN:-}" ] && [ -x "$MUSEFLOW_NODE_BIN" ]; then
    node_bin=$MUSEFLOW_NODE_BIN
  fi
  if [ -z "$node_bin" ]; then
    pnpm_bin=$(command -v pnpm 2>/dev/null || true)
    if [ -n "$pnpm_bin" ]; then
      pnpm_dir=$(CDPATH='' cd -- "$(dirname -- "$pnpm_bin")" && pwd)
      bundled_node="$pnpm_dir/../../node/bin/node"
      if [ -x "$bundled_node" ]; then node_bin=$bundled_node; fi
    fi
  fi
  if [ -z "$node_bin" ] || [ ! -x "$node_bin" ]; then
    echo "required Node.js runtime not found; set MUSEFLOW_NODE_BIN to an executable Node 20.19+ binary" >&2
    exit 127
  fi
}

run_server_tests() {
  if [ -n "$npm_bin" ]; then npm test --workspace server
  else "$node_bin" node_modules/vitest/vitest.mjs run server/test; fi
}

run_web_tests() {
  if [ -n "$npm_bin" ]; then npm test --workspace web
  else "$node_bin" node_modules/vitest/vitest.mjs run --config web/vitest.config.ts web/tests; fi
}

run_typecheck() {
  if [ -n "$npm_bin" ]; then npm run typecheck
  else
    "$node_bin" node_modules/typescript/bin/tsc -p server/tsconfig.json --noEmit
    "$node_bin" node_modules/typescript/bin/tsc -p web/tsconfig.json --noEmit
  fi
}

run_build() {
  if [ -n "$npm_bin" ]; then npm run build
  else
    "$node_bin" node_modules/typescript/bin/tsc -p server/tsconfig.json
    "$node_bin" node_modules/typescript/bin/tsc -p web/tsconfig.json --noEmit
    "$node_bin" node_modules/vite/bin/vite.js build web
  fi
}

compose_verify() {
  docker compose --project-name "$verify_project" --env-file .env.example "$@"
}

cleanup_verify_stack() {
  if [ -n "$platform_pid" ]; then
    kill "$platform_pid" >/dev/null 2>&1 || true
    wait "$platform_pid" 2>/dev/null || true
    platform_pid=''
  fi
  if [ -n "$provider_pid" ]; then
    kill "$provider_pid" >/dev/null 2>&1 || true
    wait "$provider_pid" 2>/dev/null || true
    provider_pid=''
  fi
  compose_verify down --volumes --remove-orphans >/dev/null 2>&1 || true
  if [ -n "$verify_tmp" ] && [ -d "$verify_tmp" ]; then
    rm -rf -- "$verify_tmp"
    verify_tmp=''
  fi
}

free_port() {
  "$node_bin" -e "const net=require('node:net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>{console.log(server.address().port);server.close()})"
}

show_e2e_logs() {
  if [ -n "$verify_tmp" ] && [ -f "$verify_tmp/fake-mxapi.log" ]; then
    printf '%s\n' 'fake-mxapi.log (tail)' >&2
    tail -n 120 "$verify_tmp/fake-mxapi.log" >&2
  fi
  if [ -n "$verify_tmp" ] && [ -f "$verify_tmp/museflow.log" ]; then
    printf '%s\n' 'museflow.log (tail)' >&2
    tail -n 200 "$verify_tmp/museflow.log" >&2
  fi
}

run_quality() {
  require docker
  require curl
  resolve_javascript_runtime

  compose_verify config --quiet
  # Port 0 asks Docker for free loopback ports, so this gate cannot collide
  # with a developer's running MuseFlow stack.
  POSTGRES_PORT=0
  VALKEY_PORT=0
  MINIO_API_PORT=0
  MINIO_CONSOLE_PORT=0
  export POSTGRES_PORT VALKEY_PORT MINIO_API_PORT MINIO_CONSOLE_PORT
  trap cleanup_verify_stack EXIT HUP INT TERM
  compose_verify up --detach --wait postgres valkey minio
  compose_verify run --rm --no-deps minio-init

  postgres_port=$(compose_verify port postgres 5432 | awk -F: 'END { print $NF }')
  valkey_port=$(compose_verify port valkey 6379 | awk -F: 'END { print $NF }')
  minio_port=$(compose_verify port minio 9000 | awk -F: 'END { print $NF }')
  export TEST_DATABASE_URL="postgresql://museflow:museflow-local-change-me@127.0.0.1:${postgres_port}/museflow"
  export TEST_REDIS_URL="redis://127.0.0.1:${valkey_port}/0"
  export TEST_S3_ENDPOINT="http://127.0.0.1:${minio_port}"
  export TEST_S3_BUCKET=museflow
  export TEST_S3_ACCESS_KEY_ID=museflow-minio
  export TEST_S3_SECRET_ACCESS_KEY=museflow-minio-change-me

  run_server_tests
  run_web_tests
  run_typecheck
  run_build

  if "$node_bin" -e "const pkg=require('./package.json');process.exit(pkg.scripts?.['test:e2e']?0:1)"; then
    verify_tmp=$(mktemp -d "${TMPDIR:-/tmp}/museflow-verify.XXXXXX")
    provider_port=$(free_port)
    api_port=$(free_port)

    env FAKE_PORT="$provider_port" FAKE_API_KEY=local-fake-key \
      "$node_bin" node_modules/tsx/dist/cli.mjs server/test/fakeUpstreamServer.ts \
      >"$verify_tmp/fake-mxapi.log" 2>&1 &
    provider_pid=$!
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
      if curl --silent --output /dev/null "http://127.0.0.1:${provider_port}/"; then break; fi
      if ! kill -0 "$provider_pid" 2>/dev/null || [ "$attempt" -eq 30 ]; then
        show_e2e_logs
        return 1
      fi
      sleep 1
    done

    env \
      NODE_ENV=development PLATFORM_MODE=true RUNTIME_ROLE=all MUSEFLOW_LOAD_DOTENV=false \
      HOST=127.0.0.1 PORT="$api_port" PUBLIC_URL="http://127.0.0.1:${api_port}" \
      DATABASE_URL="$TEST_DATABASE_URL" REDIS_URL="$TEST_REDIS_URL" \
      QUEUE_DRIVER=bullmq REDIS_KEY_PREFIX="${verify_project}:e2e" \
      STORAGE_DRIVER=s3 S3_ENDPOINT="$TEST_S3_ENDPOINT" S3_REGION=us-east-1 \
      S3_BUCKET="$TEST_S3_BUCKET" S3_ACCESS_KEY_ID="$TEST_S3_ACCESS_KEY_ID" \
      S3_SECRET_ACCESS_KEY="$TEST_S3_SECRET_ACCESS_KEY" S3_FORCE_PATH_STYLE=true \
      ALLOW_PRIVATE_ASSET_URLS=true MUSIC_POLL_INTERVAL_MS=500 WORKER_CONCURRENCY=2 \
      AUTH_MODE=development MUSEFLOW_SESSION_SECRET=museflow-verify-session-secret-change-me \
      MODELCROSS_OIDC_ISSUER=http://127.0.0.1:3000 \
      MODELCROSS_OIDC_CLIENT_ID=museflow-verify MODELCROSS_OIDC_CLIENT_SECRET=development-only \
      MODELCROSS_OIDC_REDIRECT_URI="http://127.0.0.1:${api_port}/api/auth/callback" \
      MODELCROSS_BASE_URL=http://127.0.0.1:3000 MODELCROSS_TASK_TOKEN_SECRET= \
      BILLING_LIVE_ENABLED=false AI_LIVE_ENABLED=false AI_LOCAL_LIVE_ENABLED=false \
      ALLOW_DEVELOPMENT_DIRECT_PROVIDER=false SUNO_API_KEY_FILE= \
      MV_LOCAL_LIVE_ENABLED=false MV_API_KEY_FILE= MV_API_KEY= ASSET_RELAY_ENABLED=false \
      MODELCROSS_AI_RELAY_TOKEN= MODELCROSS_LYRICS_MODEL=mc-music-lyrics \
      MODELCROSS_FAST_MODEL=mc-music-fast MODELCROSS_AI_MODELS=mc-music-lyrics,mc-music-fast \
      ALLOW_DEVELOPMENT_FAKE_PROVIDER=true \
      SUNO_API_BASE_URL="http://127.0.0.1:${provider_port}" SUNO_API_KEY=local-fake-key \
      SUNO_REQUEST_TIMEOUT_MS=10000 \
      "$node_bin" server/dist/index.js >"$verify_tmp/museflow.log" 2>&1 &
    platform_pid=$!
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60; do
      if curl --fail --silent "http://127.0.0.1:${api_port}/health/ready" >/dev/null; then break; fi
      if ! kill -0 "$platform_pid" 2>/dev/null || [ "$attempt" -eq 60 ]; then
        show_e2e_logs
        return 1
      fi
      sleep 1
    done

    "$node_bin" node_modules/playwright/cli.js install chromium
    if ! E2E_BASE_URL="http://127.0.0.1:${api_port}" E2E_FAKE_PROVIDER=true \
      "$node_bin" node_modules/@playwright/test/cli.js test; then
      show_e2e_logs
      return 1
    fi
  fi

  cleanup_verify_stack
  trap - EXIT HUP INT TERM
}

run_image() {
  require docker
  compose_verify config --quiet
  docker build --target runtime --tag "$image" .
}

case "$mode" in
  quality)
    run_quality
    ;;
  image)
    run_image
    ;;
  all)
    run_quality
    run_image
    ;;
  *)
    echo "usage: $0 [quality|image|all]" >&2
    exit 64
    ;;
esac

echo "MuseFlow delivery verification completed ($mode)."
