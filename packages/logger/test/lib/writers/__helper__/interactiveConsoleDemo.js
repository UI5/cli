#!/usr/bin/env node
// Interactive walkthrough of the InteractiveConsole writer. Enables the real
// writer against process.stderr, then replays actual `ui5.*` process events to
// move between representative `ui5 serve` states.
//
// This demos the writer, not the renderers: nothing here pokes private state.
// Every visible change is driven by an event a real `ui5 serve` would emit.
//
// Run it: node packages/logger/test/lib/writers/__helper__/interactiveConsoleDemo.js

import process from "node:process";
import readline from "node:readline";
import InteractiveConsole from "../../../../lib/writers/InteractiveConsole.js";

const CLEAR_SCREEN = "\u001B[2J\u001B[H";
const PROJECTS = ["my.app", "sap.ui.core", "sap.m", "themelib_sap_horizon"];

const emit = (event, payload) => () => process.emit(event, payload);
const log = (level, message, moduleName) =>
	() => process.emit("ui5.log", {level, message, moduleName});

const scenes = [
	{
		label: "Serve mode placeholders",
		actions: [
			emit("ui5.tool-info", {name: "UI5 CLI", version: "5.0.0"}),
			emit("ui5.tool-mode", {mode: "serve", acceptRemoteConnections: false}),
		],
	},
	{
		label: "Project graph resolved",
		actions: [
			emit("ui5.project-resolved", {
				name: "my.app", type: "application", version: "1.0.0",
				framework: {name: "SAPUI5", version: "1.120.0"},
			}),
			log("info", "Resolving project dependencies", "graph:ProjectGraph"),
			emit("ui5.server-listening", {
				acceptRemoteConnections: false,
				urls: [{label: "Local", url: "http://localhost:8080"}],
			}),
		],
	},
	{
		label: "Initial build running",
		actions: [
			emit("ui5.build-metadata", {projectsToBuild: PROJECTS}),
			emit("ui5.serve-status", {status: "serve-building"}),
			emit("ui5.build-status", {projectName: "my.app", status: "project-build-start"}),
			emit("ui5.project-build-status", {taskName: "replaceCopyright", status: "task-start"}),
		],
	},
	{
		label: "Ready after initial build",
		actions: [
			emit("ui5.serve-status", {status: "serve-build-done", hrtime: [3, 412000000]}),
			emit("ui5.serve-status", {status: "serve-ready"}),
			emit("ui5.serve-status", {status: "serve-stale", staleProjects: []}),
		],
	},
	{
		label: "Ready with stale projects",
		actions: [
			log("info", "File change detected: webapp/controller/Main.controller.js", "server:watch"),
			emit("ui5.serve-status", {status: "serve-stale", staleProjects: ["my.app"]}),
		],
	},
	{
		label: "Settling changes",
		actions: [
			emit("ui5.serve-status", {status: "serve-settling", pendingProjects: ["my.app"]}),
		],
	},
	{
		label: "Rebuild running",
		actions: [
			emit("ui5.serve-status", {status: "serve-building"}),
			emit("ui5.build-status", {projectName: "my.app", status: "project-build-start"}),
			emit("ui5.project-build-status", {taskName: "minify", status: "task-start"}),
		],
	},
	{
		label: "Validating caches",
		actions: [
			emit("ui5.serve-status", {status: "serve-validating", validatingProjects: ["my.app"]}),
		],
	},
	{
		label: "Ready after rebuild",
		actions: [
			emit("ui5.serve-status", {status: "serve-build-done", hrtime: [0, 847000000]}),
			emit("ui5.serve-status", {status: "serve-ready"}),
			emit("ui5.serve-status", {status: "serve-stale", staleProjects: []}),
		],
	},
	{
		label: "Error state",
		actions: [
			emit("ui5.serve-status", {
				status: "serve-error",
				error: new Error("Build failed: Unexpected token in webapp/manifest.json"),
			}),
		],
	},
];

let writer;
let sceneIndex = 0;
let onKeypress;

function writeHelp() {
	process.stderr.write(
		`InteractiveConsole demo ${sceneIndex + 1}/${scenes.length}: ${scenes[sceneIndex].label}\n`);
	process.stderr.write("Use Left/Right arrow keys to move, q or Esc to quit.\n");
}

function resetWriter() {
	writer?.disable();
	process.stderr.write(CLEAR_SCREEN);
	writer = InteractiveConsole.init();
	writeHelp();
	for (let i = 0; i <= sceneIndex; i++) {
		for (const action of scenes[i].actions) {
			action();
		}
	}
}

async function run() {
	if (!process.stderr.isTTY || !process.stdin.isTTY) {
		process.stderr.write(
			"This demo requires an interactive terminal on stdin and stderr.\n");
		process.exitCode = 1;
		return;
	}

	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	process.stdin.resume();

	resetWriter();

	await new Promise((resolve) => {
		onKeypress = (_, key) => {
			if (key?.name === "right" && sceneIndex < scenes.length - 1) {
				sceneIndex++;
				resetWriter();
				return;
			}
			if (key?.name === "left" && sceneIndex > 0) {
				sceneIndex--;
				resetWriter();
				return;
			}
			if (key?.name === "escape" || key?.name === "q" || (key?.ctrl && key.name === "c")) {
				process.stdin.off("keypress", onKeypress);
				resolve();
			}
		};

		process.stdin.on("keypress", onKeypress);
	});
}

run().catch((err) => {
	process.stderr.write(`Demo failed: ${err.stack}\n`);
	process.exitCode = 1;
}).finally(() => {
	if (onKeypress) {
		process.stdin.off("keypress", onKeypress);
	}
	writer?.disable();
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}
	process.stdin.pause();
});
