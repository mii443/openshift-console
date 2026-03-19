# Helm Install On Existing Kubernetes Clusters

This document covers the simplest way to install this fork on an existing Kubernetes cluster with Helm.

## Important Notes

- This is a modified fork for Kubernetes compatibility work
- This is not an official Red Hat or OpenShift release
- The default chart runs `bridge` with `--user-auth=disabled`
- The default chart binds the ServiceAccount to the built-in `cluster-admin` ClusterRole

The default RBAC is intentionally broad for initial Kubernetes compatibility and admin-driven testing. Tighten it before using this in a shared or production-like cluster.

## 1. Build And Push An Image

Build and push an image that contains both the backend binary and frontend assets:

```bash
docker build -f Dockerfile.k8s -t ghcr.io/your-org/console-k8s:latest .
docker push ghcr.io/your-org/console-k8s:latest
```

Use `Dockerfile.k8s` for Helm and generic Kubernetes installs. The default
`Dockerfile` uses OpenShift CI base images from `registry.ci.openshift.org`,
which may require additional registry access.

## 2. Install With Helm

Install the chart from the repository root:

```bash
helm install console ./charts/console \
  --namespace console \
  --create-namespace \
  --set image.repository=ghcr.io/your-org/console-k8s \
  --set image.tag=latest
```

Check rollout:

```bash
kubectl get pods -n console
kubectl rollout status deployment/console -n console
```

Access the UI with port-forward:

```bash
kubectl port-forward -n console svc/console 9000:9000
```

Then open:

```bash
firefox http://127.0.0.1:9000/
```

## 3. Optional Ingress

Enable ingress if your cluster already has an ingress controller:

```bash
helm upgrade --install console ./charts/console \
  --namespace console \
  --create-namespace \
  --set image.repository=ghcr.io/your-org/console-k8s \
  --set image.tag=latest \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=console.example.com
```

## 4. Upgrade And Uninstall

Upgrade:

```bash
helm upgrade console ./charts/console \
  --namespace console \
  --set image.repository=ghcr.io/your-org/console-k8s \
  --set image.tag=latest
```

Uninstall:

```bash
helm uninstall console --namespace console
```
