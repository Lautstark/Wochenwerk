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
  import { untrack } from "svelte";
  import type { Card } from "../model.js";
  import { putCard } from "../db.js";
  import { prepare } from "../speech.js";
  import { pictures } from "../symbols.js";
  import Picture from "../pieces/Picture.svelte";
  import PictureChooser from "../pieces/PictureChooser.svelte";
  import SpeechField from "../pieces/SpeechField.svelte";

  /* Escape in the search folds the chooser away and nothing else — the
     chooser wires `onescape` to its own close. That is the one thing Escape can
     do here that loses nothing: closing the card editor would discard an
     unsaved card and, one sheet out, an unsaved appointment with it.
     conventions.md §6.4 puts that decision on the caller. */
  let { card, done }: { card: Card; done: (id: string | null) => void } = $props();
  /* A copy taken once, on purpose: the editor works on a draft, Abbrechen is
     throwing it away, and a card changing underneath while it is open is not
     something it should follow. */
  const draft: Card = $state(structuredClone(untrack(() => $state.snapshot(card))));
  let name = $state(draft.name);
  let nfc = $state(draft.nfc ?? "");
  let speech = $state(draft.speech ?? "");
  let field: SpeechField;
  /* The chooser stands open until the card has its picture, and folds away
     behind it after: a second pick is a press on the picture. */
  let choosing = $state(untrack(() => !card.symbol));
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

<div class="editor"><div class="editor__head"><b class="editor__name">{heading}</b><span class="spacer"></span><button class="btn quiet sm" type="button" onclick={() => done(null)}>Abbrechen</button><button class="btn primary sm" type="button" disabled={!draft.symbol} onclick={() => void store()}>Fertig</button></div><div class="stack"><label class="field-row"><span class="lbl">Name</span><input bind:this={nameField} class="field" type="text" placeholder="z. B. Spielplatz" autocomplete="off" bind:value={name} /></label><label class="field-row"><span class="lbl">Ansage</span><SpeechField bind:this={field} bind:value={speech} instead={() => name.trim() || draft.name} shape={() => ({ card: true })} list={false} /></label><label class="field-row"><span class="lbl">NFC-Nummern</span><input class="field" type="text" placeholder="04A1B2C3, 04B2C3D4" autocomplete="off" bind:value={nfc} /></label><span class="lbl">Bild</span><div class="slot">{#if draft.symbol}<button class="slot__filled" type="button" aria-expanded={choosing} onclick={() => { choosing = !choosing; }}><Picture symbol={draft.symbol} name={draft.symbol.label} {known} /><span class="small">{draft.symbol.label}</span></button>{:else}<p class="empty">Such unten ein Bild aus.</p>{/if}</div>{#if choosing || !draft.symbol}<PictureChooser seed={name.trim()} onpick={ref => { draft.symbol = ref; if (!name.trim()) name = ref.label; }} onclose={() => { choosing = false; }} />{/if}</div></div>
