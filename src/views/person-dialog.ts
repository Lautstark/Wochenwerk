import { openDialog } from "@lautstark/design/dialog";
import { button, el, field, fill, input, spacer } from "../ui.js";
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
export function pickFile(accept: string, folder: boolean, take: (files: FileList) => void) {
  const chooser = document.createElement("input");
  chooser.type = "file";
  if (folder) chooser.setAttribute("webkitdirectory", "");
  else chooser.accept = accept;
  chooser.addEventListener("change", () => { if (chooser.files?.length) take(chooser.files); });
  chooser.click();
}

/* Everything about a person is edited here rather than in the row it lives in.
   A row that carries a date field and four buttons is what made the settings
   sheet scroll sideways. */
export function editPerson(person: Person, after: () => void) {
  const draft: Person = structuredClone(person);
  const name = input("text", { attrs: { placeholder: "z. B. Oma", autocomplete: "off" } });
  const birthday = input("date");
  name.value = draft.name;
  birthday.value = draft.birthday ?? "";

  const portrait = el("div", { class: "portrait" });
  const sync = () => fill(portrait,
    face({ ...draft, name: draft.name || "?", initials: (draft.name || "?").slice(0, 2).toUpperCase(), tone: draft.tone || TONES[0] }),
    el("div", { class: "portrait__acts" },
      button(draft.photo ? "Foto ändern" : "Foto wählen", "sm quiet",
        () => pickFile("image/*", false, async files => { draft.photo = await shrink(files[0]); sync(); })),
      draft.photo ? button("Foto entfernen", "sm quiet", () => { draft.photo = undefined; sync(); }) : el("span")));

  const handle = openDialog({
    title: draft.name || "Neue Person", closeLabel: "Schließen",
    body: [el("div", { class: "stack" }, portrait, field("Name", name), field("Geburtstag", birthday))],
    footer: [spacer(), button("Abbrechen", "quiet", () => handle.close()), button("Sichern", "primary", () => void save())],
  });

  const save = async () => {
    const wanted = name.value.trim();
    if (!wanted) return name.focus();
    const before = draft.birthday;
    const settled: Person = { ...draft, name: wanted, initials: wanted.slice(0, 2).toUpperCase(), tone: draft.tone || TONES[0] };
    await putPerson({ ...settled, birthday: before });
    if (birthday.value !== (before ?? "")) await setBirthday({ ...settled, birthday: before }, birthday.value || undefined);
    handle.close();
    after();
  };
  name.addEventListener("input", () => sync());
  sync();
}
