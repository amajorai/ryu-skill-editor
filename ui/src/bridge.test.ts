import { afterEach, describe, expect, it } from "bun:test";
import {
	contextSkillId,
	createSkill,
	getSkillSource,
	setTabTitle,
	subscribeLiveTheme,
	updateSkill,
} from "./bridge.ts";

type Calls = { method: string; args: unknown[] }[];

function setWindow(ryu: unknown): void {
	(globalThis as { window?: unknown }).window =
		ryu === undefined ? undefined : { ryu };
}

/** A capturing `window.ryu.skills` fake. */
function withSkills(): Calls {
	const calls: Calls = [];
	setWindow({
		context: undefined,
		skills: new Proxy(
			{},
			{
				get(_t, prop: string) {
					return (...args: unknown[]) => {
						calls.push({ method: prop, args });
						return Promise.resolve({ ok: true });
					};
				},
			}
		),
	});
	return calls;
}

afterEach(() => {
	setWindow(undefined);
});

// ── ryu() capability guard ───────────────────────────────────────────────────

describe("bridge guard", () => {
	it("throws when window.ryu is absent", () => {
		setWindow(undefined);
		expect(() => getSkillSource("s1")).toThrow(
			/skills capability is not available/
		);
	});
});

// ── contextSkillId ───────────────────────────────────────────────────────────

describe("contextSkillId", () => {
	it("returns null when there is no window", () => {
		setWindow(undefined);
		expect(contextSkillId()).toBeNull();
	});

	it("returns null when the context skillId is missing or empty", () => {
		setWindow({ context: {} });
		expect(contextSkillId()).toBeNull();
		setWindow({ context: { skillId: "" } });
		expect(contextSkillId()).toBeNull();
	});

	it("returns the non-empty string skill id", () => {
		setWindow({ context: { skillId: "skill-42" } });
		expect(contextSkillId()).toBe("skill-42");
	});

	it("ignores a non-string skillId", () => {
		setWindow({ context: { skillId: 123 } });
		expect(contextSkillId()).toBeNull();
	});
});

// ── createSkill / updateSkill defaulting ─────────────────────────────────────

describe("createSkill", () => {
	it("applies defaults for optional draft fields", async () => {
		const calls = withSkills();
		await createSkill({ name: "My Skill", body: "# hi" });
		const args = calls.find((c) => c.method === "create")?.args[0] as Record<
			string,
			unknown
		>;
		expect(args).toEqual({
			name: "My Skill",
			body: "# hi",
			description: null,
			allowedTools: [],
			alwaysOn: false,
		});
	});

	it("passes supplied optional fields through", async () => {
		const calls = withSkills();
		await createSkill({
			name: "S",
			body: "b",
			description: "does things",
			allowedTools: ["Read", "Edit"],
			alwaysOn: true,
		});
		const args = calls.find((c) => c.method === "create")?.args[0] as Record<
			string,
			unknown
		>;
		expect(args.description).toBe("does things");
		expect(args.allowedTools).toEqual(["Read", "Edit"]);
		expect(args.alwaysOn).toBe(true);
	});
});

describe("updateSkill", () => {
	it("forwards the id and defaulted draft fields", async () => {
		const calls = withSkills();
		await updateSkill("skill-9", { name: "S", body: "b" });
		const args = calls.find((c) => c.method === "update")?.args[0] as Record<
			string,
			unknown
		>;
		expect(args).toEqual({
			id: "skill-9",
			name: "S",
			body: "b",
			description: null,
			allowedTools: [],
			alwaysOn: false,
		});
	});
});

// ── setTabTitle passthrough ──────────────────────────────────────────────────

describe("setTabTitle", () => {
	it("forwards the title to the bridge", () => {
		const calls = withSkills();
		setTabTitle("New Name");
		expect(calls.find((c) => c.method === "setTitle")?.args[0]).toEqual({
			title: "New Name",
		});
	});
});

// ── subscribeLiveTheme no-op branch ──────────────────────────────────────────

describe("subscribeLiveTheme", () => {
	it("returns a no-op disposer when the shell capability is absent", () => {
		setWindow({ skills: {} }); // no shell
		const dispose = subscribeLiveTheme();
		expect(typeof dispose).toBe("function");
		// Calling the no-op disposer must not throw.
		expect(() => dispose()).not.toThrow();
	});

	it("returns a no-op disposer when there is no window", () => {
		setWindow(undefined);
		expect(() => subscribeLiveTheme()()).not.toThrow();
	});

	it("subscribes and returns the subscription's disposer when shell is present", () => {
		let disposed = false;
		let subscribed = false;
		setWindow({
			shell: {
				subscribeTheme: () => {
					subscribed = true;
					return {
						dispose: () => {
							disposed = true;
						},
					};
				},
			},
		});
		const dispose = subscribeLiveTheme();
		expect(subscribed).toBe(true);
		dispose();
		expect(disposed).toBe(true);
	});
});
