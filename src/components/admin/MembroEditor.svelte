<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";
  import { CLASSE_BASICO, progressoDaClasse } from "../../lib/rank-classe";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  let nome = $state("");
  let apelido = $state("");
  // O apelido que estava salvo quando a tela abriu: só mexe na fila de
  // moderação se o admin realmente trocar o valor.
  let apelidoOriginal = "";
  let apelidoPendente = $state<string | null>(null);
  let email = $state("");
  let statusAtivo = $state(true);
  let authLevel = $state(4);
  let oculto = $state(false);
  let padrinho = $state<{ id_membro: number; nome: string } | null>(null);
  let trocandoPadrinho = $state(false);

  let porClasse = $state<any[]>([]);
  let historico = $state<any[]>([]);

  let status = $state<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  let errorMessage = $state("");
  let confirmar: ConfirmarAcao;

  async function load() {
    const { data, error } = await supabase
      .from("dMembros")
      .select("nome, apelido, apelido_pendente, email, status_ativo, auth_level, oculto, indicado_por")
      .eq("id_membro", id)
      .single();
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    nome = data.nome;
    apelido = data.apelido ?? "";
    apelidoOriginal = apelido;
    apelidoPendente = data.apelido_pendente;
    email = data.email ?? "";
    statusAtivo = data.status_ativo;
    authLevel = data.auth_level;
    oculto = data.oculto;
    if (data.indicado_por) {
      const { data: p } = await supabase.from("dMembros").select("id_membro, nome").eq("id_membro", data.indicado_por).single();
      padrinho = p;
    }

    const [classes, historia] = await Promise.all([
      supabase.from("v_ranking_por_classe").select("*").eq("id_membro", id),
      supabase.from("v_historico_presencas").select("*").eq("id_membro", id).order("data_treino", { ascending: false }),
    ]);
    porClasse = (classes.data ?? []).sort((a, b) => {
      const aBasico = a.id_classe === CLASSE_BASICO;
      const bBasico = b.id_classe === CLASSE_BASICO;
      if (aBasico !== bBasico) return aBasico ? 1 : -1;
      return b.treinos_por_classe - a.treinos_por_classe;
    });
    historico = historia.data ?? [];

    status = "idle";
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    status = "saving";
    const campos: Record<string, unknown> = {
      nome,
      email: email.trim() || null,
      status_ativo: statusAtivo,
      auth_level: authLevel,
      indicado_por: padrinho?.id_membro ?? null,
    };

    // Apelido escrito daqui já vem moderado, quem edita cadastro é o mesmo
    // nível que aprova a fila. Então o mesmo desfecho de aprovar_apelido:
    // grava, carimba a data e limpa o pedido que estava esperando. Só quando
    // muda, senão salvar o email de alguém derrubaria o pedido dele.
    if (apelido.trim() !== apelidoOriginal.trim()) {
      campos.apelido = apelido.trim() || null;
      campos.apelido_atualizado_em = new Date().toISOString();
      campos.apelido_pendente = null;
      campos.apelido_pendente_em = null;
      campos.apelido_recusa_motivo = null;
    }

    const { error } = await supabase.from("dMembros").update(campos).eq("id_membro", id);
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    status = "saved";
    window.location.href = "/admin/membros";
  }

  async function excluirMembro() {
    const ok = await confirmar.pedir({
      titulo: `Ocultar ${nome}?`,
      texto: "Some do login, do mural e dos rankings. O histórico de treinos continua no banco, mas voltar atrás exige mexer no banco direto.",
      acao: "Ocultar membro",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("dMembros").update({ oculto: true }).eq("id_membro", id);
    if (error) {
      errorMessage = error.message;
      return;
    }
    window.location.href = "/admin/membros";
  }

  const dataCurta = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

  load();
</script>

<ConfirmarAcao bind:this={confirmar} />

{#if status === "loading"}
  <div class="esqueleto esqueleto-form"></div>
{:else}
  <form class="admin-form" onsubmit={save}>
    <p class="admin-form-titulo">Cadastro</p>

    <div class="campos">
      <label>
        Nome
        <input type="text" bind:value={nome} required />
      </label>

      <label>
        Apelido
        <input type="text" bind:value={apelido} maxlength="50" placeholder="sem apelido" />
        <small>
          É por ele que o site chama a pessoa em todo lugar. Vazio, volta a mostrar o nome.
          {#if apelidoPendente}
            Tem "{apelidoPendente}" esperando aprovação: salvar um apelido aqui tira o pedido da
            fila.
          {/if}
        </small>
      </label>

      <label>
        Email
        <input type="email" bind:value={email} placeholder="sem email vinculado" />
        <small>É por ele que o membro entra no site. Sem email, não tem login.</small>
      </label>

      <label class="campo-largo">
        Nível de acesso
        <select bind:value={authLevel}>
          <option value={1}>Nível 1, admin do sistema</option>
          <option value={2}>Nível 2, organizador</option>
          <option value={3}>Nível 3, staff</option>
          <option value={4}>Nível 4, membro comum</option>
        </select>
        <small>
          Organizador abre treino, evento e agenda. Admin do sistema também edita cadastro, lança
          doação e fecha treino.
        </small>
      </label>
    </div>

    <label class="checkbox">
      <input type="checkbox" bind:checked={statusAtivo} />
      Membro ativo (aparece na seção "Membros Ativos" do mural)
    </label>

    <p class="admin-form-titulo">Padrinho</p>
    <p class="admin-form-nota">Quem indicou este membro ganha bônus de PH quando ele treina.</p>

    {#if padrinho && !trocandoPadrinho}
      <div class="membro-escolhido">
        <div class="row-corpo">
          <span class="row-titulo">{padrinho.nome}</span>
        </div>
        <div class="row-acoes">
          <button type="button" class="btn btn-sm btn-ghost" onclick={() => (trocandoPadrinho = true)}>
            Trocar
          </button>
          <button type="button" class="btn btn-sm btn-ghost" onclick={() => (padrinho = null)}>
            Remover
          </button>
        </div>
      </div>
    {:else}
      <MembroPicker
        placeholder="Buscar padrinho..."
        excludeId={Number(id)}
        onSelect={(m) => {
          padrinho = m;
          trocandoPadrinho = false;
        }}
      />
      {#if trocandoPadrinho}
        <button type="button" class="btn btn-sm btn-ghost" onclick={() => (trocandoPadrinho = false)}>
          Manter o padrinho atual
        </button>
      {/if}
    {/if}

    <div class="form-acoes">
      <button type="submit" class="btn btn-primary" disabled={status === "saving"}>
        {status === "saving" ? "Salvando..." : "Salvar alterações"}
      </button>
      <a href="/admin/membros" class="btn btn-ghost">Cancelar</a>
    </div>

    {#if status === "error"}
      <p class="admin-error" role="alert">{errorMessage}</p>
    {/if}
  </form>

  {#if oculto}
    <p class="admin-aviso">Este membro está oculto: não aparece no login, no mural nem nos rankings.</p>
  {:else}
    <div class="zona-perigo">
      <p>
        Ocultar tira {nome} do login, do mural e dos rankings, sem apagar o histórico de treinos.
      </p>
      <button type="button" class="btn btn-danger" onclick={excluirMembro}>Ocultar membro</button>
    </div>
  {/if}

  <div class="admin-secao-cab">
    <h2>Níveis por classe <span class="contagem">{porClasse.length}</span></h2>
  </div>
  {#if porClasse.length === 0}
    <p class="vazio">Nenhum treino registrado ainda.</p>
  {:else}
    <!-- Os mesmos cartões do Meu Perfil, e não a tabela de três colunas que
         estava aqui: cada linha é uma classe, não uma comparação entre elas,
         e a tabela pedia rolagem lateral no celular pra ler dois números. -->
    <ul class="classes-cartoes">
      {#each porClasse as c}
        {@const progresso = progressoDaClasse(c)}
        <li>
          <span class="classe-cartao-nome">{c.nome_classe}</span>
          <span class="classe-cartao-nivel">Nível {c.nivel_por_classe}</span>
          <span class="classe-cartao-treinos">
            {c.treinos_por_classe === 1 ? "1 treino" : `${c.treinos_por_classe} treinos`}
          </span>
          {#if progresso}
            <ol
              class="classe-cartao-casas"
              aria-label={`${progresso.andados} de ${progresso.total} treinos para o nível ${c.nivel_por_classe + 1}`}
            >
              {#each { length: progresso.total } as _, i}
                <li class:cheia={i < progresso.andados}></li>
              {/each}
            </ol>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="admin-secao-cab">
    <h2>Histórico de presença <span class="contagem">{historico.length}</span></h2>
  </div>
  {#if historico.length === 0}
    <p class="vazio">Nenhuma presença registrada ainda.</p>
  {:else}
    <div class="table-scroll">
      <table class="ranking-tabela ranking-tabela--historico tabela-cartoes">
        <thead>
          <tr>
            <th class="col-rank">Nº Treino</th>
            <th class="col-nome">Data</th>
            <th class="col-faixa">Classe</th>
            <th class="col-stat">PH Ganho</th>
          </tr>
        </thead>
        <tbody>
          {#each historico as h}
            <tr>
              <td class="col-rank"><span class="rank-badge">{h.id_treino}</span></td>
              <td class="col-nome" data-label="Data">{dataCurta(h.data_treino)}</td>
              <td class="col-faixa" data-label="Classe">{h.nome_classe}</td>
              <td class="col-stat" data-label="PH ganho"><span class="stat-pill">{h.ph_ganho_treino}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}
