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

  // Classe, equipamento e modalidade são todos um #hash dentro do catálogo, e
  // não uma rota: o BaseLayout abre a janela daquele item ao ver o hash. Assim
  // a busca entrega o card aberto em vez de largar a pessoa na lista, que era o
  // ponto de ter busca num manual que se consulta em pé, no meio do treino.
  const classes = await getCollection("classes");
  for (const c of classes) {
    itens.push({
      label: c.data.title,
      grupo: "Classe",
      href: `/resumo-das-classes#${c.id}`,
    });
  }

  const categorias = await getCollection("equipamentos");
  for (const cat of categorias) {
    // `oculto` não é desenhado no catálogo, então não tem janela pra abrir: o
    // resultado levaria a um hash que não casa com nada.
    for (const item of cat.data.itens.filter((i) => !i.oculto)) {
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
