/* What this app still needs from outside a component: reading a file from the
   person's own disk. Everything else that stood here — a labelled control, a
   switch beside its words, the builders on top of @lautstark/werkzeuge/dom —
   is markup in a component now. */

/* A detached <input type="file">, clicked. The symbol folder, a ZIP and a
   portrait are three unrelated things that all need the same two lines, and the
   file input is a platform part, not a fact about people. */
export function pickFile(accept: string, folder: boolean, take: (files: FileList) => void): void {
  const chooser = document.createElement("input");
  chooser.type = "file";
  if (folder) chooser.setAttribute("webkitdirectory", "");
  else chooser.accept = accept;
  chooser.addEventListener("change", () => { if (chooser.files?.length) take(chooser.files); });
  chooser.click();
}
