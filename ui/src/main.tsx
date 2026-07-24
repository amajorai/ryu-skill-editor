// Skill Editor app entry. Mounts the React component into `#ryu-plugin-root` the
// host document provides. `window.ryu` is installed inline by the Path B host
// bootstrap (injected into <head>) BEFORE this module runs, so the first effect's
// `window.ryu.skills.getSource()` call is queued until the host port arrives.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { subscribeLiveTheme } from "./bridge.ts";
import "./tailwind.css";
import { SkillEditor } from "./SkillEditor.tsx";

const container = document.getElementById("ryu-plugin-root");
if (container) {
	// Keep the companion's theme in lockstep with the host (net-new shell primitive:
	// live theme, previously a mount-only snapshot). Lives at the entry, not in a
	// component effect, so it survives React re-renders; the host tears the underlying
	// subscription down on frame unmount regardless.
	subscribeLiveTheme();
	createRoot(container).render(
		<StrictMode>
			<SkillEditor />
		</StrictMode>
	);
}
