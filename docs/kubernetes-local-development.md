# Kubernetes Local Development

This document covers the fastest way to validate the console against a plain Kubernetes cluster.

## Standard Environment

Use [`kind`](https://kind.sigs.k8s.io/) as the default local cluster.

Required tools:

- `kind`
- `kubectl`
- `jq`
- `node`
- `go`

## Quick Start

From the repository root:

```bash
bash contrib/kind-bridge.sh smoke-test
```

This command will:

1. Create a `kind` cluster named `console` if it does not already exist
2. Grant `kube-system:default` the `cluster-admin` role for local testing
3. Build the frontend and backend assets needed by `bridge`
4. Start `bridge` against the `kind` cluster
5. Verify `/` and `/api/kubernetes/api/v1/namespaces`

## Common Commands

Create the cluster and RBAC only:

```bash
bash contrib/kind-bridge.sh up
```

Build frontend and backend assets:

```bash
bash contrib/kind-bridge.sh build
```

Run `bridge` and keep it in the foreground:

```bash
bash contrib/kind-bridge.sh run
```

If `127.0.0.1:9000` is already in use, choose a different port:

```bash
BRIDGE_PORT=9001 bash contrib/kind-bridge.sh smoke-test
```

Open the UI:

```bash
firefox http://127.0.0.1:9000/
```

## Context Selection

`contrib/environment.sh` now respects `BRIDGE_K8S_CONTEXT`.

Example:

```bash
export BRIDGE_K8S_CONTEXT=kind-console
source ./contrib/environment.sh
./bin/bridge --public-dir=./frontend/public/dist
```

This is useful when your current `kubectl` context is not the cluster you want to test.
