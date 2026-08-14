/**
 * Inscrição do aparelho pra receber notificação da fila de aprovação.
 *
 * A chave pública fica no código porque ela é pública mesmo: é o que o
 * navegador manda pro serviço de push pra dizer de quem ele aceita mensagem.
 * A privada, que assina, vive só como segredo da função de borda e não existe
 * neste repositório.
 */
import { supabase } from "./supabase-browser";

export const VAPID_PUBLICA =
  "BDj1ckSQ9ad5gRhJDJnCOWEt3zWwTHpnQHe9lyToEKD8ZD3d5RyIa55qq9lH-SiCZzUCO6bp_9YufTKRJtzS_NY";

/** O navegador quer a chave como bytes crus, não como texto base64url. */
function paraBytes(base64url: string): Uint8Array {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bruto = atob(base64);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

/** Chave da inscrição em base64, que é o formato que o banco guarda. */
function chaveEmBase64(inscricao: PushSubscription, nome: "p256dh" | "auth"): string {
  const bytes = inscricao.getKey(nome);
  if (!bytes) return "";
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export type EstadoPush =
  | "sem-suporte"
  | "negado"
  | "inscrito"
  | "desinscrito";

export function suportaPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function estadoAtual(): Promise<EstadoPush> {
  if (!suportaPush()) return "sem-suporte";
  if (Notification.permission === "denied") return "negado";
  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.getSubscription();
  return inscricao ? "inscrito" : "desinscrito";
}

/**
 * Pede permissão, inscreve o aparelho e guarda no banco.
 *
 * Uma linha por aparelho, não por pessoa: quem usa celular e computador
 * precisa dos dois recebendo, e o endpoint é o que identifica cada um.
 */
export async function inscrever(): Promise<EstadoPush> {
  if (!suportaPush()) return "sem-suporte";

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "negado" : "desinscrito";

  const registro = await navigator.serviceWorker.ready;
  const inscricao =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      // Sem isto o navegador aceita push sem notificação visível, e o Chrome
      // revoga a permissão de quem faz isso.
      userVisibleOnly: true,
      applicationServerKey: paraBytes(VAPID_PUBLICA),
    }));

  const { error } = await supabase.from("push_inscricoes").upsert(
    {
      endpoint: inscricao.endpoint,
      p256dh: chaveEmBase64(inscricao, "p256dh"),
      auth_secret: chaveEmBase64(inscricao, "auth"),
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);

  return "inscrito";
}

export async function desinscrever(): Promise<EstadoPush> {
  if (!suportaPush()) return "sem-suporte";
  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.getSubscription();
  if (!inscricao) return "desinscrito";

  // Apaga do banco antes de cancelar no navegador: se a ordem fosse a
  // contrária e a rede falhasse no meio, ficaria uma inscrição morta no banco
  // recebendo envio pra sempre.
  await supabase.from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
  await inscricao.unsubscribe();
  return "desinscrito";
}
