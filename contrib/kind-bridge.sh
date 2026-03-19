#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
YARN_BIN="${FRONTEND_DIR}/.yarn/releases/yarn-4.12.0.cjs"

KIND_CLUSTER_NAME="${KIND_CLUSTER_NAME:-console}"
KIND_CONTEXT="${KIND_CONTEXT:-kind-${KIND_CLUSTER_NAME}}"
KIND_RBAC_BINDING="${KIND_RBAC_BINDING:-console-kind-admin}"
BRIDGE_HOST="${BRIDGE_HOST:-127.0.0.1}"
BRIDGE_PORT="${BRIDGE_PORT:-9000}"
BRIDGE_LISTEN="${BRIDGE_LISTEN:-http://${BRIDGE_HOST}:${BRIDGE_PORT}}"
GO_BUILD_CACHE="${GO_BUILD_CACHE:-/tmp/go-build}"
GO_MOD_CACHE="${GO_MOD_CACHE:-/tmp/go-mod-cache}"
SMOKE_TEST_TIMEOUT_SECONDS="${SMOKE_TEST_TIMEOUT_SECONDS:-30}"
BRIDGE_PID=""

usage() {
    cat <<EOF
Usage: bash contrib/kind-bridge.sh <command>

Commands:
  up          Create the kind cluster and grant kube-system:default cluster-admin
  build       Build backend and frontend assets for local bridge runs
  run         Start bridge against the kind cluster
  smoke-test  Build if needed, start bridge, and verify basic UI/API responses
  all         Run up, build, and smoke-test

Environment overrides:
  KIND_CLUSTER_NAME              kind cluster name (default: console)
  KIND_CONTEXT                   kubectl context (default: kind-\$KIND_CLUSTER_NAME)
  KIND_RBAC_BINDING              clusterrolebinding name (default: console-kind-admin)
  BRIDGE_HOST                    bridge listen host (default: 127.0.0.1)
  BRIDGE_PORT                    bridge listen port (default: 9000)
  SMOKE_TEST_TIMEOUT_SECONDS     smoke test wait timeout (default: 30)
EOF
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "error: required command not found: $1" >&2
        exit 1
    fi
}

ensure_prereqs() {
    require_command kind
    require_command kubectl
    require_command jq
    require_command curl
    require_command node
    require_command go

    if [ ! -f "$YARN_BIN" ]; then
        echo "error: yarn runtime not found at $YARN_BIN" >&2
        exit 1
    fi
}

cluster_exists() {
    kind get clusters | grep -Fxq "$KIND_CLUSTER_NAME"
}

ensure_kind_cluster() {
    ensure_prereqs

    if cluster_exists; then
        echo "kind cluster ${KIND_CLUSTER_NAME} already exists"
    else
        kind create cluster --name "$KIND_CLUSTER_NAME"
    fi

    kubectl --context "$KIND_CONTEXT" cluster-info >/dev/null

    if ! kubectl --context "$KIND_CONTEXT" get clusterrolebinding "$KIND_RBAC_BINDING" >/dev/null 2>&1; then
        kubectl --context "$KIND_CONTEXT" create clusterrolebinding "$KIND_RBAC_BINDING" \
            --clusterrole=cluster-admin \
            --serviceaccount=kube-system:default
    fi
}

build_assets() {
    ensure_prereqs

    (
        cd "$FRONTEND_DIR"
        node "$YARN_BIN" generate-graphql
        node "$YARN_BIN" build-plugin-sdk
        node "$YARN_BIN" dev-once
    )

    (
        cd "$ROOT_DIR"
        GOCACHE="$GO_BUILD_CACHE" GOMODCACHE="$GO_MOD_CACHE" ./build-backend.sh
    )
}

run_bridge() {
    ensure_prereqs

    (
        cd "$ROOT_DIR"
        export BRIDGE_K8S_CONTEXT="$KIND_CONTEXT"
        export BRIDGE_LISTEN
        . ./contrib/environment.sh
        ./bin/bridge --public-dir=./frontend/public/dist
    )
}

wait_for_bridge() {
    local timeout="$1"
    local elapsed=0

    while [ "$elapsed" -lt "$timeout" ]; do
        if [ -n "$BRIDGE_PID" ] && ! kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
            return 1
        fi
        if curl -fsS "http://${BRIDGE_HOST}:${BRIDGE_PORT}/" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    return 1
}

smoke_test() {
    ensure_kind_cluster
    build_assets

    if curl -fsS "http://${BRIDGE_HOST}:${BRIDGE_PORT}/" >/dev/null 2>&1; then
        echo "error: something is already responding on http://${BRIDGE_HOST}:${BRIDGE_PORT}" >&2
        echo "stop the existing process or set BRIDGE_PORT to a different value" >&2
        exit 1
    fi

    (
        cd "$ROOT_DIR"
        export BRIDGE_K8S_CONTEXT="$KIND_CONTEXT"
        export BRIDGE_LISTEN
        . ./contrib/environment.sh
        ./bin/bridge --public-dir=./frontend/public/dist
    ) &
    BRIDGE_PID=$!

    cleanup() {
        if [ -n "$BRIDGE_PID" ] && kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
            kill "$BRIDGE_PID"
            wait "$BRIDGE_PID" || true
        fi
    }

    trap cleanup EXIT

    if ! wait_for_bridge "$SMOKE_TEST_TIMEOUT_SECONDS"; then
        echo "error: bridge did not become ready within ${SMOKE_TEST_TIMEOUT_SECONDS}s" >&2
        exit 1
    fi

    curl -fsS "http://${BRIDGE_HOST}:${BRIDGE_PORT}/" >/dev/null
    curl -fsS "http://${BRIDGE_HOST}:${BRIDGE_PORT}/api/kubernetes/api/v1/namespaces" \
        | jq -e '.kind == "NamespaceList" and (.items | length) > 0' >/dev/null

    echo "smoke test passed against ${KIND_CONTEXT}"
}

main() {
    local command="${1:-}"

    case "$command" in
        up)
            ensure_kind_cluster
            ;;
        build)
            build_assets
            ;;
        run)
            ensure_kind_cluster
            run_bridge
            ;;
        smoke-test)
            smoke_test
            ;;
        all)
            smoke_test
            ;;
        ""|-h|--help|help)
            usage
            ;;
        *)
            echo "error: unknown command: $command" >&2
            usage
            exit 1
            ;;
    esac
}

main "$@"
