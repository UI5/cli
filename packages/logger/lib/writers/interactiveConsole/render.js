import chalk from "chalk";
import figures from "figures";
import prettyHrtime from "pretty-hrtime";
import {STATES} from "./state/build.js";
import {brand, accent, accentBold, arrow, placeholder} from "./format.js";
import {REMOTE_CONNECTIONS_WARNING_LINES} from "./remoteConnectionsWarning.js";

const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
const STATE_LABEL_WIDTH = "building".length;
const pad = (s) => s.padEnd(STATE_LABEL_WIDTH);

// Align continuation lines (additional network URLs / extra placeholders)
// under the first URL slot. The arrow, single space, and "Network:  " label
// are all fixed-width.
const NETWORK_INDENT = " ".repeat(`${figures.pointer} ${"Network:"} `.length);

// Order matters: header → project → server → build → status → log-above (log
// scrolls outside the live region). Each region emits an array of lines and
// is skipped entirely when it has no content, giving a stable layout that
// grows top-to-bottom as data arrives.

export function renderHeaderRegion(headerState) {
	if (!headerState.tool) {
		return [];
	}
	const version = headerState.tool.version ? chalk.dim("v" + headerState.tool.version) : "";
	return [
		"",
		`${brand(headerState.tool.name || "UI5 CLI")} ${version}`,
	];
}

export function renderProjectRegion(projectState) {
	if (!projectState.project) {
		return [];
	}
	const project = projectState.project;
	const framework = projectState.framework;
	const projectType = project.type ? chalk.dim(`(${project.type})`) : "";
	const projectVersion = project.version ? chalk.dim("v" + project.version) : "";
	const lines = [""];
	lines.push(`${chalk.dim("Project")}   ${chalk.bold(project.name)}` +
		(projectType ? `  ${projectType}` : "") +
		(projectVersion ? `  ${projectVersion}` : ""));
	if (framework && framework.name) {
		const frameworkVersion = framework.version ? ` ${framework.version}` : "";
		lines.push(`${chalk.dim("Framework")} ${chalk.bold(framework.name + frameworkVersion)}`);
	} else {
		lines.push(`${chalk.dim("Framework")} ${placeholder("(none)")}`);
	}
	return lines;
}

export function renderServerRegion(serverState) {
	if (!serverState.urls) {
		return [];
	}
	const urls = serverState.urls;
	const lines = [""];

	// The event's `urls` list carries labels ("Local"/"Network") shaped by the
	// server. Preserve the current two-line "Local" / "Network" layout by
	// splitting labels here.
	const local = urls.filter((u) => u.label === "Local");
	const network = urls.filter((u) => u.label === "Network");
	const other = urls.filter((u) => u.label !== "Local" && u.label !== "Network");

	if (local.length > 0) {
		lines.push(`${arrow} ${accentBold("Local:")}   ${accent(local[0].url)}`);
	}
	if (network.length > 0) {
		lines.push(`${arrow} ${accentBold("Network:")} ${accent(network[0].url)}`);
		for (let i = 1; i < network.length; i++) {
			lines.push(`${NETWORK_INDENT}${accent(network[i].url)}`);
		}
	} else if (!serverState.acceptRemoteConnections && local.length > 0) {
		lines.push(`${arrow} ${accentBold("Network:")} ` +
			chalk.dim("use --accept-remote-connections to expose"));
	}
	for (const entry of other) {
		lines.push(`${arrow} ${accentBold(entry.label + ":")} ${accent(entry.url)}`);
	}

	if (serverState.acceptRemoteConnections) {
		lines.push("");
		for (const line of REMOTE_CONNECTIONS_WARNING_LINES) {
			lines.push(line);
		}
	}
	return lines;
}

export function renderBuildRegion(buildState) {
	if (buildState.state === STATES.INITIAL) {
		return [];
	}
	const lines = [""];
	lines.push(renderStatusLine(buildState));
	return lines;
}

function renderStatusLine(state) {
	const label = `${chalk.dim("Status")}    `;
	switch (state.state) {
	case STATES.READY: {
		let suffix = "";
		if (state.lastBuildHrtime) {
			suffix = ` ${chalk.dim("·")} ${chalk.dim("Time elapsed: " + prettyHrtime(state.lastBuildHrtime))}`;
		}
		return `${label}${chalk.green(figures.bullet)} ${chalk.green(pad("ready"))}${suffix}`;
	}
	case STATES.STALE:
		return `${label}${chalk.yellow(figures.circle)} ${chalk.yellow(pad("stale"))} ` +
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
			const padded = state.projectNameWidth ?
				state.currentProjectName.padEnd(state.projectNameWidth) :
				state.currentProjectName;
			parts.push(chalk.dim("·"), chalk.bold(padded));
		}
		if (state.currentTaskName) {
			const padded = state.taskNameWidth ?
				state.currentTaskName.padEnd(state.taskNameWidth) :
				state.currentTaskName;
			parts.push(chalk.dim("·"), chalk.dim(padded));
		}
		return `${label}${parts.join(" ")}`;
	}
	case STATES.ERROR: {
		const msg = state.errorMessage ? ` · ${state.errorMessage}` : "";
		return `${label}${chalk.red(figures.cross)} ${chalk.red(pad("error"))}${chalk.dim(msg)}`;
	}
	default:
		return label;
	}
}
