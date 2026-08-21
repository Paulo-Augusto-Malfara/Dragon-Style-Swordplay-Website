import sanitizeHtml from "sanitize-html";

/**
 * O corpo da novidade é HTML escrito à mão no painel (PostEditor.svelte), e é
 * servido pra todo visitante. Sanitizar aqui é o que impede uma conta de
 * organizador comprometida, ou só descuidada, de plantar script na página.
 *
 * `class` NÃO entra na lista de atributos, e é de propósito: o texto antigo
 * usa `class="links-de-texto"` e `class="gold-title"`, e a aparência disso é
 * trabalho do CSS de `.post-corpo`, que veste qualquer link e qualquer
 * `<strong>` do corpo sem depender de o autor lembrar da classe certa.
 */
export const sanitizarPost = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
    },
  });

/**
 * Primeiras linhas em texto puro, pra chamada da lista. Sai do mesmo corpo, e
 * não de um campo de resumo, porque um campo desses só existiria pra ficar
 * desatualizado em relação ao texto.
 */
export function resumoDoPost(html: string, limite = 180) {
  const texto = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > 60 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/**
 * `published_at` é `timestamptz` guardado à meia-noite UTC, ou seja, uma DATA
 * disfarçada de instante. Formatar no fuso de São Paulo devolve o dia anterior
 * (15/09 às 00:00Z é 14/09 às 21:00 aqui), e a home mostrava justamente isso.
 * Data-sem-hora se lê em UTC.
 */
export const dataDoPost = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
