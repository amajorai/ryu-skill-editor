import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	namedAssertionIsPresent,
	reconcileLocalInteractionMap,
} from "../../../../apps-store/companion-suite.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../../../../");
const inventoryPath = resolve(
	repositoryRoot,
	"docs/proof/test-coverage-sweep-20260924/companion-interaction-inventory.tsv"
);
const mapPath = resolve(import.meta.dirname, "companion-interactions.json");
const specPath = resolve(import.meta.dirname, "skill-editor-companion.spec.ts");

function parseTsv(source) {
	const [headerLine, ...lines] = source.trimEnd().split("\n");
	const headers = headerLine?.split("\t") ?? [];
	return lines.map((line) => {
		const values = line.split("\t");
		return Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""])
		);
	});
}

const censusRows = parseTsv(readFileSync(inventoryPath, "utf8"));
const map = JSON.parse(readFileSync(mapPath, "utf8"));
const specSource = readFileSync(specPath, "utf8");

describe("Skill Editor package-owned interaction map", () => {
	test("joins all 26 assertions to exact current census rows and named browser tests", () => {
		const reconciled = reconcileLocalInteractionMap(
			"skill-editor",
			censusRows,
			map
		);
		expect(reconciled).toHaveLength(26);
		for (const { assertion } of reconciled) {
			expect(
				namedAssertionIsPresent(
					specSource,
					assertion.testTitle,
					assertion.assertionMarker
				)
			).toBe(true);
		}
	});

	test("rejects duplicate, stale, ambiguous, and missing interaction identities", () => {
		const first = map.assertions[0];
		expect(first).toBeDefined();
		expect(() =>
			reconcileLocalInteractionMap("skill-editor", censusRows, {
				...map,
				assertions: [first, { ...first }],
				expectedRows: 2,
				scope: "partial",
			})
		).toThrow("duplicates an interaction identity");

		const stale = { ...first, row: { ...first.row, line: "99999" } };
		expect(() =>
			reconcileLocalInteractionMap("skill-editor", censusRows, {
				...map,
				assertions: [stale],
				expectedRows: 1,
				scope: "partial",
			})
		).toThrow("does not match exactly one current central census row");

		const skillRows = censusRows.filter(
			(row) => row.package === "skill-editor"
		);
		expect(() =>
			reconcileLocalInteractionMap(
				"skill-editor",
				[...censusRows, { ...skillRows[0] }],
				{ ...map, assertions: [first], expectedRows: 1, scope: "partial" }
			)
		).toThrow("central census contains duplicate interaction identity");

		const incomplete = {
			...map,
			assertions: map.assertions.slice(0, -1),
			expectedRows: 25,
		};
		expect(() =>
			reconcileLocalInteractionMap("skill-editor", censusRows, incomplete)
		).toThrow("complete interaction map expects 25 central rows but found 26");
	});

	test("keeps each assertion marker inside its named browser-test body", () => {
		const first = map.assertions[0];
		expect(
			namedAssertionIsPresent(
				specSource,
				first.testTitle,
				first.assertionMarker
			)
		).toBe(true);
		expect(
			namedAssertionIsPresent(
				specSource,
				"creates a skill from the front-matter form and enters the saved editor",
				first.assertionMarker
			)
		).toBe(false);
	});
});
