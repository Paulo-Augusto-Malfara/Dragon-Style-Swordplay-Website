# Auditoria da fMarcoZero — Lista de Presença × Banco

Data: 14/08/2026
Fontes: `[Lista de Presença].xlsx` (67 abas), `ID RAIZ.xlsx`, tabela `fMarcoZero` do projeto `gkfgoevpbqydcirtinkw`.

---

## Resposta curta

**Os IDs não se misturaram.** A importação do Gemini foi fiel: ela copiou
corretamente os números que estavam na planilha.

**O erro está na planilha, e é anterior à importação.** Existe um bug de
fórmula na Lista de Presença que carimbou `Cavaleiro = 8` em 24 membros que
nunca treinaram de Cavaleiro. O banco herdou esse número porque ele estava
lá, correto, na origem.

Os dois casos que você citou de cabeça estão os dois confirmados:

- **Luke** ficou com Cavaleiro 0 de julho/2022 até março/2025. Na aba
  `09032025`, com ele **ausente**, o número pulou de 0 para 8 sozinho.
- **Gabriel Barreto** treinou 1 vez (13/04/2025, Básico). Na aba `03082025`,
  **ausente**, ganhou Cavaleiro 8 e Básico 4 de uma vez. Os 8 treinos viram
  nível 2, o Básico 4 vira nível 1, e é daí que sai o nível 3 dele.

---

## Como a validação foi feita

Três verificações independentes:

1. **ID × nome** — cruzei os 190 membros do banco com a `ID RAIZ`.
2. **Planilha final × banco** — comparei os acumulados da aba `Aux Espelho`
   (o espelho da aba mais recente, `GEEKARR 2025 - DIA 1`) com a `fMarcoZero`.
3. **Recontagem do zero** — reconstruí os acumulados somando o histórico
   inicial (aba `10072022`, que carrega os treinos 1 a 11) mais cada presença
   marcada nas 51 abas de treino reais, e comparei com o acumulado final.

A fórmula usada nos cálculos, confirmada contra a própria planilha (194 linhas,
zero exceções): **nível da classe = treinos ÷ 4 (arredondado pra baixo)**;
**nível geral = soma dos níveis das classes + PH ÷ 40**.

---

## 1. Os IDs estão íntegros

| Resultado | Qtd |
|---|---|
| ID e nome batem exatamente entre banco e ID RAIZ | 159 |
| Divergência real de nome | 1 |
| Membros criados depois da ID RAIZ (IDs 163+) | 27 |
| IDs vagos na ID RAIZ, ocupados por `Oculto`/`Oculto2` no banco | 2 (5 e 56) |

A única divergência de nome:

- **ID 53** — banco: `Vinicius Rayzul` / ID RAIZ: `Vinicius Rayzu`. Falta o "l"
  na planilha, é digitação. Os acumulados batem 100%, é a mesma pessoa.

As trocas de nome que o app já fez estão todas rastreadas e conferem com o
`nome_anterior`: Cadu (era `Carlos Eduardo (Cadu)`), Glola (era
`Dephyr (Glola)`), Wanderson (Arroz), Melissa e Fabiana (Ind. John Wick),
Ricardo Sarausa (era `Guilherme Sarausa`), Pedro (Runner).

**Conclusão: não houve embaralhamento de ID. A hipótese pode ser descartada.**

---

## 2. A importação foi fiel à planilha

Dos 166 membros comparáveis:

| Situação | Qtd |
|---|---|
| Bate 100% (todas as classes, todos os treinos, PH) | 137 |
| Difere só no Básico | 17 |
| Perdido na importação | 1 |
| Criado depois da planilha | 4 |
| Erro real de importação | 2 |

### Os 2 erros reais de importação

