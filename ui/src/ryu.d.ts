// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app uses the `skills` surface (grant `skills:crud`) for
// the authoring reach, and the generic `shell` surface (grant `shell:integrate`) for
// shell integration — here, only subscribing to the live host theme.
//
// The return shapes mirror the desktop `skills.ts` client the host reuses verbatim
// (camelCase, since that client normalizes Core's snake_case wire), so `bridge.ts`
// re-declares the concrete types (`types.ts`) and casts these `unknown`.
//
// `context.skillId` is the edit target baked into the mount context by the route
// (`/skills/:id/edit` → `{ skillId }`); ABSENT ⇒ new-skill mode (the desktop page
// received `skillId` as a route prop, which cannot cross the sandbox). `setTitle`
// is a shell-navigation verb that renames the owning tab (the desktop page's
// `updateTabTitle`).
//
// MIGRATION (docs/renderer-host-slice-1.md): this companion is DECOUPLED, so its theme
// was a mount-time snapshot only (the host's `html:root{}` token injection never
// updated on a light/dark toggle). It now subscribes to the LIVE host theme via the
// generic `shell.subscribeTheme` primitive — the same re-theming a compiled-in panel
// gets for free. `setTitle` is a BESPOKE shell verb with no slice-1 primitive
// equivalent (nothing renames the *current* owning tab), so it stays on `skills:crud`
// unchanged; there is no navigation verb to move onto `shell.openTab`.

export interface RyuSkills {
	/** Create a new user-authored skill. Rejects (409) on a name collision.
	 *  Resolves to `{ id, source }`. */
	create(args: {
		name: string;
		body: string;
		description?: string | null;
		allowedTools?: string[];
		alwaysOn?: boolean;
	}): Promise<unknown>;
	/** Fetch a skill's editable source (form fields + raw SKILL.md). */
	getSource(args: { id: string }): Promise<unknown>;
	/** List a skill's saved versions, newest first (metadata only). */
	listVersions(args: { id: string }): Promise<unknown>;
	/** Restore a version as the current SKILL.md (undoable). */
	restore(args: { id: string; versionId: string }): Promise<void>;
	/** Rename the owning tab (the desktop page's `updateTabTitle`) — a fire-and-forget
	 *  shell-navigation verb. */
	setTitle(args: { title: string }): void;
	/** Snapshot the skill's current SKILL.md as a new version. */
	snapshot(args: { id: string; label?: string }): Promise<void>;
	/** Update an existing skill's SKILL.md (autosave). Resolves to `{ id, source }`. */
	update(args: {
		id: string;
		name: string;
		body: string;
		description?: string | null;
		allowedTools?: string[];
		alwaysOn?: boolean;
	}): Promise<unknown>;
	/** Fetch one version's captured raw SKILL.md source (for the diff view). */
	versionSource(args: { id: string; versionId: string }): Promise<string>;
}

/** A disposable handle a streaming shell subscription returns. `dispose()` releases
 *  the subscription early; it is also torn down automatically on frame unmount. */
export interface RyuShellSubscription {
	dispose(): void;
}

/** The generic shell-primitive lane (grant `shell:integrate`). Only the subset this
 *  app uses is declared; the full surface is in `docs/renderer-host-slice-1.md`. */
export interface RyuShell {
	/** Subscribe to the host's LIVE resolved theme tokens: `onChange` fires with the
	 *  current token map now and on every host theme change. */
	subscribeTheme(opts: {
		onChange: (tokens: Record<string, string>) => void;
	}): RyuShellSubscription;
}

export interface RyuBridge {
	context: { skillId?: string } | null;
	shell: RyuShell;
	skills: RyuSkills;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
