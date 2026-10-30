import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const evidenceDirectory = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../evidence"
);

interface SkillSnapshot {
	allowedTools: string[];
	alwaysOn: boolean;
	body: string;
	description: string | null;
	id: string;
	name: string;
	source: string;
}

interface SavedVersionSnapshot {
	createdAt: number;
	id: string;
	label: string | null;
	name: string;
	skill: SkillSnapshot;
}

type SkillOperation =
	| "create"
	| "distribute"
	| "getSource"
	| "restore"
	| "setTitle"
	| "snapshot"
	| "update";
interface SkillFixtureCall {
	allowedTools?: string[];
	alwaysOn?: boolean;
	body?: string;
	description?: string | null;
	id?: string;
	label?: string | null;
	name?: string;
	title?: string;
	versionId?: string;
}
interface SkillEditorFixture {
	calls: Record<SkillOperation, SkillFixtureCall[]>;
	delayNext(operation: string): () => void;
	failNext(operation: string): void;
	readSkill(id: string): SkillSnapshot;
	readVersions(id: string): SavedVersionSnapshot[];
}

declare global {
	interface Window {
		__releaseDelayedUpdate: () => void;
		__skillEditorFixture: SkillEditorFixture;
	}
}

async function openSkillEditor(page: Page, query = "mode=edit"): Promise<void> {
	await page.goto(`/e2e/host.html?${query}`);
}

async function chooseText(page: Page, text: string): Promise<void> {
	const editor = page.getByRole("textbox", {
		name: "Skill instructions (Markdown)",
	});
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	await editor.evaluate((element, selectedText) => {
		if (!(element instanceof HTMLTextAreaElement)) {
			throw new Error("The Markdown editor must be a textarea");
		}
		const textarea = element;
		const start = textarea.value.indexOf(selectedText);
		if (start === -1) {
			throw new Error(`Markdown selection is missing: ${selectedText}`);
		}
		textarea.focus();
		textarea.setSelectionRange(start, start + selectedText.length);
	}, text);
}

async function openToolbarCategory(page: Page, category: "Format" | "Blocks") {
	const toolbar = page.getByRole("toolbar", { name: "Skill Markdown tools" });
	const categoryButton = toolbar.getByRole("button", {
		name: `Open ${category} tools`,
	});
	if (!(await categoryButton.isVisible())) {
		await toolbar.getByRole("button", { name: "Open editor tools" }).click();
	}
	await categoryButton.click();
	return toolbar;
}

type CallKey = `calls.${SkillOperation}`;
const callOperations = {
	"calls.create": "create",
	"calls.distribute": "distribute",
	"calls.getSource": "getSource",
	"calls.restore": "restore",
	"calls.setTitle": "setTitle",
	"calls.snapshot": "snapshot",
	"calls.update": "update",
} satisfies Record<CallKey, SkillOperation>;
function readFixture(page: Page, key: "skill-1"): Promise<SkillSnapshot>;
function readFixture(
	page: Page,
	key: "versions.skill-1"
): Promise<SavedVersionSnapshot[]>;
function readFixture(page: Page, key: CallKey): Promise<SkillFixtureCall[]>;
async function readFixture(
	page: Page,
	key: "skill-1" | "versions.skill-1" | CallKey
): Promise<SkillSnapshot | SavedVersionSnapshot[] | SkillFixtureCall[]> {
	if (key === "skill-1") {
		return page.evaluate(() =>
			window.__skillEditorFixture.readSkill("skill-1")
		);
	}
	if (key === "versions.skill-1") {
		return page.evaluate(() =>
			window.__skillEditorFixture.readVersions("skill-1")
		);
	}
	return page.evaluate(
		(operation) => window.__skillEditorFixture.calls[operation] ?? [],
		callOperations[key]
	);
}

async function setFixtureFailure(page: Page, operation: string): Promise<void> {
	await page.evaluate(
		(name) => window.__skillEditorFixture.failNext(name),
		operation
	);
}

