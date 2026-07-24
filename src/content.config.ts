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

export const collections = { classes };
