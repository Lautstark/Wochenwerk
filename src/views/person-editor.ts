import { button, el, field, fill, input, pickFile, spacer } from "../ui.js";
import { TONES, type Person } from "../model.js";
import { putPerson, setBirthday } from "../db.js";
import { face } from "./pieces.js";

/** A photo is shrunk before it is stored: these records go in a synced folder later. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height), size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/* Everything about a person is edited here rather than in the row it lives in.
   A row that carries a date field and four buttons is what made the settings
   sheet scroll sideways.

   A panel and not a dialog, for the reason card-editor.ts gives: the only place
   this is reached from is the Personen panel, which is already inside a sheet. */
export function personEditor(person: Person, done: (saved: boolean) => void): HTMLElement {
  const draft: Person = structuredClone(person);
  const name = input("text", { attrs: { placeholder: "z. B. Oma", autocomplete: "off" } });
  const birthday = input("date");
  name.value = draft.name;
  birthday.value = draft.birthday ?? "";

  const portrait = el("div", { class: "portrait" });
  const heading = el("b", { class: "editor__name" });
  const node = el("div", { class: "editor" },
    el("div", { class: "editor__head" }, heading, spacer(),
      button("Abbrechen", "quiet sm", () => done(false)),
      button("Sichern", "primary sm", () => void save())),
    el("div", { class: "stack" }, portrait, field("Name", name), field("Geburtstag", birthday)));

  const sync = () => {
    /* The face follows the field, which is what the input listener below was always
       for: it read `draft.name`, which a new person has none of, so typing redrew an
       avatar that went on saying „?" until the moment it was saved. */
    const called = name.value.trim() || draft.name || "?";
    heading.textContent = name.value.trim() || draft.name || "Neue Person";
    fill(portrait,
      face({ ...draft, name: called, initials: called.slice(0, 2).toUpperCase(), tone: draft.tone || TONES[0] }),
      el("div", { class: "portrait__acts" },
        button(draft.photo ? "Foto ändern" : "Foto wählen", "sm quiet",
          () => pickFile("image/*", false, async files => { draft.photo = await shrink(files[0]); sync(); })),
        draft.photo ? button("Foto entfernen", "sm quiet", () => { draft.photo = undefined; sync(); }) : el("span")));
  };

  const save = async () => {
    const wanted = name.value.trim();
    if (!wanted) return name.focus();
    const before = draft.birthday;
    const settled: Person = { ...draft, name: wanted, initials: wanted.slice(0, 2).toUpperCase(), tone: draft.tone || TONES[0] };
    await putPerson({ ...settled, birthday: before });
    if (birthday.value !== (before ?? "")) await setBirthday({ ...settled, birthday: before }, birthday.value || undefined);
    done(true);
  };
  name.addEventListener("input", () => sync());
  sync();
  return node;
}
