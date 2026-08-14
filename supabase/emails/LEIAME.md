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
- **Imagem com endereço absoluto e do site já publicado.** Endereço relativo não
  existe dentro de um e-mail. Hoje só o
  `https://swordplayds.com.br/assets/img/logo-ds-landscape.png` está no ar; os
  outros logos da pasta `public/assets/img/` ainda não foram para produção e
  respondem 404. Sempre confira antes de trocar a imagem.
- **Sem fonte da web.** Cinzel e Rubik não carregam em e-mail, então os modelos
  usam Georgia para o título e Arial para o corpo, que é o par mais próximo
  disponível em qualquer aparelho.
- **Botão é uma tabela com `bgcolor`**, senão o Outlook come o fundo colorido.
- **Todo texto tem cor explícita.** Em modo escuro alguns clientes invertem o
  que não foi declarado, e sobra texto claro em fundo claro.
