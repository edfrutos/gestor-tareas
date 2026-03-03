/**
 * Service Worker registration - external script for CSP compliance.
 * Avoids 'unsafe-inline' in script-src by moving registration out of index.html.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[SW] Registered", reg.scope))
      .catch((err) => console.log("[SW] Failed", err));
  });
}
