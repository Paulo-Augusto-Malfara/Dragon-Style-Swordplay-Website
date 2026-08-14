<script lang="ts">
  interface Props {
    fotoUrl: string | null;
    nome: string;
    /**
     * Manda o recorte pra fila de aprovação. Não devolve URL de propósito: a
     * foto do perfil só muda quando um organizador aprova, então trocar a
     * imagem aqui na hora seria mentir pra pessoa que já está no ar.
     */
    savePhoto: (blob: Blob) => Promise<void>;
  }
  let { fotoUrl, nome, savePhoto }: Props = $props();

  const VIEWPORT = 220; // px, área circular de recorte mostrada na tela
  const OUTPUT_SIZE = 512; // px, resolução final exportada (nítida até em telas retina)
  const MAX_FILE_BYTES = 8 * 1024 * 1024; // limite do arquivo original, antes de otimizar
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  let phase = $state<"idle" | "cropping" | "uploading" | "error">("idle");
  let errorMessage = $state("");

  let fileInput: HTMLInputElement | undefined = $state();
  let imgEl: HTMLImageElement | null = $state(null);
  let objectUrl: string | null = null;
  let naturalW = $state(0);
  let naturalH = $state(0);
  let baseScale = $state(1);
  let zoom = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffsetX = 0;
  let dragStartOffsetY = 0;

  const scale = $derived(baseScale * zoom);
  const displayW = $derived(naturalW * scale);
  const displayH = $derived(naturalH * scale);
  const maxOffsetX = $derived(Math.max(0, (displayW - VIEWPORT) / 2));
  const maxOffsetY = $derived(Math.max(0, (displayH - VIEWPORT) / 2));

  // reclampa o arraste sempre que o zoom muda a área visível
  $effect(() => {
    void scale;
    offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, offsetX));
    offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, offsetY));
  });

  function pickFile() {
    fileInput?.click();
  }

  function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      errorMessage = "Envie uma imagem JPG, PNG ou WEBP.";
      phase = "error";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      errorMessage = "Imagem muito grande (máximo 8MB).";
      phase = "error";
      return;
    }

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      naturalW = img.naturalWidth;
      naturalH = img.naturalHeight;
      baseScale = Math.max(VIEWPORT / naturalW, VIEWPORT / naturalH);
      zoom = 1;
      offsetX = 0;
      offsetY = 0;
      imgEl = img;
      phase = "cropping";
      errorMessage = "";
    };
    img.onerror = () => {
      errorMessage = "Não foi possível ler essa imagem.";
      phase = "error";
    };
    img.src = objectUrl;
  }

  function startDrag(e: PointerEvent) {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartOffsetX = offsetX;
    dragStartOffsetY = offsetY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDrag(e: PointerEvent) {
    if (!dragging) return;
    offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, dragStartOffsetX + (e.clientX - dragStartX)));
    offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, dragStartOffsetY + (e.clientY - dragStartY)));
  }

  function endDrag() {
    dragging = false;
  }

  function cancelCrop() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    imgEl = null;
    phase = "idle";
  }

  async function confirmCrop() {
    if (!imgEl) return;
    phase = "uploading";
    errorMessage = "";
    try {
      const srcSize = VIEWPORT / scale;
      const srcX = naturalW / 2 - srcSize / 2 - offsetX / scale;
      const srcY = naturalH / 2 - srcSize / 2 - offsetY / scale;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível neste navegador.");
      ctx.save();
      ctx.beginPath();
      ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(imgEl, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.restore();

      // qualidade 0.85 costuma ficar bem abaixo de 100KB num recorte 512x512,
      // bem longe do limite de 3MB do bucket, mesmo para fotos originais pesadas
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem."))),
          "image/webp",
          0.85
        );
      });

      await savePhoto(blob);
      cancelCrop();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      phase = "error";
    }
  }
</script>

<div class="avatar-uploader">
  <button type="button" class="avatar-uploader-preview" onclick={pickFile} aria-label="Trocar foto de perfil">
    {#if fotoUrl}
      <img src={fotoUrl} alt="" />
    {:else}
      <span>{nome.charAt(0).toUpperCase()}</span>
    {/if}
    <span class="avatar-uploader-edit">editar foto</span>
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    class="avatar-uploader-input"
    onchange={onFileChange}
  />

  {#if phase === "error" && errorMessage}
    <p class="admin-error">{errorMessage}</p>
  {/if}

  {#if phase === "cropping" || phase === "uploading"}
    <div class="avatar-crop-overlay">
      <div class="avatar-crop-box">
        <p class="gold-title">Ajuste sua foto</p>
        <div
          class="avatar-crop-viewport"
          style={`width:${VIEWPORT}px;height:${VIEWPORT}px;`}
          onpointerdown={startDrag}
          onpointermove={onDrag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
        >
          {#if imgEl}
            <img
              src={imgEl.src}
              alt=""
              draggable="false"
              style={`width:${displayW}px;height:${displayH}px;transform:translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px));`}
            />
          {/if}
        </div>
        <input type="range" min="1" max="3" step="0.01" bind:value={zoom} class="avatar-crop-zoom" />
        <div class="avatar-crop-actions">
          <button type="button" class="btn btn-sm" onclick={cancelCrop} disabled={phase === "uploading"}>
            cancelar
          </button>
          <button type="button" class="btn btn-sm btn-primary" onclick={confirmCrop} disabled={phase === "uploading"}>
            {phase === "uploading" ? "enviando..." : "salvar foto"}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
