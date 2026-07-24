const base = "http://localhost:4321";
const urls = [
  "/", "/home",
  "/arqueiro", "/barbaro", "/bonus-nivel-3", "/cavaleiro", "/como-funciona",
  "/espadachim", "/guerreiro", "/hoplita", "/lanceiro", "/mentor-de-classe",
  "/resumo-das-classes", "/sicario", "/templario", "/viking",
  "/armas-curtas", "/armas-de-arremesso", "/armas-longas", "/armas-medias",
  "/escudos", "/introducao", "/longo-alcance", "/tabela-de-equipamentos", "/vestimentas",
  "/conquistas", "/mural-de-membros", "/nivel-geral", "/novato-x-veterano", "/pontos-de-honra",
  "/codigo-de-conduta", "/organizacao-dos-treinos", "/regras-de-combate",
  "/administracao", "/como-participar", "/doacoes", "/historia-do-ds", "/o-que-e-swordplay", "/quem-somos",
  "/modalidades", "/novidades",
];

let failed = 0;
for (const url of urls) {
  const res = await fetch(base + url);
  const status = res.status;
  if (status !== 200) {
    failed++;
    console.log(`FAIL ${status} ${url}`);
  } else {
    console.log(`OK ${status} ${url}`);
  }
}
console.log(`\n${urls.length - failed}/${urls.length} passed`);
if (failed > 0) process.exit(1);
