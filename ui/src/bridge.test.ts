import { afterEach, describe, expect, it } from "bun:test";
import {
	contextSkillId,
	createSkill,
	distributeSkill,
	getSkillSource,
	setTabTitle,
	subscribeLiveTheme,
	updateSkill,
} from "./bridge.ts";

import type { RyuShell, RyuSkills } from "./ryu.d.ts";
import type { SkillSource } from "./types.ts";

type SkillCall = {
	[Method in keyof RyuSkills]: {
		method: Method;
		args: Parameters<RyuSkills[Method]>;
	};
}[keyof RyuSkills];
type Calls = SkillCall[];
interface SkillEditorFixtureBridge {
	context?: { skillId?: string | number } | null;
	shell?: RyuShell;
	skills?: Partial<RyuSkills>;
}
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
function setWindow(ryu: SkillEditorFixtureBridge | undefined): void {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: ryu === undefined ? undefined : { ryu },
	});
}
const source: SkillSource = {
	id: "skill-1",
	name: "Skill",
	body: "# hi",
	source: "# hi",
	description: null,
	allowedTools: [],
	alwaysOn: false,
};
/** Captures each operation using the production bridge's actual arguments. */
function withSkills(): Calls {
	const calls: Calls = [];
	const skills: RyuSkills = {
		create: (args) => {
			calls.push({ method: "create", args: [args] });
			return Promise.resolve({ id: "skill-1", source: "# hi" });
		},
		update: (args) => {
			calls.push({ method: "update", args: [args] });
			return Promise.resolve({ id: args.id, source: "# hi" });
		},
		getSource: (args) => {
			calls.push({ method: "getSource", args: [args] });
			return Promise.resolve(source);
		},
		listVersions: (args) => {
			calls.push({ method: "listVersions", args: [args] });
			return Promise.resolve([]);
		},
		distribute: (args) => {
			calls.push({ method: "distribute", args: [args] });
			return Promise.resolve();
		},
		restore: (args) => {
			calls.push({ method: "restore", args: [args] });
			return Promise.resolve();
		},
		snapshot: (args) => {
			calls.push({ method: "snapshot", args: [args] });
			return Promise.resolve();
		},
		setTitle: (args) => {
			calls.push({ method: "setTitle", args: [args] });
		},
		versionSource: (args) => {
			calls.push({ method: "versionSource", args: [args] });
			return Promise.resolve("# old source");
		},
	};
	setWindow({ skills });
	return calls;
}
afterEach(() => {
	if (windowDescriptor) {
		Object.defineProperty(globalThis, "window", windowDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, "window");
	}
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
		const args = calls.find((c) => c.method === "create")?.args[0];
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
		const args = calls.find((c) => c.method === "create")?.args[0];
		expect(args?.description).toBe("does things");
		expect(args?.allowedTools).toEqual(["Read", "Edit"]);
		expect(args?.alwaysOn).toBe(true);
	});
});

describe("updateSkill", () => {
	it("forwards the id and defaulted draft fields", async () => {
		const calls = withSkills();
		await updateSkill("skill-9", { name: "S", body: "b" });
		const args = calls.find((c) => c.method === "update")?.args[0];
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

describe("distributeSkill", () => {
	it("forwards manual distribution to the host", async () => {
		const calls = withSkills();
		await distributeSkill("skill-42");
		expect(calls.find((call) => call.method === "distribute")?.args[0]).toEqual(
			{ id: "skill-42" }
		);
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
