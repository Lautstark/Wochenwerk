<script lang="ts">
  /* The name field is the heading. A second copy of it above, which cannot be
     typed in, says the same thing twice — so the sheet keeps its accessible name
     and loses the visible one. The field then stands where that heading stood,
     beside the ✕ rather than under it: a head holding nothing but a corner ✕ was
     a whole row of the sheet spent on nothing.

     This is `Sheet`'s `head`, which **replaces** the `<h2>` rather than standing
     beside a hidden one — so the two repairs this file used to make are gone.
     It no longer hides the heading, and it no longer rewrites the dialog's
     `aria-label` on every keystroke: the name comes from the thunk
     `appointment.svelte.ts` hands the frame. Both reached past the component
     into `handle.dialog`, and both worked only until something re-rendered what
     they had written. conventions.md §6.1.

     `.title-input` is a field that does not look like one until it is asked to,
     which is the family's answer and the right one for a name standing where a
     heading stands. On a new appointment nothing has asked it yet, so it reads as
     the sheet's title and says „Name". The caret is what asks: `showModal` would
     otherwise leave focus on the ✕. */
  import { derivedName } from "../model.js";
  import { shown } from "../store.svelte.js";
  import type { Editing } from "./appointment.svelte.js";
  let { s }: { s: Editing } = $props();
  let field: HTMLInputElement;
  let placeholder = $derived(derivedName(s.draft, shown().cards, shown().people) || "Name");
  $effect(() => { if (!s.existing) field.focus(); });
</script>

<input bind:this={field} class="title-input" type="text" autocomplete="off" {placeholder} bind:value={s.title} oninput={() => { s.draft.title = s.title.trim() || undefined; }} />
