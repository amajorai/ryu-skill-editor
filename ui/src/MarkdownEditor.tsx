// A LIGHTWEIGHT, self-contained markdown body editor for the Skill Editor companion.
//
// WHY NOT THE SHARED EDITOR: the desktop page used `components/editor/MarkdownEditor`,
// a full PlateJS + Yjs collaborative rich-text editor that lives shell-side and is
// bound to the shell's realtime provider / React context — it cannot cross the
// null-origin sandbox boundary. A SKILL.md body is plain Markdown, so a monospace
// textarea (the source of truth) plus a rendered Preview tab is a faithful,
// dependency-free stand-in that preserves the page's contract: seed with
// `initialMarkdown`, emit the raw Markdown string on every edit via `onChangeMarkdown`,
// and re-seed on `key` change (the parent bumps the key to force a fresh mount after a
// version restore — the same mechanism the Plate editor used).
//
// The Preview renders React elements from a small block/inline parser (NOT
// `dangerouslySetInnerHTML`), so nothing the user types can inject markup.

import { useMemo, useState } from "react";

/** Render inline Markdown (bold / italic / inline-code / links) to React nodes.
 *  Escapes nothing into HTML — every token becomes a React element or plain text,
 *  so injection is impossible by construction. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	// Ordered alternation: code span, bold, italic, link. First match wins per scan.
	const pattern =
		/(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/;
	let rest = text;
	let i = 0;
	while (rest.length > 0) {
		const m = pattern.exec(rest);
		if (!m || m.index === undefined) {
			nodes.push(rest);
			break;
		}
		if (m.index > 0) {
			nodes.push(rest.slice(0, m.index));
		}
		const tok = m[0];
		const key = `${keyPrefix}-i${i}`;
		i++;
		if (tok.startsWith("`")) {
			nodes.push(
				<code
					className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
					key={key}
				>
					{tok.slice(1, -1)}
				</code>
			);
		} else if (tok.startsWith("**") || tok.startsWith("__")) {
			nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
		} else if (tok.startsWith("*") || tok.startsWith("_")) {
			nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
		} else {
			// [label](href)
			const linkMatch = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok);
			if (linkMatch) {
				nodes.push(
					<a
						className="text-info underline"
						href={linkMatch[2]}
						key={key}
						rel="noopener noreferrer"
						target="_blank"
					>
						{linkMatch[1]}
					</a>
				);
			} else {
				nodes.push(tok);
			}
		}
		rest = rest.slice(m.index + tok.length);
	}
	return nodes;
}

/** A minimal block-level Markdown → React renderer covering the constructs a
 *  SKILL.md realistically uses: ATX headings, fenced code blocks, unordered/ordered
 *  lists, blockquotes, and paragraphs. Not a spec-complete parser — a readable
 *  preview of the textarea that stays the source of truth. */
