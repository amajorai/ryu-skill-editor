import { describe, expect, it } from "bun:test";
import {
	skillSourceSchema,
	skillVersionsSchema,
	skillWriteResultSchema,
} from "./schemas.ts";
import type { SkillSource } from "./types.ts";

describe("Skill Editor readback contracts", () => {
	it("retains nullable descriptions and additive Core metadata", () => {
		const value = {
			id: "skill-1",
			name: "Skill",
			body: "# hi",
			source: "# hi",
			description: null,
			allowedTools: [],
			alwaysOn: false,
			metadata: { source: "Core" },
		};
		const parsed: SkillSource = skillSourceSchema.parse(value);
		expect(parsed).toEqual(value);
	});
	it("rejects malformed source and write acknowledgements before rendering", () => {
		expect(() =>
			skillSourceSchema.parse({ id: "skill-1", source: "# hi" })
		).toThrow();
		expect(() =>
			skillWriteResultSchema.parse({ id: "skill-1", source: null })
		).toThrow();
	});
	it("keeps nullable version labels and requires the canonical timestamp", () => {
		const value = {
			id: "version-1",
			name: "Skill",
			createdAt: 1,
			label: null,
			metadata: { owner: "Core" },
		};
		expect(skillVersionsSchema.parse([value])).toEqual([value]);
		expect(() =>
			skillVersionsSchema.parse([{ ...value, createdAt: "1" }])
		).toThrow();
	});
});