test("creates a skill from the front-matter form and enters the saved editor", async ({
	page,
}) => {
	await openSkillEditor(page, "mode=new");
	await page
		.getByRole("textbox", { name: "Skill name" })
		.fill("A strict skill");
	await page
		.getByPlaceholder("One line: what this skill does and when to use it")
		.fill("Only cite primary sources");
	await page
		.getByPlaceholder("Comma-separated, e.g. agentbrowser, spider")
		.fill("Read, Edit, Bash");
	await page.getByRole("switch", { name: "Always on" }).click();
	await page
		.getByRole("textbox", { name: "Skill instructions (Markdown)" })
		.fill("# Review evidence\n\nUse the cited facts.");

	await page.getByRole("button", { name: "Create skill" }).click();
	await expect(
		page.getByRole("button", { name: "Use with agents" })
	).toBeVisible();
	await expect(page.getByText("Saved", { exact: true })).toBeVisible();
	const createCalls = await readFixture(page, "calls.create");
	expect(createCalls).toEqual([
		{
			allowedTools: ["Read", "Edit", "Bash"],
			alwaysOn: true,
			body: "# Review evidence\n\nUse the cited facts.",
			description: "Only cite primary sources",
			name: "A strict skill",
		},
	]);
	const saved = await readFixture(page, "skill-1");
	expect(saved.body).toBe("# Review evidence\n\nUse the cited facts.");
	expect(saved.source).toContain("always-on: true");
	const titles = await readFixture(page, "calls.setTitle");
	expect(titles).toContainEqual({ title: "A strict skill" });

	await page.getByRole("button", { name: "History" }).click();
	await expect(page.getByText("No versions yet.")).toBeVisible();
	await page
		.locator("[data-ryu-toast]")
		.waitFor({ state: "detached" })
		.catch(() => undefined);
	mkdirSync(evidenceDirectory, { recursive: true });
	await page.screenshot({
		fullPage: true,
		path: path.join(evidenceDirectory, "skill-editor-created-skill.png"),
	});
});

