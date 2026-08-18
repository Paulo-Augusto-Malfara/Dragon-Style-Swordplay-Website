<script lang="ts">
  /**
   * Abertura de torneio. Só o que precisa ser decidido antes de existir
   * inscrito: nome, data, tipo, tamanho de equipe e formato.
   *
   * O melhor de N por fase NÃO está aqui de propósito. Ele só é usado na hora
   * de gerar a chave, e nessa hora o organizador já está olhando a lista de
   * inscritos, que é o que faz decidir entre melhor de 3 e melhor de 5. Pedir
   * aqui seria pedir cedo demais, e ainda custaria três colunas no banco para
   * guardar uma resposta até a geração.
   */
  import { supabase } from "../../lib/supabase-browser";

  // Data local montada componente a componente, e não toISOString(), que
  // converte pra UTC e pula um dia à noite no fuso do Brasil. Mesmo cuidado do
  // AbrirTreino e do AgendaEditor.
  function hoje(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let nome = $state("");
  let data = $state(hoje());
  let tipo = $state<"aberto" | "classes">("aberto");
  let tamanhoEquipe = $state(1);
  let formato = $state<"eliminatoria" | "eliminatoria_dupla" | "suico" | "todos_contra_todos">(
    "eliminatoria",
  );
  let rodadas = $state(3);
  // Teto de classes por pessoa. 3 é o padrão combinado; 1 faz um torneio de
  // classe única, 10 faz um sem teto, já que só existem 10 classes oficiais.
  let maxClasses = $state(3);
  let abrindo = $state(false);
  let erro = $state("");

  // Torneio de classes premia o vencedor de cada classe, e isso só fecha no
  // 1x1: uma equipe de dois já misturaria duas classes. O banco recusa de
  // qualquer jeito, aqui é só pra não oferecer o que vai ser negado.
  const soUmContraUm = $derived(tipo === "classes");

  async function abrir() {
    if (nome.trim() === "") {
      erro = "O torneio precisa de um nome.";
      return;
    }
    abrindo = true;
    erro = "";
    const { data: id, error } = await supabase.rpc("abrir_torneio", {
      p_nome: nome,
      p_data: data,
      p_tipo: tipo,
      p_tamanho_equipe: soUmContraUm ? 1 : tamanhoEquipe,
      p_formato: formato,
      p_rodadas: formato === "suico" ? rodadas : null,
      p_max_classes: soUmContraUm ? maxClasses : 3,
    });
    abrindo = false;
    if (error) {
      erro = error.message;
      return;
    }
    window.location.href = `/admin/torneios/${id}`;
  }
</script>

<div class="admin-form">
  <p class="admin-form-titulo">Abrir torneio</p>
  <p class="admin-form-nota">
    O torneio abre em inscrição. Você monta a lista de participantes, gera as chaves e só então
    começam as partidas.
  </p>

  <div class="campos">
    <label>
      Nome do torneio
      <input type="text" bind:value={nome} placeholder="Copa de Inverno" />
    </label>

    <label>
      Data
      <input type="date" bind:value={data} />
    </label>

    <label>
      Tipo
      <select bind:value={tipo}>
        <option value="aberto">Aberto, todo mundo na mesma chave</option>
        <option value="classes">Por classe, um campeão em cada</option>
      </select>
      <small>
        {soUmContraUm
          ? "Uma chave por classe, sempre 1x1, para premiar o vencedor de cada uma."
          : "Chave única, com o tamanho de equipe escolhido abaixo."}
      </small>
    </label>

    {#if soUmContraUm}
      <label>
        Classes por pessoa
        <input type="number" min="1" max="10" bind:value={maxClasses} />
        <small>
          {maxClasses === 1
            ? "Cada pessoa disputa uma classe só."
            : maxClasses >= 10
              ? "Sem teto na prática: são 10 classes oficiais."
              : `Cada pessoa pode entrar em até ${maxClasses} chaves diferentes.`}
        </small>
      </label>
    {/if}

    {#if !soUmContraUm}
      <label>
        Tamanho da equipe
        <select bind:value={tamanhoEquipe}>
          <option value={1}>1x1, individual</option>
          <option value={2}>2x2, duplas</option>
          <option value={3}>3x3, trios</option>
        </select>
      </label>
    {/if}

    <label>
      Formato
      <select bind:value={formato}>
        <option value="eliminatoria">Eliminatória simples, perdeu saiu</option>
        <option value="eliminatoria_dupla">Eliminatória dupla, com repescagem</option>
        <option value="suico">Suíço, todos jogam todas as rodadas</option>
        <option value="todos_contra_todos">Todos contra todos</option>
      </select>
      <small>
        {formato === "eliminatoria"
          ? "A chave inteira nasce de uma vez. Quem sobrar de bye passa sem jogar."
          : formato === "eliminatoria_dupla"
            ? "Quem perde cai na repescagem em vez de sair, e só é eliminado na segunda derrota. Dá quase o dobro de partidas."
            : formato === "suico"
              ? "Rodada a rodada, pareado por pontuação e sem repetir adversário. Termina em classificação, não em final."
              : "Cada equipe enfrenta todas as outras uma vez. Bom para torneio pequeno."}
      </small>
    </label>

    {#if formato === "suico"}
      <label>
        Número de rodadas
        <input type="number" min="1" max="12" bind:value={rodadas} />
        <small>O suíço termina por rodadas, não por final. Costuma ser 3 a 5.</small>
      </label>
    {/if}
  </div>

  <div class="form-acoes">
    <button type="button" class="btn btn-primary" onclick={abrir} disabled={abrindo}>
      {abrindo ? "Abrindo..." : "Abrir torneio"}
    </button>
  </div>

  {#if erro}
    <p class="admin-error" role="alert">{erro}</p>
  {/if}
</div>
