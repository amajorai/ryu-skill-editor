// A near-VERBATIM port of the desktop `pages/SkillEditorPage.tsx` — a Notion-style
// editor for a user-authored Agent Skill (`SKILL.md`). The ONLY substituted layers:
//   • the shell Plate/Yjs `MarkdownEditor` (shell-bound, cannot cross the sandbox) →
//     the self-contained textarea+preview `./MarkdownEditor.tsx`,
//   • the `lib/api/skills.ts` direct-fetch client → the `window.ryu.skills` bridge
//     (`./bridge.ts`); the host holds the node token and reuses that very client,
//   • `useActiveNode`/`useTabsContext` shell hooks → the mount `context.skillId` +
//     the `setTitle` bridge nav verb,
//   • `@ryu/ui`'s `sileo` toast (shell portal) → the shared frame-local
//     `@ryu/ui/components/sandbox-toast` primitive.
// The front-matter form, autosave debounce, and server-backed VersionHistory are
// preserved byte-for-byte in structure.
//
// `context.skillId` present ⇒ edit mode; absent ⇒ "new skill" mode (a Create button,
// no autosave/history). On create the component transitions IN PLACE to edit mode for
// the new id (the desktop page opened a fresh `/skills/:id/edit` tab; the sandboxed
// companion cannot open tabs, so it flips its own state — a reload reverts to new
// mode, which is acceptable since nothing is lost once created).

import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { sandboxToast as toast } from "@ryu/ui/components/sandbox-toast.ts";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	contextSkillId,
	createSkill,
	distributeSkill,
	getSkillSource,
	getSkillVersionSource,
	listSkillVersions,
	restoreSkillVersion,
	setTabTitle,
	snapshotSkill,
	updateSkill,
} from "./bridge.ts";
import { MarkdownEditor } from "./MarkdownEditor.tsx";
import { SkillEditorFrontMatter } from "./SkillEditor-front-matter.tsx";
import { SkillEditorLoadFailed } from "./SkillEditor-load-failed.tsx";
import {
	parseTools,
	SAVE_LABEL,
	type SaveState,
} from "./SkillEditor-save-state.ts";
import { SerializedWriter } from "./serialized-writer.ts";
import type { SkillDraft } from "./types.ts";
import { VersionHistory, type VersionSource } from "./VersionHistory.tsx";

const SAVE_DEBOUNCE_MS = 800;

