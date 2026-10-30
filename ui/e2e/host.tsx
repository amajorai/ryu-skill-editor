import { createRoot } from "react-dom/client";
import { SkillEditor } from "../src/SkillEditor.tsx";
import "../src/tailwind.css";

interface Draft {
	allowedTools?: string[];
	alwaysOn?: boolean;
	body: string;
	description?: string | null;
	name: string;
}

interface StoredSkill {
	allowedTools: string[];
	alwaysOn: boolean;
	body: string;
	description: string | null;
	id: string;
	name: string;
	source: string;
}

interface StoredVersion {
	createdAt: number;
	id: string;
	label: string | null;
	name: string;
	skill: StoredSkill;
}

interface DeferredOperation {
	promise: Promise<void>;
	release: () => void;
}

type Operation =
	| "create"
	| "distribute"
	| "getSource"
	| "listVersions"
	| "restore"
	| "setTitle"
	| "snapshot"
	| "update"
	| "versionSource";

function copy<T>(value: T): T {
	return structuredClone(value);
}

function sourceFor(skill: Omit<StoredSkill, "source">): string {
	const description = skill.description
		? `description: ${JSON.stringify(skill.description)}\n`
		: "";
	const tools = skill.allowedTools.length
		? `allowed-tools: [${skill.allowedTools.map((tool) => JSON.stringify(tool)).join(", ")}]\n`
		: "";
	return `---\nname: ${JSON.stringify(skill.name)}\n${description}${tools}always-on: ${skill.alwaysOn}\n---\n\n${skill.body}`;
}

function materialize(skill: Omit<StoredSkill, "source">): StoredSkill {
	return { ...skill, source: sourceFor(skill) };
}

const initialSkill = materialize({
	allowedTools: ["Read", "Search"],
	alwaysOn: false,
	body: "# Baseline section\n\nUse verified sources before summarizing.",
	description: "Summarize research papers",
	id: "skill-1",
	name: "Research Skill",
});

const initialVersion: StoredVersion = {
	createdAt: Date.UTC(2026, 8, 29, 9, 0, 0),
	id: "version-baseline",
	label: "Before edits",
	name: initialSkill.name,
	skill: materialize({
		...initialSkill,
		body: "# Baseline section\n\nPrefer primary sources and cite them.",
	}),
};

const query = new URLSearchParams(window.location.search);
const mode = query.get("mode") === "new" ? "new" : "edit";
const skills = new Map<string, StoredSkill>();
const versions = new Map<string, StoredVersion[]>();
if (mode === "edit") {
	skills.set(initialSkill.id, copy(initialSkill));
	versions.set(initialSkill.id, [copy(initialVersion)]);
}

const failures = new Map<Operation, number>();
const delays = new Map<Operation, DeferredOperation[]>();
if (query.get("failGetOnce") === "1") {
	failures.set("getSource", 1);
}
if (query.get("failCreateOnce") === "1") {
	failures.set("create", 1);
}

type OperationCalls = { [Key in Operation]: unknown[] };

const calls: OperationCalls = {
	create: [],
	distribute: [],
	getSource: [],
	listVersions: [],
	restore: [],
	setTitle: [],
	snapshot: [],
	update: [],
	versionSource: [],
};

function failIfRequested(operation: Operation): void {
	const remaining = failures.get(operation) ?? 0;
	if (remaining <= 0) {
		return;
	}
	failures.set(operation, remaining - 1);
	throw new Error(`Local ${operation} fixture failed once.`);
}

async function delayIfRequested(operation: Operation): Promise<void> {
	const pending = delays.get(operation)?.shift();
	await pending?.promise;
}

function getSkill(id: string): StoredSkill {
	const skill = skills.get(id);
	if (!skill) {
		throw new Error(`Unknown local skill: ${id}`);
	}
	return skill;
}

