/* Elements, not strings.
 *
 * The calendar used to build its dialogs by writing HTML and replacing it on
 * every keystroke, which is why fields lost focus, why handlers had to be wired
 * again after each render, and why the same thing ended up stated twice. The
 * three products build nodes and update them in place; this is the same helper
 * they use, written here because it is four functions rather than a package. */

type Child = Node | string | number | null | undefined | false;
export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  style?: Record<string, string>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void }>;
}

function apply(node: HTMLElement, props: Props): void {
  if (props.class) node.setAttribute("class", props.class);
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === false || value === null || value === undefined) node.removeAttribute(name);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const [name, value] of Object.entries(props.style ?? {})) node.style.setProperty(name, value);
  for (const [name, handler] of Object.entries(props.on ?? {})) node.addEventListener(name, handler as EventListener);
}
function append(node: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, props);
  append(node, children);
  return node;
}
/** Replace a container's children in one go, without touching anything outside it. */
export function fill(container: Element, ...children: Child[]): void {
  container.replaceChildren();
  append(container, children);
}

/** A labelled control. The label says what it is; it does not explain when it applies. */
export function field(label: string, input: HTMLElement): HTMLLabelElement {
  return el("label", { class: "field-row" }, el("span", { class: "lbl", text: label }), input);
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
