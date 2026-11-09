// Save-state labels and the allowed-tools parser for `SkillEditor.tsx`.

export type SaveState = "idle" | "saving" | "saved" | "error";

export const SAVE_LABEL = {
	idle: "",
	saving: "Saving…",
	saved: "Saved",
	error: "Save failed",
} satisfies Record<SaveState, string>;

/** Split a comma/newline-separated tools string into a clean list. */
export function parseTools(text: string): string[] {
	return text
		.split(/[\n,]/)
		.map((t) => t.trim())
		.filter((t) => t.length > 0);
}
