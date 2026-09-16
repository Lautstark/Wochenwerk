<script lang="ts">
  /* Everything about a person is edited here rather than in the row it lives in.
     A row that carries a date field and four buttons is what made the settings
     sheet scroll sideways.

     A panel and not a dialog, for the reason CardEditor gives: the only place
     this is reached from is the Personen panel, which is already inside a sheet. */
  import { TONES, type Person } from "../model.js";
  import { putPerson, setBirthday } from "../db.js";
  import { pickFile } from "../ui.js";
  import Face from "../pieces/Face.svelte";

  let { person, done }: { person: Person; done: (saved: boolean) => void } = $props();
  const draft: Person = $state(structuredClone($state.snapshot(person)));
  let name = $state(draft.name);
  let birthday = $state(draft.birthday ?? "");
  let nameField: HTMLInputElement;

  /* The face follows the field: it read `draft.name`, which a new person has none
     of, so typing redrew an avatar that went on saying „?" until the moment it
     was saved. */
  let called = $derived(name.trim() || draft.name || "?");
  let heading = $derived(name.trim() || draft.name || "Neue Person");
  let shownAs = $derived({ ...$state.snapshot(draft), name: called, initials: called.slice(0, 2).toUpperCase(), tone: draft.tone || TONES[0] });

  /** A photo is shrunk before it is stored: these records go in a synced folder later. */
  async function shrink(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height), size = 160;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function save() {
    const wanted = name.trim();
    if (!wanted) return nameField.focus();
    const before = draft.birthday;
    const settled: Person = { ...$state.snapshot(draft), name: wanted, initials: wanted.slice(0, 2).toUpperCase(), tone: draft.tone || TONES[0] };
    await putPerson({ ...settled, birthday: before });
    if (birthday !== (before ?? "")) await setBirthday({ ...settled, birthday: before }, birthday || undefined);
    done(true);
  }
</script>

<div class="editor"><div class="editor__head"><b class="editor__name">{heading}</b><span class="spacer"></span><button class="btn quiet sm" type="button" onclick={() => done(false)}>Abbrechen</button><button class="btn primary sm" type="button" onclick={() => void save()}>Fertig</button></div><div class="stack"><div class="portrait"><Face person={shownAs} /><div class="portrait__acts"><button class="btn sm quiet" type="button" onclick={() => pickFile("image/*", false, async files => { draft.photo = await shrink(files[0]); })}>{draft.photo ? "Foto ändern" : "Foto wählen"}</button>{#if draft.photo}<button class="btn sm quiet" type="button" onclick={() => { draft.photo = undefined; }}>Foto entfernen</button>{:else}<span></span>{/if}</div></div><label class="field-row"><span class="lbl">Name</span><input bind:this={nameField} class="field" type="text" placeholder="z. B. Oma" autocomplete="off" bind:value={name} /></label><label class="field-row"><span class="lbl">Geburtstag</span><input class="field" type="date" bind:value={birthday} /></label></div></div>
