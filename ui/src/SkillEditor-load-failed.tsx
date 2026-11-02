// The "couldn't open this skill" empty state for `SkillEditor.tsx`.

import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@ryu/ui/components/empty.tsx";

export function SkillEditorLoadFailed({ onRetry }: { onRetry: () => void }) {
	return (
		<Empty className="h-full">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<HugeiconsIcon icon={SparklesIcon} />
				</EmptyMedia>
				<EmptyTitle>Couldn't open this skill</EmptyTitle>
				<EmptyDescription>
					Something went wrong loading it. Check your connection and try again.
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button onClick={onRetry}>Try again</Button>
			</EmptyContent>
		</Empty>
	);
}
