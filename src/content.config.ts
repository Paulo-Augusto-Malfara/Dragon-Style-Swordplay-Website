import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const navLink = z.object({ href: z.string(), label: z.string() });

const classes = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/classes" }),
  // ponytail: image left as a public/ path string for now, astro:assets optimization
  // is one uniform sweep in the perf-baseline task, not piecemeal per collection
  schema: z.object({
    title: z.string(),
    image: z.string(),
    imageAlt: z.string(),
    prev: navLink,
    next: navLink,
  }),
});

const arma = z.object({
  id: z.string().optional(),
  nome: z.string(),
  img: z.string(),
  imgAlt: z.string(),
  comprimento: z.string(),
  empunhadaCom: z.string(),
  classes: z.string(),
  construcao: z.array(z.string()),
  descricao: z.array(z.string()),
});

const equipamentos = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/equipamentos" }),
  schema: z.object({
    title: z.string(),
    showGlossario: z.boolean().default(true),
    prev: navLink,
    next: navLink,
    armas: z.array(arma).default([]),
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

export const collections = { classes, equipamentos, regulamentos, sobreNos, progressaoInfo };
