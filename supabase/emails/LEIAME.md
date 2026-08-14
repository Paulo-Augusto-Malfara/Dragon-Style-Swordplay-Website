# Modelos de e-mail

Estes arquivos não são lidos por nada em tempo de execução. Eles vivem aqui
porque o conteúdo real mora no painel do Supabase, onde não tem histórico nem
revisão: se alguém apagar sem querer, é daqui que se recupera.

**Onde colar:** Authentication > Emails > Templates, no projeto
`gkfgoevpbqydcirtinkw`.

| Arquivo | Modelo no painel | Quando dispara |
| --- | --- | --- |
| `convite.html` | Invite user | Botão "Convidar" em `/admin/moderacao` |
| `codigo-de-acesso.html` | Magic Link | Toda vez que alguém pede para entrar |

Depois de colar, mande um de cada para você mesmo antes de considerar pronto.

## A variável que não pode sumir

O `codigo-de-acesso.html` **tem que conter `{{ .Token }}`**. O site pede o
código com `signInWithOtp` e valida com `verifyOtp`, então esse número é o que a
pessoa digita na tela. Um modelo sem essa variável manda um e-mail bonito e
inútil, e o login inteiro para de funcionar, para todo mundo, sem erro nenhum
aparecendo no site.

O `convite.html` usa `{{ .Email }}` e `{{ .SiteURL }}`. As duas são opcionais no
sentido de que o e-mail continua saindo sem elas, mas aí ele deixa de dizer com
qual endereço a pessoa entra.

## Por que o convite não tem o link de aceite

O modelo padrão do Supabase manda `{{ .ConfirmationURL }}` com um "Accept the
invite". Aqui ele foi tirado de propósito.

A função `convidar-membro` confirma o e-mail no ato do convite, então o link
não é necessário para entrar. E ele expira: quem abrisse o e-mail dois dias
depois clicaria num link morto e concluiria que não tem acesso, quando na
verdade tem. Um link que só atrapalha depois de vencido é pior que link nenhum.

Por isso o botão aponta para `{{ .SiteURL }}/dashboard`, que funciona hoje,
amanhã e daqui a um ano.

## Regras de e-mail que valem para qualquer mudança aqui

Cliente de e-mail não é navegador, e o Outlook do Windows desenha com o motor do
Word.

- **Layout em `<table>`**, não em flex nem grid.
- **Estilo embutido no elemento.** Folha de estilo externa e `<style>` no
  cabeçalho são descartados por parte dos clientes.
- **Nada de imagem para a marca.** Ver a seção abaixo, custou uma rodada.
- **Sem fonte da web.** Cinzel e Rubik não carregam em e-mail, então os modelos
  usam Georgia para o título e Arial para o corpo, que é o par mais próximo
  disponível em qualquer aparelho.
- **Botão é uma tabela com `bgcolor`**, senão o Outlook come o fundo colorido.
- **Todo texto tem cor explícita.** Em modo escuro alguns clientes invertem o
  que não foi declarado, e sobra texto claro em fundo claro.

## Por que o logotipo é texto e não imagem

A primeira versão trazia o `logo-ds-landscape.png` por endereço absoluto. No
preview do próprio painel do Supabase ele aparecia quebrado, e a suspeita
inicial foi formato de arquivo. **Não era.** O servidor entrega um PNG legítimo,
420x120, com `Content-Type: image/png`, confirmado pelos bytes iniciais
(`89504e47`, que é a assinatura do PNG).

O que acontece é outra coisa, e trocar de formato não resolveria: **cliente de
e-mail não busca imagem remota por padrão.** O Outlook bloqueia até a pessoa
mandar exibir, e o preview do painel do Supabase roda num iframe que bloqueia
sempre. A imagem nunca chega a ser pedida, então PNG, webp ou jpg dá no mesmo.

Por isso a marca virou texto, repetindo a composição do cabeçalho do site
("DRAGON STYLE" em serifada dourada, "SWORDPLAY E EVENTOS" abaixo). Texto
desenha em toda parte, sem bloqueio, sem clique e sem depender de o site estar
no ar.

**Se um dia alguém quiser o brasão de volta:** ele só apareceria para parte das
pessoas, e apareceria quebrado para o resto. Se for para tentar, o desenho tem
que continuar de pé sem a imagem, com o texto ao lado dela e não no lugar dela.
