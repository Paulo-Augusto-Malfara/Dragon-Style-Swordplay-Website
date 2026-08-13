// Arquivo externo em vez de <script inline> de propósito: a CSP em vercel.json
// exige um hash sha256 por script inline, e um arquivo servido de 'self' já passa.
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