**ID 19 — Moon.** Planilha: Cavaleiro 8, Lanceiro 4, Básico 3. Banco:
Lanceiro 16, Básico 4. O Lanceiro 16 não existe em lugar nenhum da planilha —
o histórico completo dele é 4 presenças de Lanceiro (04/09/2022, 16/06/2024,
04/05/2025, 03/08/2025) e 1 de Básico. O 16 foi inventado na importação.
Coincidentemente isso apagou o Cavaleiro 8 fantasma dele.

**ID 121 — Arthur Romero.** Tem acumulado na planilha (Cavaleiro 1,
Espadachim 2, Básico 4, PH 1) e **nenhuma linha na `fMarcoZero`**. O marco
zero dele se perdeu inteiro. Hoje aparece com 1 treino só.

### Os 17 casos de Básico

A importação gravou `Básico = 4` em 17 membros onde a planilha final dizia
outro número (1, 2, 3 ou 5). Vale no máximo 1 nível de diferença por pessoa.

Em boa parte deles o banco está mais certo que a planilha: o `-2` que aparece
no Básico da planilha é um remendo manual do próprio bug do Cavaleiro (o
fantasma carimba Básico 4 junto, e numa aba seguinte alguém tira 2). Casos
onde a recontagem discorda do banco e vale conferir: Marcos Antônio (ID 72,
banco 4 / real 0), Jonjon (ID 96, banco 4 / real 0 nessa classe),
Pedro Luiz (ID 52, banco 4 / real 0), Miguel (ID 87, banco 4 / real 1),
José Affini (ID 111, banco 4 / real 1).

### Os 4 criados depois

IDs 164 (João Vitor de Paula), 165 (Joaquim), 166 (Beny) e 170 (José Zanato)
têm linha de marco zero mas não existem na planilha. São membros novos —
provavelmente presenças lançadas como marco zero em vez de `fPresencas`.
Não é erro de valor, só de lugar.

---

## 3. O bug: o Cavaleiro fantasma

### O padrão

A cada aba nova da planilha, **exatamente um membro** ganha `Cavaleiro = 8`
sem estar presente, geralmente com `Básico = 4` junto. O próximo membro a ser
atingido é sempre o de cima na lista de inativos, em ordem alfabética
decrescente. É uma faixa de fórmula ancorada no rodapé que não acompanhou o
crescimento da lista de membros: a cada aba criada, mais uma linha acima cai
dentro do intervalo errado e herda o mesmo lixo.

A marcha é visível: Xisto → Vitor Macho → Taurus → Moon → Nando → Mike →
Marquinho → Marcão → **Luke** → Leandro → Hyan → Hieraco → Helena → Heitor →
Guilherme Cerdan → Giovana → Gabriel Olian → **Gabriel Barreto** → Flavio →
Fernando.

### Os 24 atingidos

`Cav hoje` é o que o site mostra. `Cav real` é o histórico inicial mais toda
presença de Cavaleiro efetivamente marcada nas 51 abas de treino.

