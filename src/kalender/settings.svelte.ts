import { openSheet } from "@lautstark/design/svelte/sheet";
import { CLOSE } from "../views/dialog.js";
import SettingsBody from "./SettingsBody.svelte";
import DoneFoot from "./DoneFoot.svelte";

export interface SettingsState { say: (line: string) => void }

export function openSettings(say: (line: string) => void): void {
  openSheet({ title: "Einstellungen", closeLabel: CLOSE, panels: true, state: { say } as SettingsState, body: SettingsBody, foot: DoneFoot });
}
