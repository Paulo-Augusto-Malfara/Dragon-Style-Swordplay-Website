/**
 * Origens que podem chamar as funções pelo navegador.
 *
 * Antes era `*`. Não era explorável, porque a chamada exige o token do usuário
 * no cabeçalho e site nenhum consegue ler esse token de outra origem, mas com
 * `*` a defesa dependia inteira desse detalhe estar certo pra sempre.
 *
 * Quando a origem não casa, o cabeçalho simplesmente não vai, e o navegador
 * barra a resposta. Chamada de servidor pra servidor (curl, outra função) não
 * passa por CORS e continua funcionando: CORS protege usuário de navegador, não
 * substitui autenticação.
 *
 * Este arquivo é copiado pra dentro de cada função no deploy (como cors.ts),
 * porque cada função de borda sobe com o próprio conjunto de arquivos.
 */
const FIXAS = [
  "https://swordplayds.com.br",
  "https://www.swordplayds.com.br",
  "http://localhost:4321",
];

// Previews da Vercel deste projeto, que trocam de subdomínio a cada deploy.
const PREVIEW = /^https:\/\/dragon-style-swordplay[a-z0-9-]*\.vercel\.app$/;

export function cors(req: Request): Record<string, string> {
  const origem = req.headers.get("Origin") ?? "";
  const cabecalhos: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (FIXAS.includes(origem) || PREVIEW.test(origem)) {
    cabecalhos["Access-Control-Allow-Origin"] = origem;
  }
  return cabecalhos;
}