| ID | Nome | Aba onde apareceu | Cav hoje | Cav real | Nível hoje | Nível certo | Posição hoje | Posição certa |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 17 | Luke | 09032025 | 8 | 0 | 10 | 8 | 9 | 11 |
| 1 | Leandro | 15032025 | 8 | 0 | 8 | 6 | 11 | 16 |
| 15 | Hieraco | 04052025 | 8 | 2 | 6 | 4 | 18 | 25 |
| 54 | Marquinho "Rato" (Votu) | 09022025 | 8 | 0 | 4 | 2 | 28 | 36 |
| 29 | Pedro Bortuluzi | InputManual2 | 8 | 0 | 3 | 1 | 34 | 47 |
| 33 | Nando | 08122024 | 8 | 0 | 3 | 1 | 35 | 48 |
| 35 | Guilherme Cerdan | 20042025 | 8 | 0 | 3 | 1 | 36 | 49 |
| 38 | Xisto | 12082023 | 8 | 0 | 3 | 1 | 37 | 51 |
| 39 | Mike (Votu) | 12012025 | 8 | 1 | 3 | 1 | 38 | 52 |
| 41 | Fernando (Votu) | 1º Torneio de Inverno | 8 | 0 | 3 | 1 | 39 | 53 |
| 43 | Marcão "pet" (Votu) | 23022025 | 8 | 0 | 3 | 1 | 40 | 54 |
| 44 | Guilherme (Amigo Sandro) | PHS TABARDOS 2025 | 8 | 0 | 3 | 1 | 41 | 55 |
| 47 | Helena (amiga da Ana Júlia) | 27042025 | 8 | 0 | 3 | 1 | 42 | 56 |
| 55 | Vitor Macho | 12082023b | 8 | 0 | 3 | 1 | 43 | 58 |
| 56 | Oculto2 | 01092024 | 8 | 0 | 3 | 1 | 44 | 59 |
| 60 | Giovana (Glola) | 22062025 | 8 | 0 | 3 | 1 | 45 | 60 |
| 65 | Hyan | 30032025 | 8 | 0 | 3 | 1 | 46 | 63 |
| 66 | Taurus | 07042024 | 8 | 0 | 3 | 1 | 47 | 64 |
| 68 | Heitor | 18052025 | 8 | 0 | 3 | 1 | 48 | 66 |
| 106 | Gabriel Barreto | 03082025 | 8 | 0 | 3 | 1 | 50 | 73 |
| 112 | Gabriel Olian | 06072025 | 8 | 0 | 3 | 1 | 51 | 76 |
| 137 | Flavio Bosqueti | 17082025 | 8 | 0 | 3 | 1 | 52 | 79 |
| 64 | Rafael Castelo | 06082023 | 5 | 1 | 2 | 1 | 57 | 62 |
| 148 | Gabriel (Amigo Letícia) | FORJA - 26072025 | 0 | 0 | 1 | 1 | — | — |

Notas:

- **Mike (Votu)** e **Hieraco** tinham Cavaleiro real (1 e 2). O fantasma não
  somou 8, ele *sobrescreveu* o valor com 8. Por isso o delta deles é 7 e 6.
- **Gabriel (Amigo Letícia, ID 148)** foi atingido na planilha mas a
  importação não trouxe o Cavaleiro. Está certo por acidente.
- **Rafael Castelo (ID 64)** era o único caso duvidoso: mesma assinatura, mas o
  valor foi 5 e não 8, e ele estava presente como Cavaleiro naquele dia.
  **Confirmado pelo usuário como erro**, entrou na correção e voltou pra 1.
- **Pedro Bortuluzi (ID 29)** e **Guilherme (Amigo Sandro, ID 44)** foram
  atingidos em abas de input manual, não de treino. O padrão é idêntico ao
  dos outros, e o usuário mandou corrigir junto.
- **Luke (ID 17)** teve um segundo ajuste depois, sem relação com o fantasma:
  o bloco pré-sistema dele foi refeito a pedido do usuário. Ver abaixo, o
  nível final dele é 9 e não 8.

### Efeito no ranking

Corrigindo só esses 24 mais o Moon e o Arthur Romero, **121 dos 185 membros
mudam de posição** no ranking geral. Não porque 121 estejam errados, e sim
porque tirar 24 pessoas infladas de cima da tabela empurra todo mundo abaixo
delas pra cima.

---

## O que foi corrigido em 14/08/2026

Quatro migrações aplicadas: `corrige_cavaleiro_fantasma_marco_zero`,
`restaura_marco_zero_arthur_romero`, `ajusta_pre_sistema_luke` e
`bonus_veterano_milokos_lanceiro`.

### Feito

**Os 23 Cavaleiros fantasma.** Rafael Castelo entrou na lista: o usuário
confirmou que o 5 dele também está errado, voltou pra 1. Os que tinham
Cavaleiro real ficaram com o número certo (Hieraco 2, Mike 1, Rafael 1); os
outros 20 perderam a linha.