const bridge = {
	context: mode === "edit" ? { skillId: initialSkill.id } : null,
	shell: {
		subscribeTheme: ({
			onChange,
		}: {
			onChange: (tokens: Record<string, string>) => void;
		}) => {
			onChange({ "--background": "oklch(0.15 0 0)" });
			return { dispose: () => undefined };
		},
	},
	skills: {
		create: async (draft: Draft) => {
			calls.create.push(copy(draft));
			failIfRequested("create");
			const id = `skill-${skills.size + 1}`;
			const skill = materialize({
				allowedTools: draft.allowedTools ?? [],
				alwaysOn: draft.alwaysOn ?? false,
				body: draft.body,
				description: draft.description ?? null,
				id,
				name: draft.name,
			});
			skills.set(id, skill);
			versions.set(id, []);
			return { id, source: skill.source };
		},
		distribute: async ({ id }: { id: string }) => {
			calls.distribute.push({ id });
			failIfRequested("distribute");
		},
		getSource: async ({ id }: { id: string }) => {
			calls.getSource.push({ id });
			failIfRequested("getSource");
			return copy(getSkill(id));
		},
		listVersions: async ({ id }: { id: string }) => {
			calls.listVersions.push({ id });
			failIfRequested("listVersions");
			return (versions.get(id) ?? [])
				.slice()
				.reverse()
				.map(({ createdAt, id: versionId, label, name }) => ({
					createdAt,
					id: versionId,
					label,
					name,
				}));
		},
		restore: async ({ id, versionId }: { id: string; versionId: string }) => {
			calls.restore.push({ id, versionId });
			failIfRequested("restore");
			const history = versions.get(id) ?? [];
			const target = history.find((version) => version.id === versionId);
			if (!target) {
				throw new Error(`Unknown local version: ${versionId}`);
			}
			const current = getSkill(id);
			history.push({
				createdAt: Date.UTC(2026, 8, 29, 9, 5, 0),
				id: `version-undo-${history.length + 1}`,
				label: "Before restore",
				name: current.name,
				skill: copy(current),
			});
			versions.set(id, history);
			skills.set(id, copy(target.skill));
		},
		setTitle: ({ title }: { title: string }) => {
			calls.setTitle.push({ title });
		},
		snapshot: async ({ id, label }: { id: string; label?: string }) => {
			calls.snapshot.push({ id, label: label ?? null });
			failIfRequested("snapshot");
			const skill = copy(getSkill(id));
			const history = versions.get(id) ?? [];
			history.push({
				createdAt: Date.UTC(2026, 8, 29, 9, 1, history.length),
				id: `version-snapshot-${history.length + 1}`,
				label: label ?? null,
				name: skill.name,
				skill,
			});
			versions.set(id, history);
		},
		update: async ({ id, ...draft }: Draft & { id: string }) => {
			calls.update.push({ id, ...copy(draft) });
			failIfRequested("update");
			await delayIfRequested("update");
			const skill = materialize({
				allowedTools: draft.allowedTools ?? [],
				alwaysOn: draft.alwaysOn ?? false,
				body: draft.body,
				description: draft.description ?? null,
				id,
				name: draft.name,
			});
			skills.set(id, skill);
			return { id, source: skill.source };
		},
		versionSource: async ({
			id,
			versionId,
		}: {
			id: string;
			versionId: string;
		}) => {
			calls.versionSource.push({ id, versionId });
			failIfRequested("versionSource");
			const version = (versions.get(id) ?? []).find(
				(candidate) => candidate.id === versionId
			);
			if (!version) {
				throw new Error(`Unknown local version: ${versionId}`);
			}
			return version.skill.source;
		},
	},
};

const fixture = {
	calls,
	delayNext(operation: Operation) {
		let release: () => void = () => undefined;
		const promise = new Promise<void>((resolve) => {
			release = resolve;
		});
		const queued = delays.get(operation) ?? [];
		queued.push({ promise, release });
		delays.set(operation, queued);
		return release;
	},
	failNext(operation: Operation) {
		failures.set(operation, (failures.get(operation) ?? 0) + 1);
	},
	readSkill(id: string) {
		return copy(getSkill(id));
	},
	readVersions(id: string) {
		return copy(versions.get(id) ?? []);
	},
};

Object.defineProperty(window, "ryu", { configurable: true, value: bridge });
Object.defineProperty(window, "__skillEditorFixture", {
	configurable: true,
	value: fixture,
});

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(<SkillEditor />);
}
