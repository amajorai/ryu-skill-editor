// The client layer the ported page calls. It mirrors the desktop `lib/api/skills.ts`
// authoring surface the Skill Editor page used — SAME function names
// (`getSkillSource`/`createSkill`/`updateSkill`/`listSkillVersions`/…), SAME return
// types (`types.ts`) — but the call goes over the `window.ryu.skills` bridge instead
// of a direct `fetch` to the node (the sandboxed frame's CSP is `connect-src 'none'`;
// the host holds the node token + performs the privileged `/api/skills` call, reusing
// that very client).

import type { RyuBridge } from "./ryu.d.ts";
import type {
	SkillDraft,
	SkillSource,
	SkillVersionMeta,
	SkillWriteResult,
} from "./types.ts";

function ryu(): RyuBridge {
	const b = typeof window === "undefined" ? undefined : window.ryu;
	if (!b) {
		throw new Error(
			"The skills capability is not available for this app (grant skills:crud)."
		);
	}
	return b;
}

/** The edit target baked into the mount context (`/skills/:id/edit` → `{ skillId }`),
 *  or `null` in new-skill mode. The desktop page received `skillId` as a route prop,
 *  which cannot cross the sandbox — it arrives as `window.ryu.context.skillId`. */
export function contextSkillId(): string | null {
	const id =
		typeof window === "undefined" ? undefined : window.ryu?.context?.skillId;
	return typeof id === "string" && id.length > 0 ? id : null;
}

/** Fetch a skill's editable source (form fields + raw SKILL.md). */
export function getSkillSource(id: string): Promise<SkillSource> {
	return ryu().skills.getSource({ id }) as Promise<SkillSource>;
}

/** Create a new user-authored skill. Rejects (409) on a name collision. */
export function createSkill(draft: SkillDraft): Promise<SkillWriteResult> {
	return ryu().skills.create({
		name: draft.name,
		body: draft.body,
		description: draft.description ?? null,
		allowedTools: draft.allowedTools ?? [],
		alwaysOn: draft.alwaysOn ?? false,
	}) as Promise<SkillWriteResult>;
}

/** Update an existing skill's SKILL.md (autosave). Returns the source written. */
export function updateSkill(
	id: string,
	draft: SkillDraft
): Promise<SkillWriteResult> {
	return ryu().skills.update({
		id,
		name: draft.name,
		body: draft.body,
		description: draft.description ?? null,
		allowedTools: draft.allowedTools ?? [],
		alwaysOn: draft.alwaysOn ?? false,
	}) as Promise<SkillWriteResult>;
}

/** List a skill's saved versions, newest first (metadata only). */
export function listSkillVersions(id: string): Promise<SkillVersionMeta[]> {
	return ryu().skills.listVersions({ id }) as Promise<SkillVersionMeta[]>;
}

/** Fetch one version's captured raw SKILL.md source (for the diff view). */
export function getSkillVersionSource(
	id: string,
	versionId: string
): Promise<string> {
	return ryu().skills.versionSource({ id, versionId });
}

/** Snapshot the skill's current SKILL.md as a new version. */
export function snapshotSkill(id: string, label?: string): Promise<void> {
	return ryu().skills.snapshot({ id, label });
}

/** Restore a version as the current SKILL.md (undoable). */
export function restoreSkillVersion(
	id: string,
	versionId: string
): Promise<void> {
	return ryu().skills.restore({ id, versionId });
}

/** Rename the owning tab (the desktop page's `updateTabTitle`) — fire-and-forget.
 *  A BESPOKE shell verb with no slice-1 primitive equivalent (nothing renames the
 *  current owning tab), so it stays on the `skills:crud` bridge unchanged. */
export function setTabTitle(title: string): void {
	ryu().skills.setTitle({ title });
}

/** Subscribe to the host's LIVE theme tokens and apply them as inline custom
 *  properties on `<html>` (inline style beats both the app's own `:root{}` defaults
 *  and the host's mount-time `html:root{}` injection), so the companion re-themes
 *  when the user toggles light/dark WITHOUT a remount. This is a NET-NEW shell
 *  privilege a decoupled companion had no path to before slice 1 (theme was a
 *  mount-time snapshot only; docs/renderer-host-slice-1.md). Returns a disposer.
 *  No-op if `shell` is unavailable (e.g. missing the `shell:integrate` grant). */
export function subscribeLiveTheme(): () => void {
	const bridge = typeof window === "undefined" ? undefined : window.ryu;
	if (!bridge?.shell?.subscribeTheme) {
		return () => undefined;
	}
	const sub = bridge.shell.subscribeTheme({
		onChange: (tokens) => {
			const root = document.documentElement;
			for (const [name, value] of Object.entries(tokens)) {
				if (name.startsWith("--") && typeof value === "string") {
					root.style.setProperty(name, value);
				}
			}
		},
	});
	return () => sub.dispose();
}