export function SkillEditor() {
	const tl = useLiteralMessages();
	// The edit target is baked into the mount context ONCE (a reload keeps it); after
	// a create the id is set in state, flipping the component to edit mode in place.
	const contextId = useMemo(() => contextSkillId(), []);
	const [id, setId] = useState<string | null>(contextId);
	const [isNew, setIsNew] = useState(contextId === null);

	// Loading is immediate in new mode (empty form); edit mode waits for the fetch.
	const [loading, setLoading] = useState(contextId !== null);
	const [loadFailed, setLoadFailed] = useState(false);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [creating, setCreating] = useState(false);
	const [distributing, setDistributing] = useState(false);
	// Bumped on restore to force the editor to re-mount with fresh body content.
	const [reloadNonce, setReloadNonce] = useState(0);

	// Form state mirrors (for rendering); refs hold the latest values so the
	// debounced flush reads them without re-arming on every keystroke.
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [toolsText, setToolsText] = useState("");
	const [alwaysOn, setAlwaysOn] = useState(false);
	// The full SKILL.md last written to disk — the diff baseline for versions.
	const [currentSource, setCurrentSource] = useState("");

	const nameRef = useRef("");
	const descRef = useRef("");
	const toolsRef = useRef("");
	const alwaysOnRef = useRef(false);
	const bodyRef = useRef("");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Serialize writes so a slow earlier request cannot arrive after a newer one and
	// overwrite it on disk. Edits made while a write is in flight are coalesced into
	// one follow-up write with the newest complete draft.
	const writerRef = useRef(new SerializedWriter<string>());
	// The body to seed the editor with once loaded.
	const [initialBody, setInitialBody] = useState<string | null>(
		contextId === null ? "" : null
	);

	// Load an existing skill's source into the form (runs once for the context id).
	useEffect(() => {
		if (!contextId) {
			return;
		}
		let cancelled = false;
		getSkillSource(contextId)
			.then((s) => {
				if (cancelled) {
					return;
				}
				setName(s.name);
				nameRef.current = s.name;
				setDescription(s.description ?? "");
				descRef.current = s.description ?? "";
				const tools = s.allowedTools.join(", ");
				setToolsText(tools);
				toolsRef.current = tools;
				setAlwaysOn(s.alwaysOn);
				alwaysOnRef.current = s.alwaysOn;
				bodyRef.current = s.body;
				setInitialBody(s.body);
				setCurrentSource(s.source);
				setLoadFailed(false);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) {
					setLoadFailed(true);
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [contextId, loadAttempt]);

	const buildDraft = useCallback(
		(): SkillDraft => ({
			name: nameRef.current.trim(),
			description: descRef.current.trim() || null,
			allowedTools: parseTools(toolsRef.current),
			alwaysOn: alwaysOnRef.current,
			body: bodyRef.current,
		}),
		[]
	);

	// Debounced autosave (edit mode only). New skills persist via the Create button.
	const flush = useCallback((): Promise<boolean> => {
		if (isNew || !id) {
			return Promise.resolve(true);
		}
		if (!nameRef.current.trim()) {
			// A SKILL.md requires a name; skip the write until one is entered rather
			// than 400-looping. The field shows required-state on its own.
			return Promise.resolve(false);
		}
		const run = async (): Promise<boolean> => {
			setSaveState("saving");
			try {
				const source = await writerRef.current.flush(async () => {
					const res = await updateSkill(id, buildDraft());
					return res.source;
				});
				setCurrentSource(source);
				setSaveState("saved");
				return true;
			} catch (e) {
				setSaveState("error");
				toast.error(
					e instanceof Error
						? tl("Couldn't save this skill: {error}", { error: e.message })
						: tl("Couldn't save this skill.")
				);
				return false;
			}
		};
		return run();
	}, [isNew, id, buildDraft, tl]);

	const scheduleSave = useCallback(() => {
		if (isNew) {
			return;
		}
		writerRef.current.markChanged();
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
		setSaveState("saving");
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			flush().catch(() => undefined);
		}, SAVE_DEBOUNCE_MS);
	}, [isNew, flush]);

	// Flush any pending edit on unmount so a quick close doesn't drop the last keystroke.
	useEffect(
		() => () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				flush().catch(() => undefined);
			}
		},
		[flush]
	);

	const handleNameChange = useCallback(
		(v: string) => {
			setName(v);
			nameRef.current = v;
			scheduleSave();
		},
		[scheduleSave]
	);
	const handleDescriptionChange = useCallback(
		(v: string) => {
			setDescription(v);
			descRef.current = v;
			scheduleSave();
		},
		[scheduleSave]
	);
	const handleToolsChange = useCallback(
		(v: string) => {
			setToolsText(v);
			toolsRef.current = v;
			scheduleSave();
		},
		[scheduleSave]
	);
	const handleAlwaysOnChange = useCallback(
		(v: boolean) => {
			setAlwaysOn(v);
			alwaysOnRef.current = v;
			scheduleSave();
		},
		[scheduleSave]
	);
	const handleBodyChange = useCallback(
		(markdown: string) => {
			bodyRef.current = markdown;
			scheduleSave();
		},
		[scheduleSave]
	);

	// New-skill creation: persist, then transition this view to edit mode in place.
	const handleCreate = useCallback(async () => {
		if (!nameRef.current.trim()) {
			toast.error("Name your skill first");
			return;
		}
		setCreating(true);
		try {
			const res = await createSkill(buildDraft());
			toast.success("Skill created");
			// Setting the id changes the editor's `key` (new → id), remounting it; re-seed
			// its `initialMarkdown` with what the user already typed so the body the create
			// just persisted stays visible (the desktop page re-fetched it in a fresh tab).
			setInitialBody(bodyRef.current);
			setId(res.id);
			setIsNew(false);
			setCurrentSource(res.source);
			setSaveState("saved");
			setTabTitle(nameRef.current.trim());
		} catch (e) {
			toast.error(
				e instanceof Error
					? tl("Couldn't create this skill: {error}", { error: e.message })
					: tl("Couldn't create this skill.")
			);
		} finally {
			setCreating(false);
		}
	}, [buildDraft, tl]);

	// Keep the tab title in sync with the skill name (edit mode).
	useEffect(() => {
		if (!isNew && name.trim()) {
			setTabTitle(name.trim());
		}
	}, [isNew, name]);

	const handleDistribute = useCallback(async () => {
		if (!id || isNew) {
			return;
		}
		setDistributing(true);
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		try {
			if (!(await flush())) {
				return;
			}
			await distributeSkill(id);
		} catch (error) {
			toast.error(
				error instanceof Error
					? tl("Couldn't use this skill with agents: {error}", {
							error: error.message,
						})
					: tl("Couldn't use this skill with agents.")
			);
		} finally {
			setDistributing(false);
		}
	}, [flush, id, isNew, tl]);

	// Server-backed version history (snapshot / diff / restore).
	const versionSource = useMemo<VersionSource>(
		() => ({
			list: () =>
				id
					? listSkillVersions(id).then((vs) =>
							vs.map((v) => ({
								createdAt: v.createdAt,
								id: v.id,
								label: v.label,
								title: v.name,
							}))
						)
					: Promise.resolve([]),
			getValue: (versionId) =>
				id ? getSkillVersionSource(id, versionId) : Promise.resolve(""),
			snapshot: async (label) => {
				if (!id) {
					return;
				}
				// Persist any pending debounced edit first so the snapshot captures the
				// latest content, not the last auto-saved state.
				if (timerRef.current) {
					clearTimeout(timerRef.current);
					timerRef.current = null;
				}
				if (!(await flush())) {
					throw new Error("Couldn't save the latest edits");
				}
				await snapshotSkill(id, label);
			},
			restore: async (versionId) => {
				if (id) {
					await restoreSkillVersion(id, versionId);
				}
			},
		}),
		[id, flush]
	);

	// After a restore, re-fetch the skill and re-mount the editor with the restored
	// content (clearing the flush timer so a stale draft can't clobber it).
	const handleRestored = useCallback(async () => {
		if (!id) {
			return;
		}
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		try {
			const s = await getSkillSource(id);
			setName(s.name);
			nameRef.current = s.name;
			setDescription(s.description ?? "");
			descRef.current = s.description ?? "";
			const tools = s.allowedTools.join(", ");
			setToolsText(tools);
			toolsRef.current = tools;
			setAlwaysOn(s.alwaysOn);
			alwaysOnRef.current = s.alwaysOn;
			bodyRef.current = s.body;
			setInitialBody(s.body);
			setCurrentSource(s.source);
			setReloadNonce((n) => n + 1);
			setSaveState("saved");
			toast.success("Version restored");
		} catch {
			toast.error("Restored on the server, but couldn't reload the editor");
		}
	}, [id]);

	if (loadFailed) {
		return (
			<SkillEditorLoadFailed
				onRetry={() => {
					setLoadFailed(false);
					setLoading(true);
					setLoadAttempt((n) => n + 1);
				}}
			/>
		);
	}

	if (loading || initialBody === null) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
				<HugeiconsIcon
					className="size-4 shrink-0 opacity-70"
					icon={SparklesIcon}
				/>
				<Input
					aria-label="Skill name"
					className="min-w-0 flex-1"
					onChange={(e) => handleNameChange(e.target.value)}
					placeholder="Skill name"
					value={name}
				/>
				{isNew ? (
					<Button disabled={creating} onClick={handleCreate} size="sm">
						{creating ? <Spinner className="size-3" /> : null}
						{tl("Create skill")}
					</Button>
				) : (
					<>
						<span className="shrink-0 text-muted-foreground text-xs">
							{SAVE_LABEL[saveState]}
						</span>
						<div className="shrink-0">
							<VersionHistory
								currentValue={currentSource}
								onRestored={handleRestored}
								source={versionSource}
							/>
						</div>
						<Button
							disabled={saveState === "saving" || distributing}
							onClick={handleDistribute}
							size="sm"
							variant="outline"
						>
							{distributing ? <Spinner className="size-3" /> : null}
							{tl("Use with agents")}
						</Button>
					</>
				)}
			</div>

			{/* Front-matter fields. */}
			<SkillEditorFrontMatter
				alwaysOn={alwaysOn}
				description={description}
				onAlwaysOnChange={handleAlwaysOnChange}
				onDescriptionChange={handleDescriptionChange}
				onToolsChange={handleToolsChange}
				toolsText={toolsText}
			/>

			<div className="min-h-0 flex-1 overflow-auto">
				<MarkdownEditor
					initialMarkdown={initialBody}
					key={`${id ?? "new"}:${reloadNonce}`}
					onChangeMarkdown={handleBodyChange}
				/>
			</div>
		</div>
	);
}
