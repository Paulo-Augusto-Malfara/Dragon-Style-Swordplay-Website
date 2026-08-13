// Arquivo externo em vez de <script inline> de propósito: a CSP em vercel.json
// exige um hash sha256 por script inline, e um arquivo servido de 'self' já passa.

// Em desenvolvimento o service worker não entra, e se já estiver instalado ele
// sai junto com o cache. Motivo: o sw.js serve o que está em cache antes da
// rede, então `npm run dev` passava a mostrar a versão anterior de CSS e HTML,
// com HMR e recarregamento forçado sem efeito nenhum. Custou tempo de
// diagnóstico mais de uma vez, e o sintoma engana bem: parece bug de layout, e
// é build velho na tela.
const ehDev =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname.endsWith(".local");

if ("serviceWorker" in navigator) {
  if (ehDev) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) reg.unregister();
    });
    if (window.caches) {
      caches.keys().then((nomes) => {
        for (const nome of nomes) caches.delete(nome);
      });
    }
  } else {
    addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}
