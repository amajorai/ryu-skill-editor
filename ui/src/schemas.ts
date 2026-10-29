import {
	skillSourceRecordSchema,
	skillVersionRecordSchema,
	skillVersionRecordsSchema,
	skillWriteRecordSchema,
} from "@ryu/app-host/rpc";
import { z } from "zod";
import type {
	SkillSource,
	SkillVersionMeta,
	SkillWriteResult,
} from "./types.ts";

export const contextSkillIdSchema = z.string().min(1);
export const skillSourceSchema =
	skillSourceRecordSchema satisfies z.ZodType<SkillSource>;
export const skillWriteResultSchema =
	skillWriteRecordSchema satisfies z.ZodType<SkillWriteResult>;
export const skillVersionMetaSchema =
	skillVersionRecordSchema satisfies z.ZodType<SkillVersionMeta>;
export const skillVersionsSchema = skillVersionRecordsSchema;