test("keeps an unsuccessful create draft intact so the user can retry", async ({
	page,
}) => {
	await openSkillEditor(page, "mode=new&failCreateOnce=1");
	const name = page.getByRole("textbox", { name: "Skill name" });
	await name.fill("A retryable skill");
	await page
		.getByRole("textbox", { name: "Skill instructions (Markdown)" })
		.fill("Retry after the local fixture recovers.");
	await page.getByRole("button", { name: "Create skill" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Local create fixture failed once."
	);
	await expect(name).toHaveValue("A retryable skill");
	await expect(
		page.getByRole("textbox", { name: "Skill instructions (Markdown)" })
	).toHaveValue("Retry after the local fixture recovers.");
	await page.getByRole("button", { name: "Create skill" }).click();
	await expect(
		page.getByRole("button", { name: "Use with agents" })
	).toBeVisible();
	const saved = await readFixture(page, "skill-1");
	expect(saved.name).toBe("A retryable skill");
});

test("retries the initial source read after a temporary load failure", async ({
	page,
}) => {
	await openSkillEditor(page, "mode=edit&failGetOnce=1");
	await expect(page.getByText("Couldn't open this skill")).toBeVisible();
	await page.getByRole("button", { name: "Try again" }).click();
	await expect(page.getByRole("textbox", { name: "Skill name" })).toHaveValue(
		"Research Skill"
	);
	const sourceCalls = await readFixture(page, "calls.getSource");
	expect(sourceCalls.length).toBeGreaterThanOrEqual(2);
});

test("debounces front-matter and Markdown edits, retries a failed write, and reads back saved state", async ({
	page,
}) => {
	await openSkillEditor(page);
	await expect(page.getByRole("textbox", { name: "Skill name" })).toHaveValue(
		"Research Skill"
	);
	await setFixtureFailure(page, "update");
	await page
		.getByRole("textbox", { name: "Skill name" })
		.fill("Research Skill revised");
	await page
		.getByPlaceholder("One line: what this skill does and when to use it")
		.fill("Be explicit about evidence quality");
	await page
		.getByPlaceholder("Comma-separated, e.g. agentbrowser, spider")
		.fill("Read, Edit, Bash");
	await page.getByRole("switch", { name: "Always on" }).click();
	await page
		.getByRole("textbox", { name: "Skill instructions (Markdown)" })
		.fill("# Latest readback\n\nPrefer citations.");
	await expect(page.getByText("Save failed", { exact: true })).toBeVisible({
		timeout: 5000,
	});

	await page
		.getByRole("textbox", { name: "Skill instructions (Markdown)" })
		.fill(
			"# Latest readback\n\nPrefer citations and keep the original source."
		);
	await expect(page.getByText("Saved", { exact: true })).toBeVisible({
		timeout: 5000,
	});
	const updateCalls = await readFixture(page, "calls.update");
	expect(updateCalls).toHaveLength(2);
	expect(updateCalls.at(-1)).toEqual({
		allowedTools: ["Read", "Edit", "Bash"],
		alwaysOn: true,
		body: "# Latest readback\n\nPrefer citations and keep the original source.",
		description: "Be explicit about evidence quality",
		id: "skill-1",
		name: "Research Skill revised",
	});
	const saved = await readFixture(page, "skill-1");
	expect(saved.name).toBe("Research Skill revised");
	expect(saved.description).toBe("Be explicit about evidence quality");
	expect(saved.allowedTools).toEqual(["Read", "Edit", "Bash"]);
	expect(saved.alwaysOn).toBe(true);
	expect(saved.body).toBe(
		"# Latest readback\n\nPrefer citations and keep the original source."
	);
});

test("serializes concurrent autosaves so a slow older write cannot replace the latest draft", async ({
	page,
}) => {
	await openSkillEditor(page);
	const editor = page.getByRole("textbox", {
		name: "Skill instructions (Markdown)",
	});
	await expect(editor).toHaveValue(/Use verified sources/);
	await page.evaluate(() => {
		const release = window.__skillEditorFixture.delayNext("update");
		window.__releaseDelayedUpdate = release;
	});

	await editor.fill("# First draft\n\nThis request is deliberately delayed.");
	await expect
		.poll(() => readFixture(page, "calls.update"), { timeout: 5000 })
		.toHaveLength(1);
	await editor.fill("# Final draft\n\nThis is the authoritative content.");
	await page.evaluate(() => {
		window.__releaseDelayedUpdate();
	});

	await expect(page.getByText("Saved", { exact: true })).toBeVisible({
		timeout: 5000,
	});
	const updateCalls = await readFixture(page, "calls.update");
	expect(updateCalls).toHaveLength(2);
	expect(updateCalls[0]?.body).toBe(
		"# First draft\n\nThis request is deliberately delayed."
	);
	expect(updateCalls[1]?.body).toBe(
		"# Final draft\n\nThis is the authoritative content."
	);
	const saved = await readFixture(page, "skill-1");
	expect(saved.body).toBe(
		"# Final draft\n\nThis is the authoritative content."
	);
});

test("formats selected Markdown with pointer tools and previews only safe web links", async ({
	page,
}) => {
	await openSkillEditor(page, "mode=new");
	const editor = page.getByRole("textbox", {
		name: "Skill instructions (Markdown)",
	});
	await editor.fill(
		"alpha\nbeta\ngamma\ndelta\none\ntwo\nquote me\nbullet me\nnumber me\ncode block\n\n[unsafe](javascript:alert(1))"
	);
	const toolbar = await openToolbarCategory(page, "Format");
	await chooseText(page, "alpha");
	await toolbar.getByRole("button", { name: "Bold" }).click();
	await expect(editor).toHaveValue(/\*\*alpha\*\*/);
	await chooseText(page, "beta");
	await toolbar.getByRole("button", { name: "Italic" }).click();
	await expect(editor).toHaveValue(/_beta_/);
	await chooseText(page, "gamma");
	await toolbar.getByRole("button", { name: "Inline code" }).click();
	await expect(editor).toHaveValue(/`gamma`/);
	await chooseText(page, "delta");
	await toolbar.getByRole("button", { name: "Link" }).click();
	await expect(editor).toHaveValue(/\[delta\]\(https:\/\/example\.com\)/);

	await toolbar.getByRole("button", { name: "Back to editor tools" }).click();
	await toolbar.getByRole("button", { name: "Open Blocks tools" }).click();
	await chooseText(page, "one");
	await toolbar.getByRole("button", { name: "Heading 1" }).click();
	await expect(editor).toHaveValue(/# one/);
	await chooseText(page, "two");
	await toolbar.getByRole("button", { name: "Heading 2" }).click();
	await expect(editor).toHaveValue(/## two/);
	await chooseText(page, "quote me");
	await toolbar.getByRole("button", { name: "Quote" }).click();
	await expect(editor).toHaveValue(/> quote me/);
	await chooseText(page, "bullet me");
	await toolbar.getByRole("button", { name: "Bulleted list" }).click();
	await expect(editor).toHaveValue(/- bullet me/);
	await chooseText(page, "number me");
	await toolbar.getByRole("button", { name: "Numbered list" }).click();
	await expect(editor).toHaveValue(/1\. number me/);
	await chooseText(page, "code block");
	await toolbar.getByRole("button", { name: "Code block" }).click();
	await expect(editor).toHaveValue(/```markdown\ncode block\n```/);

	await toolbar.getByRole("button", { name: "Back to editor tools" }).click();
	await expect(toolbar.getByRole("button", { name: "Write" })).toHaveAttribute(
		"aria-pressed",
		"true"
	);
	await toolbar.getByRole("button", { name: "Preview" }).click();
	await expect(
		toolbar.getByRole("button", { name: "Preview" })
	).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByRole("link", { name: "delta" })).toHaveAttribute(
		"href",
		"https://example.com/"
	);
	await expect(page.getByRole("link")).toHaveCount(1);
	await expect(
		page.getByText(/\[unsafe\]\(javascript:alert\(1\)\)/)
	).toBeVisible();
	await toolbar.getByRole("button", { name: "Write" }).click();
	await expect(editor).toBeVisible();
});

test("captures the latest draft, shows a meaningful diff, and restores a saved version", async ({
	page,
}) => {
	await openSkillEditor(page);
	await expect(page.getByRole("textbox", { name: "Skill name" })).toHaveValue(
		"Research Skill"
	);
	const editor = page.getByRole("textbox", {
		name: "Skill instructions (Markdown)",
	});
	await editor.fill("# Snapshotted body\n\nBefore restore.");
	await expect(page.getByText("Saved", { exact: true })).toBeVisible({
		timeout: 5000,
	});
	await page.getByRole("button", { name: "Save version" }).click();
	await expect.poll(() => readFixture(page, "calls.snapshot")).toHaveLength(1);
	await page.getByRole("button", { name: "History" }).click();
	const version = page.locator("li").first();
	await expect(version.getByRole("button", { name: "Diff" })).toBeVisible();
	await editor.fill("# Later body\n\nAfter the snapshot.");
	await expect(page.getByText("Saved", { exact: true })).toBeVisible({
		timeout: 5000,
	});
	await version.getByRole("button", { name: "Diff" }).click();
	await expect(version).toContainText("- # Snapshotted body");
	await expect(version).toContainText("+ # Later body");

	mkdirSync(evidenceDirectory, { recursive: true });
	await page.screenshot({
		fullPage: true,
		path: path.join(evidenceDirectory, "skill-editor-history-diff.png"),
	});

	await version.getByRole("button", { name: "Restore" }).click();
	await expect(editor).toHaveValue("# Snapshotted body\n\nBefore restore.");
	const saved = await readFixture(page, "skill-1");
	expect(saved.body).toBe("# Snapshotted body\n\nBefore restore.");
	const history = await readFixture(page, "versions.skill-1");
	expect(history.at(-1)?.label).toBe("Before restore");
	const restoreCalls = await readFixture(page, "calls.restore");
	expect(restoreCalls).toContainEqual({
		id: "skill-1",
		versionId: "version-snapshot-2",
	});
});

test("recovers from version list, diff, and snapshot failures without losing history", async ({
	page,
}) => {
	await openSkillEditor(page);
	await expect(page.getByRole("textbox", { name: "Skill name" })).toHaveValue(
		"Research Skill"
	);
	await setFixtureFailure(page, "listVersions");
	await page.getByRole("button", { name: "History" }).click();
	await expect(
		page.getByText("Local listVersions fixture failed once.")
	).toBeVisible();
	await page.getByRole("button", { name: "History" }).click();
	await page.getByRole("button", { name: "History" }).click();
	const version = page.locator("li").first();
	await expect(version).toContainText("Before edits");

	await setFixtureFailure(page, "versionSource");
	await version.getByRole("button", { name: "Diff" }).click();
	await expect(
		page.getByText("Local versionSource fixture failed once.")
	).toBeVisible();
	await version.getByRole("button", { name: "Diff" }).click();
	await expect(version).toContainText("Prefer primary sources and cite them.");

	await setFixtureFailure(page, "snapshot");
	await page.getByRole("button", { name: "Save version" }).click();
	await expect(
		page.getByText("Local snapshot fixture failed once.")
	).toBeVisible();
	await page.getByRole("button", { name: "Save version" }).click();
	const snapshots = await readFixture(page, "calls.snapshot");
	expect(snapshots).toHaveLength(2);
	const history = await readFixture(page, "versions.skill-1");
	expect(history).toHaveLength(2);
});

test("retries a failed restore and forwards agent use only to its host capability", async ({
	page,
}) => {
	await openSkillEditor(page);
	await expect(page.getByRole("textbox", { name: "Skill name" })).toHaveValue(
		"Research Skill"
	);
	await page.getByRole("button", { name: "History" }).click();
	const version = page.locator("li").first();
	await setFixtureFailure(page, "restore");
	await version.getByRole("button", { name: "Restore" }).click();
	await expect(
		page.getByText("Local restore fixture failed once.")
	).toBeVisible();
	await version.getByRole("button", { name: "Restore" }).click();
	await expect(
		page.getByRole("textbox", { name: "Skill instructions (Markdown)" })
	).toHaveValue("# Baseline section\n\nPrefer primary sources and cite them.");

	await setFixtureFailure(page, "distribute");
	await page.getByRole("button", { name: "Use with agents" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Local distribute fixture failed once."
	);
	await page.getByRole("button", { name: "Use with agents" }).click();
	const distributeCalls = await readFixture(page, "calls.distribute");
	expect(distributeCalls).toEqual([{ id: "skill-1" }, { id: "skill-1" }]);
});
