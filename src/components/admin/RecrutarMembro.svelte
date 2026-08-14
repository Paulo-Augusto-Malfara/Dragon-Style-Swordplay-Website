<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import AvatarUploader from "../dashboard/AvatarUploader.svelte";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

  interface Props {
    meuIdMembro: number;
    onCreated?: (membro: { id_membro: number; nome: string }) => void;
    onCancelar?: () => void;
  }
  const { meuIdMembro, onCreated, onCancelar }: Props = $props();

  type Etapa = "nome" | "padrinho" | "revisao" | "foto" | "concluido";
  let etapa = $state<Etapa>("nome");

  // A régua de etapas: quatro telas em sequência sem nada dizendo quantas
  // faltavam. "concluido" não entra porque não é etapa, é o fim.
  const ETAPAS: { chave: Etapa; label: string }[] = [
    { chave: "nome", label: "Dados" },
    { chave: "padrinho", label: "Padrinho" },
    { chave: "revisao", label: "Revisão" },
    { chave: "foto", label: "Foto" },
  ];
  const posicaoAtual = $derived(ETAPAS.findIndex((e) => e.chave === etapa));

  let nome = $state("");
  let email = $state("");
  let nomeErro = $state("");
  let checandoNome = $state(false);

  let padrinho = $state<{ id_membro: number; nome: string } | null>(null);

  let salvando = $state(false);
  let erroSalvar = $state("");

  let idMembroCriado = $state<number | null>(null);
  let nomeCriado = $state("");
  let fotoUrl = $state<string | null>(null);
  let confirmar: ConfirmarAcao;

  async function avancarDeNome() {
    const nomeAparado = nome.trim();
    const emailAparado = email.trim();
    if (nomeAparado.length < 2) {
      nomeErro = "Digite um nome válido.";
      return;
    }
    if (!emailAparado) {
      const ok = await confirmar.pedir({
        titulo: "Cadastrar sem email?",
        texto: "Sem email o membro entra no ranking e no mural, mas não consegue fazer login pra ver o próprio perfil. Dá pra preencher depois, na edição.",
        acao: "Cadastrar sem email",
      });
      if (!ok) return;
    }
    checandoNome = true;
    nomeErro = "";
    const { count } = await supabase
      .from("dMembros")
      .select("id_membro", { count: "exact", head: true })
      .ilike("nome", nomeAparado);
    checandoNome = false;
    if ((count ?? 0) > 0) {
      nomeErro = "Já existe um membro cadastrado com esse nome.";
      return;
    }
    nome = nomeAparado;
    email = emailAparado;
    etapa = "padrinho";
  }

  function pularPadrinho() {
    padrinho = null;
    etapa = "revisao";
  }

  function escolherPadrinho(m: { id_membro: number; nome: string }) {
    padrinho = m;
    etapa = "revisao";
  }

  async function confirmarCadastro() {
    salvando = true;
    erroSalvar = "";
    const { data, error } = await supabase
      .from("dMembros")
      .insert({
        nome,
        email: email || null,
        status_ativo: true,
        auth_level: 4,
        quem_criou: meuIdMembro,
        indicado_por: padrinho?.id_membro ?? null,
      })
      .select("id_membro, nome")
      .single();
    salvando = false;
    if (error) {
      erroSalvar = error.message;
      return;
    }
    idMembroCriado = data.id_membro;
    nomeCriado = data.nome;
    etapa = "foto";
  }

  async function saveFotoMembro(blob: Blob): Promise<string> {
    const path = `membro-${idMembroCriado}/avatar.webp`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/webp" });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const finalUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: rpcError } = await supabase.rpc("set_foto_membro", {
      p_id_membro: idMembroCriado,
      nova_foto_url: finalUrl,
    });
    if (rpcError) throw rpcError;

    return finalUrl;
  }

  function concluir() {
    if (onCreated && idMembroCriado) {
      onCreated({ id_membro: idMembroCriado, nome: nomeCriado });
      return;
    }
    window.location.href = "/admin/membros";
  }
</script>

<ConfirmarAcao bind:this={confirmar} />

