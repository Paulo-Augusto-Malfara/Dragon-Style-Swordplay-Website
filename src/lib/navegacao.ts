/**
 * Fonte única da estrutura de navegação (IA de 2026).
 *
 * Estava só dentro do NavMenu.astro. Saiu de lá porque o PageLayout também
 * precisa dela: o rótulo acima do título de cada página diz em que seção do
 * manual você está, e isso tem que sair da mesma lista que monta o menu, senão
 * os dois divergem na primeira vez que alguém mover uma página de grupo.
 */
export type ItemNav = { href: string; label: string };
export type GrupoNav = { label: string; items: ItemNav[] };

export const menu: GrupoNav[] = [
  {
    label: "Comece Aqui",
    items: [
      { href: "/", label: "Início" },
      { href: "/o-que-e-swordplay", label: "O que é Swordplay?" },
      { href: "/como-participar", label: "Como Participar" },
      { href: "/agenda", label: "Agenda de Treinos" },
      { href: "/quem-somos", label: "Quem Somos" },
      { href: "/historia-do-ds", label: "História do DS" },
      { href: "/galeria", label: "Galeria" },
    ],
  },
  {
    label: "Manual",
    items: [
      { href: "/organizacao-dos-treinos", label: "Regras" },
      { href: "/resumo-das-classes", label: "Classes" },
      { href: "/equipamentos", label: "Equipamentos" },
      { href: "/nivel-geral", label: "Progressão" },
      { href: "/modalidades", label: "Modalidades" },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { href: "/mural-de-membros", label: "Mural de Membros" },
      { href: "/ranking-geral", label: "Ranking Geral" },
      { href: "/ranking-por-classe", label: "Ranking por Classe" },
      { href: "/registro-de-treinos", label: "Registro de Treinos" },
      { href: "/torneios", label: "Torneios" },
      { href: "/novidades", label: "Novidades" },
    ],
  },
  {
    // O painel administrativo saiu daqui em 2026-08-13. O menu é estático e
    // igual pra todo mundo, então ele aparecia pros ~170 membros que não têm
    // acesso, e clicar só levava a uma tela de login negado. O caminho agora é
    // a ficha, que sabe quem está logado e só mostra o link pra quem é staff.
    label: "Área do Membro",
    items: [{ href: "/dashboard", label: "Meu Perfil" }],
  },
  {
    // Estas três moraram só no rodapé desde 2026-08-13, pela razão certa: são
    // institucionais e não devem disputar atenção com ranking e mural. Só que
    // o rodapé deixou de existir no celular (não faz sentido num app), e sem
    // ele as três ficavam inalcançáveis por quem usa o site pelo telefone.
    // Voltam pro índice, mas no último grupo, que preserva a intenção original
    // sem custar o acesso.
    label: "Institucional",
    items: [
      { href: "/administracao", label: "Administração" },
      { href: "/doacoes", label: "Doações" },
      { href: "/mural-de-doacoes", label: "Mural de Doações" },
    ],
  },
];

/**
 * Páginas de detalhe não estão no menu (é o ponto da IA nova), mas continuam
 * pertencendo a uma seção. Sem este mapa elas ficariam sem rótulo justamente
 * nas páginas mais profundas, que é onde saber onde você está importa mais.
 */
const porGrupo: Record<string, string[]> = {
  Manual: [
    "codigo-de-conduta",
    "regras-de-combate",
    "novato-x-veterano",
    "como-funciona",
    "arqueiro",
    "barbaro",
    "cavaleiro",
    "espadachim",
    "guerreiro",
    "hoplita",
    "lanceiro",
    "sicario",
    "templario",
    "viking",
    "mentor-de-classe",
    "bonus-nivel-3",
    "vestimentas",
    "pontos-de-honra",
  ],
  Comunidade: ["mural-de-doacoes", "conquistas"],
  Institucional: ["administracao", "doacoes"],
};

// { "/arqueiro": "Manual", ... }
const detalhes: Record<string, string> = Object.fromEntries(
  Object.entries(porGrupo).flatMap(([grupo, rotas]) =>
    rotas.map((r) => [`/${r}`, grupo]),
  ),
);

/** Em que seção do manual esta rota vive. Devolve undefined quando não há. */
export function grupoDe(pathname: string): string | undefined {
  const rota = pathname.replace(/\/$/, "") || "/";
  const doMenu = (r: string) =>
    menu.find((g) => g.items.some((i) => i.href === r))?.label;
  // A terceira tentativa é pra página de detalhe abaixo de uma do menu, como
  // /torneios/12: ela herda o grupo da lista de onde se chega nela.
  return doMenu(rota) ?? detalhes[rota] ?? doMenu(`/${rota.split("/")[1]}`);
}
