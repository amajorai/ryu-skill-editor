# ryu-skill-editor

Skill Editor for Ryu — author a user-owned Agent Skill (SKILL.md): front-matter fields, a markdown body editor, debounced autosave, and server-backed undoable version history.

> **The public home of `ryu-skill-editor`.** Source, builds, and releases live here —
> binaries for every platform are attached to each release.
>
> This tree is generated from the Ryu monorepo, so commits pushed here
> directly are replaced on the next sync. **Pull requests are welcome** —
> open them here and they are ported into the monorepo, then flow back out.
> Ryu as a whole: https://github.com/amajorai/ryu

## Source & build

This is the **source of record** for the app UI. It imports Ryu's private
`@ryu/ui` design system, so it does **not** build standalone outside the
monorepo — it **builds inside the amajorai/ryu monorepo workspace**.
The **shipped bundle below is the built artifact**: a prebuilt single-file
companion bundle is included at [`dist/skill-editor.ui.html`](./dist/skill-editor.ui.html) —
the runnable UI Ryu loads for this app.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

# com.ryu.skill-editor — Skill Editor

Author a user-owned Agent Skill (`SKILL.md`): front-matter fields (name /
description / allowed tools / always-on), a markdown body editor, debounced
autosave, and server-backed undoable version history.

## Parts

- **`ui/` — companion (`@ryu/skill-editor-app`).** A sandboxed full-page Companion
  (Path B, `ui_format: "html"`), built to one self-contained `dist/index.html` via
  `vite-plugin-singlefile`, consuming `@ryu/ui` (tree-shaken in). No backend crate
  of its own — it does CRUD over Core's existing `/api/skills` authoring endpoints
  through the bridge, every call over `window.ryu`. The shared Plate/Yjs
  `MarkdownEditor` is shell-bound and cannot cross the sandbox, so the body editor
  is a self-contained textarea + rendered preview (`SKILL.md` is plain markdown).

## Manifest (`ui/plugin.json`)

- **id** `com.ryu.skill-editor` · one `companion` runnable (`Skill Editor`, icon
  `sparkles`).
- **Grant:** `skills:crud` — the bridge capability the companion drives Core's
  `/api/skills` authoring surface through.
- No sidecar: skill CRUD + version history ride Core's in-crate skills module.

## Surface

Registers as the **Skill Editor** companion in the desktop app store / launcher.
Front-matter form + markdown body + autosave + undoable version history over one
user-owned `SKILL.md`.

## Swap seam

The companion binds to the `skills:crud` capability, not to a specific store —
any backend serving the same authoring contract behind that grant can back the
editor unchanged.