<div class="admin-form">
  {#if onCreated}
    <p class="admin-form-titulo">Cadastrar novo membro</p>
  {/if}

  {#if etapa !== "concluido"}
    <ol class="etapas" aria-label={`Etapa ${posicaoAtual + 1} de ${ETAPAS.length}`}>
      {#each ETAPAS as e, i}
        <li class:feita={i < posicaoAtual} class:atual={i === posicaoAtual}>{e.label}</li>
      {/each}
    </ol>
  {/if}

  {#if etapa === "nome"}
    <form onsubmit={(e) => (e.preventDefault(), avancarDeNome())}>
      <div class="campos">
        <label>
          Nome do novo membro
          <!-- svelte-ignore a11y_autofocus -->
          <input type="text" bind:value={nome} required autofocus />
        </label>
        <label>
          Email
          <input type="email" bind:value={email} />
          <small>É o que permite login. Dá pra deixar em branco e preencher depois.</small>
        </label>
      </div>
      <div class="form-acoes">
        <button type="submit" class="btn btn-primary" disabled={checandoNome}>
          {checandoNome ? "Verificando..." : "Continuar"}
        </button>
        {#if onCancelar}
          <button type="button" class="btn btn-ghost" onclick={onCancelar} disabled={checandoNome}>
            Cancelar
          </button>
        {/if}
      </div>
      {#if nomeErro}
        <p class="admin-error" role="alert">{nomeErro}</p>
      {/if}
    </form>
  {:else if etapa === "padrinho"}
    <p class="admin-form-titulo">Alguém indicou {nome}?</p>
    <p class="admin-form-nota">
      O padrinho ganha bônus de PH quando o afilhado treina. É opcional.
    </p>
    <MembroPicker placeholder="Buscar padrinho..." onSelect={escolherPadrinho} />
    <div class="form-acoes">
      <button type="button" class="btn btn-ghost" onclick={pularPadrinho}>Sem padrinho</button>
      <button type="button" class="btn btn-ghost" onclick={() => (etapa = "nome")}>Voltar</button>
    </div>
  {:else if etapa === "revisao"}
    <p class="admin-form-titulo">Confira antes de cadastrar</p>
    <dl class="revisao">
      <div>
        <dt>Nome</dt>
        <dd>{nome}</dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd>{email || "sem email, não vai conseguir entrar no site"}</dd>
      </div>
      <div>
        <dt>Padrinho</dt>
        <dd>{padrinho?.nome ?? "nenhum"}</dd>
      </div>
    </dl>
    <div class="form-acoes">
      <button type="button" class="btn btn-primary" onclick={confirmarCadastro} disabled={salvando}>
        {salvando ? "Cadastrando..." : "Cadastrar membro"}
      </button>
      <button type="button" class="btn btn-ghost" onclick={() => (etapa = "nome")} disabled={salvando}>
        Corrigir
      </button>
    </div>
    {#if erroSalvar}
      <p class="admin-error" role="alert">{erroSalvar}</p>
    {/if}
  {:else if etapa === "foto"}
    <p class="admin-ok">{nomeCriado} foi cadastrado. Falta só a foto, se quiser colocar agora.</p>
    <AvatarUploader
      {fotoUrl}
      nome={nomeCriado}
      onUploaded={(url) => {
        fotoUrl = url;
        etapa = "concluido";
      }}
      savePhoto={saveFotoMembro}
    />
    <div class="form-acoes">
      <button type="button" class="btn btn-ghost" onclick={concluir}>Concluir sem foto</button>
    </div>
  {:else}
    <p class="admin-ok">Cadastro concluído.</p>
    <div class="form-acoes">
      <button type="button" class="btn btn-primary" onclick={concluir}>
        {onCreated ? "Continuar" : "Voltar para a lista de membros"}
      </button>
    </div>
  {/if}
</div>

<style>
  /* Revisão como lista de definição, não como três parágrafos com negrito:
     rótulo e valor ficam em colunas, e o olho confere de cima a baixo. */
  .revisao {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0.9em 1em;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg-alt);
  }

  .revisao > div {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 6px 0;
  }

  .revisao > div + div {
    border-top: 1px solid var(--ds-line);
  }

  .revisao dt {
    flex: none;
    min-width: 84px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ds-text-5);
    padding-top: 2px;
  }

  .revisao dd {
    margin: 0;
    font-size: 0.95rem;
    color: var(--ds-text-1);
  }
</style>
