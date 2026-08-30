// The concrete types the Skill Editor companion works with. These MIRROR the
// desktop `lib/api/skills.ts` authoring surface VERBATIM (camelCase) because the
// host closures reuse that very client (`getSkillSource`/`createSkill`/`updateSkill`
// /`listSkillVersions`/…), which already normalizes Core's snake_case wire to
// camelCase. The bridge (`bridge.ts`) casts the `unknown` the RPC layer returns to
// these, so the shape the host returns == what the app renders.

/** A skill's editable form fields plus its raw SKILL.md source. */
export interface SkillSource {
	allowedTools: string[];
	alwaysOn: boolean;
	/** The Markdown instruction body (everything below the front-matter). */
	body: string;
	description: string | null;
	id: string;
	name: string;
	/** Raw SKILL.md text — the diff baseline for version history. */
	source: string;
}

/** The editable fields the editor sends on create/update. */
export interface SkillDraft {
	allowedTools?: string[];
	alwaysOn?: boolean;
	body: string;
	description?: string | null;
	name: string;
}

/** The id + canonical source Core wrote (the new diff baseline). */
export interface SkillWriteResult {
	id: string;
	source: string;
}

/** Metadata for one saved skill version (no source; fetched lazily for a diff). */
export interface SkillVersionMeta {
	createdAt: number;
	id: string;
	label: string | null;
	name: string;
}
