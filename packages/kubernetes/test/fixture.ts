/**
 * Minimal kubeconfig pointing to a fake cluster
 */
export const FAKE_KUBECONFIG = {
  clusters: [{ name: "fake", server: "https://localhost:6443", skipTLSVerify: true }],
  users: [{ name: "fake", token: "fake" }],
  contexts: [{ name: "fake", cluster: "fake", user: "fake" }],
  currentContext: "fake"
};
