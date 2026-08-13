import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { menu } from "../lib/navegacao";
import { supabasePublic } from "../lib/supabase-public";

/**
 * Índice da busca global, servido como JSON e buscado uma única vez, na
 * primeira abertura da busca.
 *
 * Podia ser montado dentro do BaseLayout, mas aí toda página do site pagaria a
 * consulta de modalidades e carregaria o índice inteiro no HTML, inclusive pra
 * quem nunca abre a busca. Assim é um pedido só, cacheado pelo navegador, e o
 * HTML de todas as outras páginas não engorda.
 *
 * SSR (`prerender = false`) por causa das modalidades, que vivem no banco. O
 * resto sai das coleções de conteúdo e do menu.
 */
export const prerender = false;

type Entrada = { label: string; grupo: string; href: string };

export const GET: APIRoute = async () => {
  const itens: Entrada[] = [];

  for (const grupo of menu) {
    for (const item of grupo.items) {
      itens.push({ label: item.label, grupo: grupo.label, href: item.href });
    }
  }

  const classes = await getCollection("classes");
  for (const c of classes) {
    itens.push({ label: c.data.title, grupo: "Classe", href: `/${c.id}` });
  }

  // O equipamento é uma âncora dentro do catálogo, não uma rota própria: é lá
  // que ele fica ao lado dos concorrentes, que é o ponto do catálogo.
  const categorias = await getCollection("equipamentos");
  for (const cat of categorias) {
    for (const item of cat.data.itens) {
      itens.push({
        label: item.nome,
        grupo: "Equipamento",
        href: `/equipamentos#${item.id}`,
      });
    }
  }

  const { data: modalidades } = await supabasePublic
    .from("modalidades")
    .select("slug, title")
    .order("id");

  for (const m of modalidades ?? []) {
    itens.push({
      label: m.title,
      grupo: "Modalidade",
      href: `/modalidades#${m.slug}`,
    });
  }

  return new Response(JSON.stringify(itens), {
    headers: {
      "content-type": "application/json",
      // Cinco minutos cobre uma sessão inteira de navegação; modalidade nova
      // não é urgente o bastante pra justificar refazer a consulta a cada aba.
      "cache-control": "public, max-age=300",
    },
  });
};
