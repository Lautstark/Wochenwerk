/* This app's own controls, on top of @lautstark/werkzeuge/dom.
 *
 * `el` and `fill` used to be written out here — 94 lines, and bildhaft had the
 * same 116 arrived at separately, while `el` meant *fetch an element* in
 * mitreden and vorlaut-editor had no builder at all. The header here said it was
 * "four functions rather than a package". It was four functions in four
 * products, and one of the four names meant the opposite thing.
 *
 * They are re-exported rather than imported at each call site so that nothing
 * below or beside this file had to move: `el` is `el`, and where it comes from
 * is this file's business. What stays *here* is what only wochenwerk means — a
 * labelled control, a switch that sits beside its words, a field that is not a
 * checkbox, and the file picker.
 */

export { el, fill } from "@lautstark/werkzeuge/dom";
export type { Props } from "@lautstark/werkzeuge/dom";

import { el } from "@lautstark/werkzeuge/dom";
import type { Props } from "@lautstark/werkzeuge/dom";

/** A labelled control. The label says what it is; it does not explain when it applies. */
export function field(label: string, input: HTMLElement): HTMLLabelElement {
  return el("label", { class: "field-row" }, el("span", { class: "lbl", text: label }), input);
}
/* A box and its words on one line. `field` stacks a label above its control,
   which is right for something to type in and wrong for something to tick: it
   leaves the box adrift under a heading it belongs beside. */
export function check(label: string, box: HTMLInputElement): HTMLLabelElement {
  return el("label", { class: "check" }, box, el("span", { text: label }));
}
export function input(type: string, props: Props = {}): HTMLInputElement {
  /* A checkbox is not a field: `.field` is full width, which turns a box into a
     stretched row with its label pushed to the far side. */
  const bare = type === "checkbox" || type === "radio";
  return el("input", {
    ...props,
    class: bare ? props.class ?? "" : `field ${props.class ?? ""}`.trim(),
    attrs: { type, ...props.attrs },
  });
}
export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  return el("button", { class: `btn ${className}`.trim(), text: label, attrs: { type: "button" }, on: { click: onClick } });
}
export const spacer = () => el("span", { class: "spacer" });

/* Reading a file from the person's own disk: a detached <input type="file">,
   clicked. It lives here rather than beside the one view that happened to need it
   first — the symbol folder, a ZIP and a portrait are three unrelated things that
   all need the same two lines, and the file input is a platform part, not a fact
   about people. */
export function pickFile(accept: string, folder: boolean, take: (files: FileList) => void): void {
  const chooser = document.createElement("input");
  chooser.type = "file";
  if (folder) chooser.setAttribute("webkitdirectory", "");
  else chooser.accept = accept;
  chooser.addEventListener("change", () => { if (chooser.files?.length) take(chooser.files); });
  chooser.click();
}
