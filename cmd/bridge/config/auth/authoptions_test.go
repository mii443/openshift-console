package auth

import (
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"k8s.io/client-go/rest"

	"github.com/openshift/console/cmd/bridge/config/flagvalues"
	"github.com/openshift/console/cmd/bridge/config/session"
	"github.com/openshift/console/pkg/proxy"
	"github.com/openshift/console/pkg/server"
)

func TestApplyToUsesBearerTokenFileForDisabledAuth(t *testing.T) {
	baseURL, err := url.Parse("http://127.0.0.1:9000")
	if err != nil {
		t.Fatalf("failed to parse base URL: %v", err)
	}

	k8sEndpoint, err := url.Parse("https://kubernetes.default.svc")
	if err != nil {
		t.Fatalf("failed to parse k8s endpoint: %v", err)
	}

	tokenFile := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenFile, []byte("test-token\n"), 0o600); err != nil {
		t.Fatalf("failed to write token file: %v", err)
	}

	opts := &completedOptions{
		AuthType: flagvalues.AuthTypeDisabled,
	}
	srv := &server.Server{
		BaseURL:                        baseURL,
		InternalProxiedK8SClientConfig: &rest.Config{BearerTokenFile: tokenFile},
		K8sProxyConfig:                 &proxy.Config{},
	}

	if err := opts.ApplyTo(srv, k8sEndpoint, "", &session.CompletedOptions{}); err != nil {
		t.Fatalf("ApplyTo returned error: %v", err)
	}

	if srv.Authenticator == nil {
		t.Fatal("expected static authenticator to be configured")
	}

	if !srv.Authenticator.IsStatic() {
		t.Fatal("expected disabled auth to use a static authenticator")
	}

	if got := srv.InternalProxiedK8SClientConfig.BearerToken; got != "test-token" {
		t.Fatalf("expected bearer token to be loaded from file, got %q", got)
	}

	if got := srv.InternalProxiedK8SClientConfig.BearerTokenFile; got != "" {
		t.Fatalf("expected bearer token file to be cleared after loading token, got %q", got)
	}

	if got := srv.K8sProxyConfig.BearerToken; got != "test-token" {
		t.Fatalf("expected k8s proxy bearer token to be loaded from file, got %q", got)
	}

	if !srv.AuthDisabled {
		t.Fatal("expected server authDisabled flag to be set")
	}
}
