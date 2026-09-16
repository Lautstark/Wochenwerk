<script lang="ts">
  /* A card is a household object: a laminated picture with a tag on it, laid out
     when a choice is offered. It always has a symbol — the picture is the point of
     the card — so the symbol is one slot that a new pick overwrites, never
     something to empty out.

     It is a panel and not a dialog: both places a card is edited from are already
     sheets — the Wahl side of the appointment editor, and the Karten panel in the
     settings — so a dialog here was never anything but a dialog on top of a dialog.

     `done` is called with the card's id when it was saved and with null when it was
     not, so a caller that wanted a new card for something can tell the two apart
     without asking the database what happened. */
  import type { Card } from "../model.js";
  import { putCard } from "../db.js";
  import { prepare } from "../speech.js";
  import { pictures } from "../symbols.js";
  import Picture from "../pieces/Picture.svelte";
  import SpeechField from "../pieces/SpeechField.svelte";
  import SymbolSearch from "../pieces/SymbolSearch.svelte";

  let { card, done }: { card: Card; done: (id: string | null) => void } = $props();
  const draft: Card = $state(structuredClone($state.snapshot(card)));
  let name = $state(draft.name);
  let nfc = $state(draft.nfc ?? "");
  let speech = $state(draft.speech ?? "");
  let field: SpeechField;
  let search: SymbolSearch;
  let nameField: HTMLInputElement;
  /* The picture has to be resolved for the symbol this card holds: the week's
     map only knows what was already on screen, and a fresh pick is not. */
  let known = $state.raw(new Map<string, string>());
  $effect(() => {
    const symbol = $state.snapshot(draft.symbol);
    if (symbol) void pictures([symbol]).then(map => { known = map; });
  });
  let heading = $derived(name.trim() || draft.name || "Neue Karte");

  async function store() {
    draft.name = name.trim();
    if (!draft.name) return nameField.focus();
    if (!draft.symbol) return;
    draft.speech = speech.trim() || undefined;
    /* See the appointment editor: prepared while somebody is saving, not while a
       child is waiting. */
    void prepare(field.sentences());
    /* Stored in one spelling however they were pasted — the board compares the hex
       digits and nothing else, but a list somebody reads back should look like one. */
    draft.nfc = nfc.split(",").map(one => one.trim().toUpperCase()).filter(Boolean).join(", ") || undefined;
    await putCard($state.snapshot(draft));
    done(draft.id);
  }
</script>

<div class="editor"><div class="editor__head"><b class="editor__name">{heading}</b><span class="spacer"></span><button class="btn quiet sm" type="button" onclick={() => done(null)}>Abbrechen</button><button class="btn primary sm" type="button" disabled={!draft.symbol} onclick={() => void store()}>Fertig</button></div><div class="stack"><label class="field-row"><span class="lbl">Name</span><input bind:this={nameField} class="field" type="text" placeholder="z. B. Spielplatz" autocomplete="off" bind:value={name} /></label><label class="field-row"><span class="lbl">Ansage</span><SpeechField bind:this={field} bind:value={speech} instead={() => name.trim() || draft.name} shape={() => ({ card: true })} list={false} /></label><label class="field-row"><span class="lbl">NFC-Nummern</span><input class="field" type="text" placeholder="04A1B2C3, 04B2C3D4" autocomplete="off" bind:value={nfc} /></label><span class="lbl">Symbol</span><div class="slot">{#if draft.symbol}<div class="slot__filled"><Picture symbol={draft.symbol} name={draft.symbol.label} {known} /><span class="small">{draft.symbol.label}</span></div>{:else}<p class="empty">Such unten ein Symbol aus.</p>{/if}</div><SymbolSearch bind:this={search} onpick={ref => { draft.symbol = ref; if (!name.trim()) name = ref.label; search.clear(); }} /></div></div>