Antes de rodar, foi verificado que **nenhum dos 23 tem presença de Cavaleiro em
`fPresencas`**, então zerar o marco zero não conflita com nada lançado pelo app.

O Leandro guardava os 62 PH dele justamente na linha do Cavaleiro. O PH foi
movido pro Guerreiro antes do delete, senão ele perderia 1 nível calado. O
total de PH da tabela não se mexeu: 1809 antes, 1809 depois.

| | Antes | Depois |
|---|---:|---:|
| Linhas na `fMarcoZero` | 312 | 295 |
| Linhas de Cavaleiro | 37 | 17 |
| Treinos de Cavaleiro | 266 | 89 |
| PH total | 1809 | 1810 |

Níveis: Luke 10 → 8, Leandro 8 → 6, Hieraco 6 → 4, Marquinho "Rato" 4 → 2,
Gabriel Barreto 3 → 1, Rafael Castelo 2 → 1. (O Luke subiu depois pra 9 por
causa do ajuste de pré-sistema, mais abaixo.)

**Arthur Romero.** Marco zero recriado com Cavaleiro 1 (+ 1 PH), Espadachim 2 e
Básico 4. A presença dele de 11/01/2026 estava lançada como Básico só porque o
site achava que ele tinha 0 Básico — com os 4 restaurados ele já era veterano na
data, então a presença virou Cavaleiro. Ficou Cav 2, Esp 2, Básico 4, nível 1.

A troca de classe foi feita em SQL direto: a RPC `atualizar_presenca_treino()`
exige treino `aberto` e o treino 74 está `finalizado`. Reabrir um treino fechado
só por isso sairia mais caro que a correção. O `ph_ganho_treino` era 0, sem
torso e sem faixa, então a troca não mexeu em PH.

**Luke: o bloco pré-sistema.** Ajuste separado, pedido do usuário, sem relação
com o fantasma. A carga da aba `10072022` (os treinos 1 a 11, que nunca viraram
linha em `fTreinos`) registrava Arqueiro 1, Viking 5, Básico 4. O correto é
Arqueiro 5, Guerreiro 5, Básico 4.

O detalhe que quase estragou a conta: **o marco zero do Luke não é só o
pré-sistema.** Ele carrega também 10 presenças reais da era da planilha, 8 de
Arqueiro e 2 de Hoplita entre março e agosto de 2025, que também nunca viraram
treino em `fTreinos`. Por isso o Arqueiro do marco zero era 9, e não 1. Trocar
a linha inteira pelos números novos apagaria essas 10 presenças e derrubaria o
Luke pro nível 7. Só o bloco pré-sistema foi trocado.

| | Antes | Depois |
|---|---|---|
| Marco zero | Arqueiro 9, Hoplita 2, Viking 5, Básico 4 | Arqueiro 13, Guerreiro 5, Hoplita 2, Básico 4 |
| No site | Arq 22, Cav 8, Hopl 3, Vik 5, Bás 4 | Arq 26, Guer 5, Hopl 3, Bás 4 |
| Nível | 8 | **9** |

O Arqueiro 13 é 5 do pré-sistema mais as 8 presenças de 2025. O Viking saiu de
vez porque ele não tem nenhuma presença de Viking em `fPresencas`. Os 33 PH
ficaram na linha do Arqueiro, que permaneceu.

**Milokos: bônus de veterano.** Não é correção de erro, é concessão do usuário.
O pré-sistema dele (aba `10072022`) tinha só Básico 4, sem nenhuma classe
avançada, o que foi conferido antes: ele fechou os 4 Básicos em 2022 e só voltou
a treinar classe avançada em junho de 2024. Por ser veterano antigo, ganhou 2
níveis de bônus, que na moeda da tabela são 8 treinos, colocados em Lanceiro.

Somado por cima, não substituindo: os 2 de Lanceiro que ele já tinha no marco
zero são presenças reais de 30/06/2024 e 14/07/2024. Ficou 2 + 8 = 10, e o nível
foi de 7 pra 9.

