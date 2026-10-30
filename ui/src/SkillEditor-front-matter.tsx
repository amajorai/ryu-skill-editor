// The SKILL.md front-matter fields (description, allowed tools, always-on) for
// `SkillEditor.tsx`.

import { Input } from "@ryu/ui/components/input.tsx";
import { Label } from "@ryu/ui/components/label.tsx";
import { Switch } from "@ryu/ui/components/switch.tsx";

export function SkillEditorFrontMatter({
	alwaysOn,
	description,
	onAlwaysOnChange,
	onDescriptionChange,
	onToolsChange,
	toolsText,
}: {
	alwaysOn: boolean;
	description: string;
	onAlwaysOnChange: (v: boolean) => void;
	onDescriptionChange: (v: string) => void;
	onToolsChange: (v: string) => void;
	toolsText: string;
}) {
	return (
		<div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3">
			<div className="flex flex-col gap-1">
				<Label htmlFor="skill-description">Description</Label>
				<Input
					id="skill-description"
					onChange={(e) => onDescriptionChange(e.target.value)}
					placeholder="One line: what this skill does and when to use it"
					value={description}
				/>
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor="skill-tools">Allowed tools</Label>
				<Input
					id="skill-tools"
					onChange={(e) => onToolsChange(e.target.value)}
					placeholder="Comma-separated, e.g. agentbrowser, spider"
					value={toolsText}
				/>
			</div>
			<div className="flex items-center gap-2">
				<Switch
					aria-label="Always load this skill's full instructions"
					checked={alwaysOn}
					id="skill-always-on"
					onCheckedChange={onAlwaysOnChange}
				/>
				<Label className="cursor-pointer" htmlFor="skill-always-on">
					Always on
				</Label>
				<span className="text-muted-foreground text-xs">
					Inject the full body every turn instead of loading it on demand.
				</span>
			</div>
		</div>
	);
}
