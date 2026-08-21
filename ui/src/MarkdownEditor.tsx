// A lightweight, self-contained markdown body editor for the Skill Editor companion.
//
// WHY NOT THE SHARED EDITOR: the desktop page used `components/editor/MarkdownEditor`,
// a full PlateJS + Yjs collaborative rich-text editor that lives shell-side and is
// bound to the shell's realtime provider / React context — it cannot cross the
// null-origin sandbox boundary. A SKILL.md body is plain Markdown, so a monospace
// textarea (the source of truth) plus a rendered Preview tab uses the same shared
// nested overflow rail without crossing the sandbox boundary. It preserves the
// page's contract: seed with
// `initialMarkdown`, emit the raw Markdown string on every edit via `onChangeMarkdown`,
// and re-seed on `key` change (the parent bumps the key to force a fresh mount after a
// version restore — the same mechanism the Plate editor used).
//
// The Preview renders React elements from a small block/inline parser (NOT
// `dangerouslySetInnerHTML`), so nothing the user types can inject markup.

import {
	BlocksIcon,
	Heading01Icon,
	Heading02Icon,
	LeftToRightListNumberIcon,
	Link01Icon,
	ListViewIcon,
	QuoteUpIcon,
	SourceCodeIcon,
	TextBoldIcon,
	TextIcon,
	TextItalicIcon,
	ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NestedOverflowToolbar } from "@ryu/ui/components/nested-overflow-toolbar.tsx";
import {
	type ComponentProps,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";

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
			<p className="p-4 text-muted-foreground text-sm">
				Nothing to preview yet.
			</p>
		);
	}
	return <div className="px-4 py-2 text-sm">{blocks}</div>;
}

/** The Skill Editor's body editor. Textarea is the source of truth; the shared
 *  nested overflow toolbar exposes Markdown formatting and the preview mode.
 *  `initialMarkdown` seeds the textarea once (per mount); `onChangeMarkdown` emits
 *  the raw Markdown on every edit. Re-mount via a parent `key` to re-seed after a
 *  version restore. */
