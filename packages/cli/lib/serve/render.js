import chalk from "chalk";
import prettyHrtime from "pretty-hrtime";
import {STATES} from "./state.js";
import {REMOTE_CONNECTIONS_WARNING_LINES, WARNING_STYLES} from "./remoteConnectionsWarning.js";

const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
const STATE_LABEL_WIDTH = "building".length;
const pad = (s) => s.padEnd(STATE_LABEL_WIDTH);

// COLORFGBG is set by many terminals (xterm, konsole, rxvt, iTerm2, …) as
// "<fg>;<bg>" with ANSI color indices. Indices 0-6 and 8 are conventionally
// dark backgrounds. Apple Terminal, VS Code, and Windows Terminal don't set
// this — we fall back to the light-background palette in that case.
function isDarkTerminalBackground() {
	const v = process.env.COLORFGBG;
	if (!v) {
		return false;
	}
	const bg = parseInt(v.split(";").pop(), 10);
	if (Number.isNaN(bg)) {
		return false;
	}
	return bg < 7 || bg === 8;
}

const DARK_MODE = isDarkTerminalBackground();
const BRAND_HEX = DARK_MODE ? "#FF5A37" : "#1873B4";
const ACCENT_HEX = DARK_MODE ? "#FFA42C" : "#53B8DE";

const brand = (text) => chalk.bold.hex(BRAND_HEX)(text);
const accent = (text) => chalk.hex(ACCENT_HEX)(text);
const accentBold = (text) => chalk.bold.hex(ACCENT_HEX)(text);
const arrow = accent("❯");
const placeholder = (text) => chalk.dim.italic(text);

// Align continuation lines (additional network URLs / extra placeholders)
// under the first URL slot. The leading two spaces, arrow, single space, and
// "Network:  " label are all fixed-width.
const NETWORK_INDENT = " ".repeat(`  ${"❯"} ${"Network:"}  `.length);

// Render the static header — printed once at startup. Returns an array of
// lines so callers can count rows without parsing ANSI.
//
// `urls`, `project`, and `framework` may be `null`/`undefined` to indicate
// that the value isn't known yet. The header renders a dim placeholder for
// each unknown section so the layout is stable across incremental updates.
export function renderHeader({
	brand: brandInfo,
	urls,
	acceptRemoteConnections,
	networkAddressCount = 0,
	project,
	framework,
}) {
	const lines = [];
	lines.push("");
	const brandVersion = brandInfo?.version ? chalk.dim("v" + brandInfo.version) : "";
	lines.push(`  ${brand(brandInfo?.name || "UI5 CLI")} ${brandVersion}`);
	lines.push("");

	const localStr = urls?.local ?
		accent(urls.local) :
		placeholder("binding…");
	lines.push(`  ${arrow} ${accentBold("Local:")}    ${localStr}`);

	const networkUrls = urls?.network && urls.network.length ? urls.network : null;
	if (networkUrls) {
		lines.push(`  ${arrow} ${accentBold("Network:")}  ${accent(networkUrls[0])}`);
		for (let i = 1; i < networkUrls.length; i++) {
			lines.push(`${NETWORK_INDENT}${accent(networkUrls[i])}`);
		}
	} else if (!acceptRemoteConnections) {
		// `--accept-remote-connections` wasn't passed — the network bind won't
		// happen, so render the final hint now instead of a placeholder.
		lines.push(`  ${arrow} ${accentBold("Network:")}  ` +
			chalk.dim("use --accept-remote-connections to expose"));
	} else {
		// Reserve as many placeholder rows as setUrls() is expected to deliver
		// (at least one, so the section is always visible even before the host's
		// interfaces are known) — keeps the live region from re-flowing when the
		// real URLs arrive.
		const placeholderRows = Math.max(1, networkAddressCount);
		lines.push(`  ${arrow} ${accentBold("Network:")}  ${placeholder("binding…")}`);
		for (let i = 1; i < placeholderRows; i++) {
			lines.push(`${NETWORK_INDENT}${placeholder("binding…")}`);
		}
	}

	// `acceptRemoteConnections` reflects user intent (the flag was passed), so
	// the warning is meaningful from the first paint — well before the server
	// has actually bound to the network.
	if (acceptRemoteConnections) {
		lines.push("");
		for (const {text, style} of REMOTE_CONNECTIONS_WARNING_LINES) {
			lines.push("       " + (WARNING_STYLES[style] || WARNING_STYLES.bullet)(text));
		}
	}

	lines.push("");

	if (project) {
		const projectType = project.type ? chalk.dim(`(${project.type})`) : "";
		const projectVersion = project.version ? chalk.dim("v" + project.version) : "";
		lines.push(`  ${chalk.dim("Project")}   ${chalk.bold(project.name)}` +
			(projectType ? `  ${projectType}` : "") +
			(projectVersion ? `  ${projectVersion}` : ""));

		if (framework && framework.name) {
			const frameworkVersion = framework.version ? ` ${framework.version}` : "";
			lines.push(`  ${chalk.dim("Framework")} ${chalk.bold(framework.name + frameworkVersion)}`);
		} else {
			// Render an explicit placeholder so the Framework row exists in
			// every frame — the live region's row count must not change once
			// setProject() resolves, otherwise the status line shifts.
			lines.push(`  ${chalk.dim("Framework")} ${placeholder("(none)")}`);
		}
	} else {
		lines.push(`  ${chalk.dim("Project")}   ${placeholder("resolving…")}`);
		lines.push(`  ${chalk.dim("Framework")} ${placeholder("resolving…")}`);
	}

	return lines;
}

