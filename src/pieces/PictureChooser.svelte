<script lang="ts">
  /**
   * The one picture chooser, after bildhaft's: a search folded open in place, the
   * household's own picture as the last tile among the hits, and the crop taking
   * the hits' place while it is open. Choosing is done — the fold closes. The
   * appointment's row and a card both open this.
   *
   * A photo is kept small and inline, the way a person's face is: these records
   * travel to the board and into a backup, and nothing about a photo needs more
   * than the 240px a tile is ever drawn at. See `photoRef`.
   */
  import SymbolSearch from "@lautstark/bildquelle/svelte/SymbolSearch";
  import Crop from "@lautstark/design/svelte/Crop";
  import { loadSquare, type Loaded } from "@lautstark/design/crop";
  import type { SymbolRef } from "../model.js";
  import { photoRef, providerInUse, refFor, sourceInUse } from "../symbols.js";

  let { onpick, onclose, seed = "" }: { onpick: (ref: SymbolRef) => void; onclose: () => void; seed?: string } = $props();

  const SIDE = 240;
  /* What the photo step is holding: a picture to cut a square from, or one that
     already is square and only wants a name. */
  let loaded = $state.raw<Loaded | null>(null);
  let square = $state.raw<File | null>(null);
  let preview = $state("");
  let name = $state("");
  let missing = $state(false);
  let crop = $state<ReturnType<typeof Crop>>();
  let upload: HTMLInputElement;
  let open = $derived(!!loaded || !!square);

  async function chose() {
    const file = upload.files?.[0];
    upload.value = "";
    if (!file) return;
    drop();
    name = "";
    loaded = await loadSquare(file, file.name);
    if (!loaded) { square = file; preview = URL.createObjectURL(file); }
  }
  function drop() {
    loaded?.close();
    if (preview) URL.revokeObjectURL(preview);
    loaded = null; square = null; preview = ""; missing = false;
  }

  const read = (blob: Blob) => new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result as string);
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
  async function shrink(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height), size = Math.min(SIDE, side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.82);
  }

  async function take() {
    const label = name.trim();
    if (!label) { missing = true; return; }
    const image = square ? await shrink(square) : await read(await crop!.cut());
    onpick(photoRef(label, image));
    drop();
    onclose();
  }
</script>

<div class="picker__fold">
  <SymbolSearch class="picker__search" provider={providerInUse()} limit={11} {seed} busy={open}
    words={{ field: "Symbol suchen", placeholder: "Symbol suchen" }}
    onescape={onclose}
    onpick={candidate => { onpick(refFor(sourceInUse(), candidate)); onclose(); }}>
    {#snippet between()}{#if open}<div class="photo-step">
      <div>{#if loaded}{#key loaded}<Crop bind:this={crop} {loaded} label="Ausschnitt" zoomLabel="Größe" output={{ type: "source", cap: SIDE }} />{/key}{:else}<img class="photo-step__square" src={preview} alt="" />{/if}</div>
      <div class="photo-step__side">
        <label class="field-row"><span class="lbl">Name</span><input class="field" type="text" autocomplete="off" placeholder="z. B. Oma" bind:value={name} oninput={() => { missing = false; }} /></label>
        <p class="notice bad" hidden={!missing}>Gib dem Bild einen Namen.</p>
        <span class="spacer"></span>
        <div class="row-of"><button class="btn quiet" type="button" onclick={drop}>Zurück</button><span class="spacer"></span><button class="btn primary" type="button" onclick={() => void take()}>Nehmen</button></div>
      </div>
    </div>{/if}{/snippet}
    {#snippet trailing()}<label class="picker__own-add">Eigenes Bild<input bind:this={upload} type="file" accept="image/*" hidden onchange={() => void chose()} /></label>{/snippet}
    {#snippet caption(candidate)}<span class="small">{candidate.label}</span>{/snippet}
  </SymbolSearch>
</div>