export function MarkdownEditor({
	initialMarkdown,
	onChangeMarkdown,
}: {
	initialMarkdown: string;
	onChangeMarkdown: (markdown: string) => void;
}) {
	const [value, setValue] = useState(initialMarkdown);
	const [mode, setMode] = useState<"write" | "preview">("write");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const updateValue = useCallback(
		(next: string, selectionStart: number, selectionEnd: number) => {
			setValue(next);
			onChangeMarkdown(next);

			const restoreSelection = () => {
				const textarea = textareaRef.current;
				if (!textarea) {
					return;
				}
				textarea.focus();
				textarea.setSelectionRange(selectionStart, selectionEnd);
			};

			if (typeof requestAnimationFrame === "function") {
				requestAnimationFrame(restoreSelection);
			} else {
				setTimeout(restoreSelection, 0);
			}
		},
		[onChangeMarkdown]
	);

	const wrapSelection = useCallback(
		(before: string, after: string, emptyValue = "text") => {
			const textarea = textareaRef.current;
			if (!textarea) {
				return;
			}
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const selected = value.slice(start, end) || emptyValue;
			const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
			const nextStart = start + before.length;
			updateValue(next, nextStart, nextStart + selected.length);
		},
		[updateValue, value]
	);

	const prefixLines = useCallback(
		(prefix: string) => {
			const textarea = textareaRef.current;
			if (!textarea) {
				return;
			}
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
			const lineEndIndex = value.indexOf("\n", end);
			const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
			const selectedLines = value.slice(lineStart, lineEnd);
			const nextLines = selectedLines
				.split("\n")
				.map((line) =>
					line.startsWith(prefix)
						? line.slice(prefix.length)
						: `${prefix}${line}`
				)
				.join("\n");
			const next = `${value.slice(0, lineStart)}${nextLines}${value.slice(lineEnd)}`;
			updateValue(next, lineStart, lineStart + nextLines.length);
		},
		[updateValue, value]
	);

	const insertLink = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = value.slice(start, end) || "link text";
		const replacement = `[${selected}](https://example.com)`;
		const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
		updateValue(next, start + 1, start + 1 + selected.length);
	}, [updateValue, value]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center border-b px-4 py-1.5">
				<span className="ml-auto text-[11px] text-muted-foreground">
					Markdown (SKILL.md body)
				</span>
			</div>
			{mode === "write" ? (
				<textarea
					aria-label="Skill instructions (Markdown)"
					className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 pb-24 font-mono text-sm leading-relaxed outline-none"
					onChange={(e) => {
						setValue(e.target.value);
						onChangeMarkdown(e.target.value);
					}}
					placeholder={
						"Write the skill's instructions in Markdown.\n\n# Overview\nWhat this skill does and when to use it…"
					}
					ref={textareaRef}
					spellCheck
					value={value}
				/>
			) : (
				<div className="min-h-0 flex-1 overflow-auto pb-24">
					<MarkdownPreview markdown={value} />
				</div>
			)}
			<NestedOverflowToolbar
				ariaLabel="Skill Markdown tools"
				categories={[
					{
						content: (
							<div className="flex items-center gap-1">
								<MarkdownActionButton
									icon={TextBoldIcon}
									label="Bold"
									onClick={() => wrapSelection("**", "**")}
								/>
								<MarkdownActionButton
									icon={TextItalicIcon}
									label="Italic"
									onClick={() => wrapSelection("_", "_")}
								/>
								<MarkdownActionButton
									icon={SourceCodeIcon}
									label="Inline code"
									onClick={() => wrapSelection("`", "`")}
								/>
								<MarkdownActionButton
									icon={Link01Icon}
									label="Link"
									onClick={insertLink}
								/>
							</div>
						),
						icon: <HugeiconsIcon icon={TextIcon} />,
						id: "format",
						label: "Format",
					},
					{
						content: (
							<div className="flex items-center gap-1">
								<MarkdownActionButton
									icon={Heading01Icon}
									label="Heading 1"
									onClick={() => prefixLines("# ")}
								/>
								<MarkdownActionButton
									icon={Heading02Icon}
									label="Heading 2"
									onClick={() => prefixLines("## ")}
								/>
								<MarkdownActionButton
									icon={QuoteUpIcon}
									label="Quote"
									onClick={() => prefixLines("> ")}
								/>
								<MarkdownActionButton
									icon={ListViewIcon}
									label="Bulleted list"
									onClick={() => prefixLines("- ")}
								/>
								<MarkdownActionButton
									icon={LeftToRightListNumberIcon}
									label="Numbered list"
									onClick={() => prefixLines("1. ")}
								/>
								<MarkdownActionButton
									icon={BlocksIcon}
									label="Code block"
									onClick={() => wrapSelection("```markdown\n", "\n```")}
								/>
							</div>
						),
						icon: <HugeiconsIcon icon={BlocksIcon} />,
						id: "blocks",
						label: "Blocks",
					},
				]}
				primary={
					<>
						<MarkdownActionButton
							active={mode === "write"}
							icon={TextIcon}
							label="Write"
							onClick={() => setMode("write")}
						/>
						<MarkdownActionButton
							active={mode === "preview"}
							icon={ViewIcon}
							label="Preview"
							onClick={() => setMode("preview")}
						/>
					</>
				}
			/>
		</div>
	);
}

function MarkdownActionButton({
	active = false,
	icon,
	label,
	onClick,
}: {
	active?: boolean;
	icon: ComponentProps<typeof HugeiconsIcon>["icon"];
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			aria-label={label}
			aria-pressed={active}
			className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-background px-3 font-medium text-foreground text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${active ? "bg-accent text-accent-foreground" : ""}`}
			onClick={onClick}
			onMouseDown={(event) => event.preventDefault()}
			title={label}
			type="button"
		>
			<span className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
				<HugeiconsIcon icon={icon} />
			</span>
			<span className="hidden whitespace-nowrap sm:inline">{label}</span>
		</button>
	);
}