Conferido depois de tudo: 295 linhas, PH total 1810, 0 linha zerada, 0 negativa,
0 duplicata de (membro, classe), e **ninguém no grupo passa do teto de 4
Básicos**. `get_advisors(security)` sem item novo em relação à linha de base
conhecida.

Uma armadilha de leitura, pra quem for auditar PH: o `ph_total` da
`v_ranking_nivel_geral` soma três fontes, `fMarcoZero` + `fPresencas` + `fPH`.
O Luke, por exemplo, tem 33 + 14 + 30 = 77, não os 47 das duas primeiras.

### Deliberadamente não feito

**Moon (ID 19).** O Lanceiro 16 foi input manual do próprio usuário, ele
completou os níveis pra fechar 18 treinos de Lanceiro. É intencional, fica.
Se aparecer numa auditoria futura, não é bug.

**Os casos de Básico.** Investigados a fundo e **deixados como estão de
propósito**. Ver a seção abaixo; não reabra sem ler.

**IDs 164/165/166/170** continuam em `fMarcoZero` em vez de `fPresencas`. Não é
erro de valor, só de lugar, e não muda ranking.

---

## O Básico: por que fica como está

Investigado em 14/08/2026 a pedido do usuário. Conclusão: **o erro que ele
queria eliminar já não existe no banco, e ir além dele não é confiável.**

### O `-2` nunca chegou no banco

A planilha tem 32 quedas de Básico. Tirando uma limpeza em bloco de 31/07/2022
(13 pessoas de uma vez, padrão diferente e aparentemente intencional), sobram
**14 eventos de "4 → 2"**, todos em membro ausente, um por aba, marchando em
ordem alfabética decrescente. Mesma assinatura do Cavaleiro fantasma: o `-2` é
lixo da mesma fórmula quebrada, não correção.

Os 14 são Sandro, Neni, Moon, Mike (Votu), Oculto2, Marcos Antônio, Jonsanto,
Hyan, Hieraco, Guilherme (Amigo Sandro), Giovana, Gabriel Olian, Gabriel (Amigo
Letícia) e Flavio Bosqueti. **Todos estão com Básico 4 no banco.** A importação
capturou o estado anterior ao `-2` em todos eles, então não há o que corrigir.

### Reconstruir o Básico não é confiável

Foi tentado: marco inicial pós-limpeza, mais lançamentos manuais das abas de
input, mais presenças de Básico efetivamente marcadas, ignorando alteração em
membro ausente.

A reconstrução passou no teste do teto (só Moon e Davigol acima de 4, e o
Davigol com 5 é o erro que o próprio usuário já tinha corrigido na mão, ou seja,
ela reproduziu sozinha um erro conhecido).

Mas **reprovou no teste que importa**: aplicá-la deixaria 18 membros com classe
avançada sem os 4 Básicos que destravam a classe. João Victor ficaria com 36
treinos avançados e 2 Básicos, Ivan com 21 e 2, Isaac com 13 e 2. Impossível
pela regra do próprio grupo.

O motivo é estrutural. No Cavaleiro o fantasma tinha impressão digital: sempre
o valor 8, sempre em quem nunca teve uma única presença de Cavaleiro, uma
vítima por aba. Dava pra isolar com certeza. No Básico, **um lançamento manual
legítimo e o fantasma são a mesma coisa nos dados**: "membro ausente teve o
Básico alterado numa aba". A planilha não guarda nada que separe os dois.

Decisão: fica como está. Mexer trocaria um erro pequeno e conhecido por 18
inconsistências novas. Se alguém quiser reabrir isso, vai precisar de fonte
externa, não da planilha.

### E a planilha?

**O bug continua vivo na `[Lista de Presença].xlsx`.** A correção foi só no
banco. Se novas abas forem criadas lá, a faixa de fórmula vai continuar
carimbando `Cavaleiro = 8` no próximo membro da fila alfabética.
