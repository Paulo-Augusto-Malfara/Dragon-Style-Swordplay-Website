import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const navLink = z.object({ href: z.string(), label: z.string() });

/**
 * Uma classe do sistema.
 *
 * Os quatro campos depois da identidade existem porque o card de
 * /resumo-das-classes precisa dos mesmos dados que o topo da página individual.
 * Enquanto isso era prosa, o resumo do catálogo e a página divergiam sozinhos, e
 * quem está escolhendo classe pela primeira vez tinha que ler dois parágrafos
 * pra descobrir se a classe usa escudo.
 *
 * O corpo do .mdx continua sendo o regulamento: combinações de armas, bônus de
 * nível 3 e regras individuais, na íntegra.
 */
const classes = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/classes" }),
  // ponytail: image left as a public/ path string for now, astro:assets optimization
  // is one uniform sweep in the perf-baseline task, not piecemeal per collection
  schema: z.object({
    title: z.string(),
    image: z.string(),
    imageAlt: z.string(),
    /** Uma frase de identidade. Abre a página e aparece no card do catálogo. */
    resumo: z.string(),
    /** O armamento do jeito que se fala em voz alta no treino. */
    armamento: z.string(),
    alcance: z.enum(["Curto", "Curto e médio", "Médio", "Médio e longo", "Longo"]),
    dificuldade: z.enum(["Fácil", "Média", "Alta"]),
    /** Selo dourado no card. Hoje só o Guerreiro usa, como classe de entrada. */
    selo: z.string().optional(),
    prev: navLink,
    next: navLink,
  }),
});

/**
 * Um equipamento do catálogo.
 *
 * Os três primeiros campos depois da identidade são o que o filtro usa, e por
 * isso são campos próprios em vez de texto solto: `maos` e `classes` eram frase
 * corrida ("Classes que utilizam: Bárbaro e Viking;") e nesse formato não dava
 * pra perguntar "o que eu, Templário, posso usar?", que é a pergunta que alguém
 * faz de pé no treino.
 *
 * `specs` é lista genérica de rótulo e valor porque as categorias medem coisas
 * diferentes: arma tem pomo e área de contato, escudo tem "como medir" e
 * formatos, arco tem libragem e munição. Um schema fixo obrigaria a inventar
 * campo vazio pra metade do catálogo.
 */
const equipamento = z.object({
  id: z.string(),
  nome: z.string(),
  img: z.string(),
  /** Comprimento, ou a regra de medida no caso dos escudos. Aparece no card. */
  medida: z.string(),
  maos: z.enum(["Uma mão", "Duas mãos", "Uma ou duas mãos"]),
  classes: z.array(z.string()).default([]),
  /** Ressalva curta de acesso, tipo "Extra das demais classes no nível 3". */
  nota: z.string().optional(),
  /** Selo dourado no card. Hoje só a Clava usa, como arma inicial. */
  selo: z.string().optional(),
  specs: z.array(z.object({ rotulo: z.string(), valor: z.string() })).default([]),
  descricao: z.array(z.string()).default([]),
});

const equipamentos = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/equipamentos" }),
  // O corpo do .mdx é a regra da categoria, que aparece quando o filtro dela
  // está ligado. O frontmatter é o que vira card.
  schema: z.object({
    title: z.string(),
    /** Ordem dos chips de categoria: do mais curto pro mais longo, depois defesa. */
    ordem: z.number(),
    /** Uma frase. Aparece acima da regra da categoria. */
    resumo: z.string(),
    itens: z.array(equipamento).default([]),
  }),
});

const prosePage = z.object({
  title: z.string(),
  prev: navLink,
  next: navLink,
});

const regulamentos = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/regulamentos" }),
  schema: prosePage,
});

const sobreNos = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/sobre-nos" }),
  schema: prosePage,
});

const progressaoInfo = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/progressao-info" }),
  schema: prosePage,
});

// modalidades and novidades moved to Supabase tables in Phase 3 (see
// src/pages/modalidades.astro, src/pages/novidades.astro) -- no longer
// static collections.

export const collections = {
  classes,
  equipamentos,
  regulamentos,
  sobreNos,
  progressaoInfo,
};
