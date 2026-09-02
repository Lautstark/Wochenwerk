/**
 * This app's dialogs, which are @lautstark/design/dialog's — with its two
 * dismissals named once instead of at every call site.
 *
 * The shared module deliberately carries no words: two of the four products are
 * bilingual and a string in the package would be wrong in one of them. So every
 * caller has to supply `cancelLabel` and `closeLabel`, and in this product that
 * meant „Abbrechen" written five times and „Schließen" ten — fifteen chances for
 * one of them to drift, in a product that is German throughout and has exactly
 * one answer for each.
 *
 * bildhaft has had this wrapper since the shared module existed; mitreden,
 * vorlaut-editor and this one wrote the labels out. The family review of
 * 2026-09-02 counted them.
 *
 * The two dismissals stay named apart, which is the rule the wrapper exists to
 * hold rather than a detail it happens to satisfy: the corner ✕ says what it
 * *is*, a footer button says what it *does*, and giving both the same name is
 * the defect design.md §2 recorded.
 */

import { confirmDialog as ask, openDialog as open } from "@lautstark/design/dialog";
import type { ConfirmOptions, DialogOptions, OpenDialog } from "@lautstark/design/dialog";

/** The corner ✕. Never the same word as a button in the foot. */
const CLOSE = "Schließen";
const CANCEL = "Abbrechen";

export type { OpenDialog };

export function openDialog(options: Omit<DialogOptions, "closeLabel">): OpenDialog {
  return open({ ...options, closeLabel: CLOSE });
}

/** A destructive or confirming question. Resolves true when confirmed. */
export function confirmDialog(
  options: Omit<ConfirmOptions, "cancelLabel" | "closeLabel">
    & Partial<Pick<ConfirmOptions, "cancelLabel" | "closeLabel">>,
): Promise<boolean> {
  return ask({ cancelLabel: CANCEL, closeLabel: CLOSE, ...options });
}