function MarkdownPreview({ markdown }: { markdown: string }) {
	const blocks = useMemo(() => {
		const lines = markdown.split("\n");
		const out: React.ReactNode[] = [];
		let idx = 0;
		let key = 0;
		while (idx < lines.length) {
			const line = lines[idx];
			// Fenced code block.
			if (line.startsWith("```")) {
				const code: string[] = [];
				idx++;
				while (idx < lines.length && !lines[idx].startsWith("```")) {
					code.push(lines[idx]);
					idx++;
				}
				idx++; // skip closing fence
				out.push(
					<pre
						className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
						key={`b${key}`}
					>
						<code>{code.join("\n")}</code>
					</pre>
				);
				key++;
				continue;
			}
			// ATX heading.
			const heading = /^(#{1,6})\s+(.*)$/.exec(line);
			if (heading) {
				const level = heading[1].length;
				const sizes = [
					"text-2xl",
					"text-xl",
					"text-lg",
					"text-base",
					"text-sm",
					"text-sm",
				];
				out.push(
					<p
						className={`mt-3 mb-1 font-semibold ${sizes[level - 1]}`}
						key={`b${key}`}
					>
						{renderInline(heading[2], `b${key}`)}
					</p>
				);
				key++;
				idx++;
				continue;
			}
			// Blockquote.
			if (line.startsWith(">")) {
				const quote: string[] = [];
				while (idx < lines.length && lines[idx].startsWith(">")) {
					quote.push(lines[idx].replace(/^>\s?/, ""));
					idx++;
				}
				out.push(
					<blockquote
						className="my-2 border-muted-foreground/40 border-l-2 pl-3 text-muted-foreground"
						key={`b${key}`}
					>
						{renderInline(quote.join(" "), `b${key}`)}
					</blockquote>
				);
				key++;
				continue;
			}
			// Unordered / ordered list.
			const listItem = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
			if (listItem) {
				const ordered = /\d+\./.test(listItem[2]);
				const items: string[] = [];
				while (idx < lines.length) {
					const li = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[idx]);
					if (!li) {
						break;
					}
					items.push(li[3]);
					idx++;
				}
				const inner = items.map((it, n) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: list items are positional and static within one render.
					<li key={`li${key}-${n}`}>{renderInline(it, `li${key}-${n}`)}</li>
				));
				out.push(
					ordered ? (
						<ol className="my-2 list-decimal pl-6" key={`b${key}`}>
							{inner}
						</ol>
					) : (
						<ul className="my-2 list-disc pl-6" key={`b${key}`}>
							{inner}
						</ul>
					)
				);
				key++;
				continue;
			}
			// Blank line.
			if (line.trim() === "") {
				idx++;
				continue;
			}
			// Paragraph: gather consecutive non-blank, non-special lines.
			const para: string[] = [];
			while (idx < lines.length && lines[idx].trim() !== "") {
				const l = lines[idx];
				if (
					l.startsWith("```") ||
					l.startsWith(">") ||
					/^(#{1,6})\s+/.test(l) ||
					/^(\s*)([-*+]|\d+\.)\s+/.test(l)
				) {
					break;
				}
				para.push(l);
				idx++;
			}
			out.push(
				<p className="my-2 leading-relaxed" key={`b${key}`}>
					{renderInline(para.join(" "), `b${key}`)}
				</p>
			);
			key++;
		}
		return out;
	}, [markdown]);

	if (markdown.trim().length === 0) {
		return (
			<p className="p-4 text-muted-foreground text-sm">Nothing to preview yet.</p>
		);
	}
	return <div className="px-4 py-2 text-sm">{blocks}</div>;
}

/** The Skill Editor's body editor. Textarea is the source of truth; a Preview tab
 *  renders the current Markdown. `initialMarkdown` seeds the textarea once (per
 *  mount); `onChangeMarkdown` emits the raw Markdown on every edit. Re-mount via a
 *  parent `key` to re-seed after a version restore. */
export function MarkdownEditor({
	initialMarkdown,
	onChangeMarkdown,
}: {
	initialMarkdown: string;
	onChangeMarkdown: (markdown: string) => void;
}) {
	const [value, setValue] = useState(initialMarkdown);
	const [mode, setMode] = useState<"write" | "preview">("write");

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center gap-1 border-b px-4 py-1.5">
				<button
					className={`rounded px-2 py-1 text-xs ${
						mode === "write"
							? "bg-muted font-medium text-foreground"
							: "text-muted-foreground"
					}`}
					onClick={() => setMode("write")}
					type="button"
				>
					Write
				</button>
				<button
					className={`rounded px-2 py-1 text-xs ${
						mode === "preview"
							? "bg-muted font-medium text-foreground"
							: "text-muted-foreground"
					}`}
					onClick={() => setMode("preview")}
					type="button"
				>
					Preview
				</button>
				<span className="ml-auto text-[11px] text-muted-foreground">
					Markdown (SKILL.md body)
				</span>
			</div>
			{mode === "write" ? (
				<textarea
					aria-label="Skill instructions (Markdown)"
					className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-relaxed outline-none"
					onChange={(e) => {
						setValue(e.target.value);
						onChangeMarkdown(e.target.value);
					}}
					placeholder={
						"Write the skill's instructions in Markdown.\n\n# Overview\nWhat this skill does and when to use it…"
					}
					spellCheck
					value={value}
				/>
			) : (
				<div className="min-h-0 flex-1 overflow-auto">
					<MarkdownPreview markdown={value} />
				</div>
			)}
		</div>
	);
}