// Render the status line as a single string (no trailing newline).
export function renderStatusLine(state, layout = {}) {
	const label = `  ${chalk.dim("Status")}    `;
	switch (state.state) {
	case STATES.INITIAL:
		return `${label}${chalk.dim("○")} ${chalk.dim(pad("starting"))}`;
	case STATES.READY: {
		let suffix = "";
		if (state.lastBuildHrtime) {
			suffix = ` ${chalk.dim("·")} ${chalk.dim("built in " + prettyHrtime(state.lastBuildHrtime))}`;
		}
		return `${label}${chalk.green("●")} ${chalk.green(pad("ready"))}${suffix}`;
	}
	case STATES.STALE:
		return `${label}${chalk.yellow("○")} ${chalk.yellow(pad("stale"))} ` +
			`${chalk.dim("· files changed, rebuild on next request")}`;
	case STATES.BUILDING: {
		const frame = SPINNER_FRAMES[state.spinFrame % SPINNER_FRAMES.length];
		const parts = [
			`${chalk.yellow(frame)} ${chalk.yellow(pad("building"))}`,
		];
		if (state.totalProjects > 0 && state.currentProjectIndex > 0) {
			const counterWidth = String(state.totalProjects).length;
			const counter = `${String(state.currentProjectIndex).padStart(counterWidth)}` +
				`/${state.totalProjects} projects`;
			parts.push(chalk.dim("·"), chalk.dim(counter));
		}
		if (state.currentProjectName) {
			const padded = layout.projectNameWidth ?
				state.currentProjectName.padEnd(layout.projectNameWidth) :
				state.currentProjectName;
			parts.push(chalk.dim("·"), chalk.bold(padded));
		}
		if (state.currentTaskName) {
			const padded = layout.taskNameWidth ?
				state.currentTaskName.padEnd(layout.taskNameWidth) :
				state.currentTaskName;
			parts.push(chalk.dim("·"), chalk.dim(padded));
		}
		return `${label}${parts.join(" ")}`;
	}
	case STATES.ERROR: {
		const msg = state.errorMessage ? ` · ${state.errorMessage}` : "";
		return `${label}${chalk.red("✗")} ${chalk.red(pad("error"))}${chalk.dim(msg)}`;
	}
	default:
		return label;
	}
}
