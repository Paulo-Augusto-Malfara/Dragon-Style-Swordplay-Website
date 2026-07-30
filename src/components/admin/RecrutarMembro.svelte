<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import AvatarUploader from "../dashboard/AvatarUploader.svelte";

  interface Props {
    meuIdMembro: number;
  }
  const { meuIdMembro }: Props = $props();

  type Etapa = "nome" | "padrinho" | "revisao" | "foto" | "concluido";
  let etapa = $state<Etapa>("nome");

  let nome = $state("");
  let nomeErro = $state("");
  let checandoNome = $state(false);

  let padrinho = $state<{ id_membro: number; nome: string } | null>(null);

  let salvando = $state(false);
  let erroSalvar = $state("");

  let idMembroCriado = $state<number | null>(null);
  let nomeCriado = $state("");
  let fotoUrl = $state<string | null>(null);

  async function avancarDeNome() {
    const nomeAparado = nome.trim();
    if (nomeAparado.length < 2) {
      nomeErro = "Digite um nome válido.";
      return;
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
    window.location.href = "/admin/membros";
  }
</script>

<div class="recrutar-membro">
  {#if etapa === "nome"}
    <form class="admin-form" onsubmit={(e) => (e.preventDefault(), avancarDeNome())}>
      <label>
        Nome do novo membro
        <input type="text" bind:value={nome} required autofocus />
      </label>
      <button type="submit" class="btn btn-primary" disabled={checandoNome}>
        {checandoNome ? "Verificando..." : "Continuar"}
      </button>
      {#if nomeErro}
        <p class="admin-error">{nomeErro}</p>
      {/if}
    </form>
  {:else if etapa === "padrinho"}
    <div class="admin-form">
      <p class="gold-title">Alguém indicou {nome}? (opcional)</p>
      <MembroPicker placeholder="Buscar padrinho..." onSelect={escolherPadrinho} />
      <button type="button" class="btn btn-sm" onclick={pularPadrinho}>Sem padrinho / pular</button>
      <button type="button" class="btn btn-sm" onclick={() => (etapa = "nome")}>Voltar</button>
    </div>
  {:else if etapa === "revisao"}
    <div class="admin-form">
      <p class="gold-title">Revise antes de confirmar</p>
      <p><strong>Nome:</strong> {nome}</p>
      <p><strong>Padrinho:</strong> {padrinho?.nome ?? "Nenhum"}</p>
      <button type="button" class="btn btn-primary" onclick={confirmarCadastro} disabled={salvando}>
        {salvando ? "Cadastrando..." : "Confirmar cadastro"}
      </button>
      <button type="button" class="btn btn-sm" onclick={() => (etapa = "nome")} disabled={salvando}>
        Corrigir
      </button>
      {#if erroSalvar}
        <p class="admin-error">{erroSalvar}</p>
      {/if}
    </div>
  {:else if etapa === "foto"}
    <div class="admin-form">
      <p class="gold-title">✅ {nomeCriado} foi cadastrado(a)! Quer adicionar uma foto agora?</p>
      <AvatarUploader
        {fotoUrl}
        nome={nomeCriado}
        onUploaded={(url) => {
          fotoUrl = url;
          etapa = "concluido";
        }}
        savePhoto={saveFotoMembro}
      />
      <button type="button" class="btn btn-sm" onclick={concluir}>Pular / concluir sem foto</button>
    </div>
  {:else}
    <div class="admin-form">
      <p class="gold-title">✅ Cadastro concluído!</p>
      <button type="button" class="btn btn-primary" onclick={concluir}>Voltar para a lista de membros</button>
    </div>
  {/if}
</div>
