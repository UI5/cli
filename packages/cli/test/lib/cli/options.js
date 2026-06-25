import test from "ava";
import yargs from "yargs";
import {
	applyProjectConfigOptions,
	applyWorkspaceOptions,
	dedupeArray,
} from "../../../lib/cli/options.js";

function buildCli(applyFns) {
	const cli = yargs().strict(true).exitProcess(false);
	for (const apply of applyFns) {
		apply(cli);
	}
	cli.command("test", "test command", () => {}, () => {});
	cli.fail((msg) => {
		throw new Error(msg);
	});
	return cli;
}

test("dedupeArray returns last value of array", (t) => {
	t.is(dedupeArray(["a", "b", "c"]), "c");
});

test("dedupeArray returns scalar unchanged", (t) => {
	t.is(dedupeArray("a"), "a");
	t.is(dedupeArray(undefined), undefined);
});

test("applyProjectConfigOptions: --config and --dependency-definition accepted", async (t) => {
	const cli = buildCli([applyProjectConfigOptions]);
	const argv = await cli.parse(["test", "--config", "a.yaml", "--dependency-definition", "b.yaml"]);
	t.is(argv.config, "a.yaml");
	t.is(argv.dependencyDefinition, "b.yaml");
});

test("applyProjectConfigOptions: -c alias works", async (t) => {
	const cli = buildCli([applyProjectConfigOptions]);
	const argv = await cli.parse(["test", "-c", "a.yaml"]);
	t.is(argv.config, "a.yaml");
});

test("applyProjectConfigOptions: --config specified twice keeps last value", async (t) => {
	const cli = buildCli([applyProjectConfigOptions]);
	const argv = await cli.parse(["test", "--config", "first.yaml", "--config", "second.yaml"]);
	t.is(argv.config, "second.yaml");
});

test("applyProjectConfigOptions: rejects --workspace when workspace options not applied", (t) => {
	const cli = buildCli([applyProjectConfigOptions]);
	t.throws(() => cli.parse(["test", "--workspace", "foo"]), {
		message: /Unknown argument: workspace/,
	});
});

test("applyWorkspaceOptions: --workspace and --workspace-config accepted", async (t) => {
	const cli = buildCli([applyWorkspaceOptions]);
	const argv = await cli.parse(["test", "--workspace", "dolphin", "--workspace-config", "ws.yaml"]);
	t.is(argv.workspace, "dolphin");
	t.is(argv.workspaceConfig, "ws.yaml");
});

test("applyWorkspaceOptions: -w alias works", async (t) => {
	const cli = buildCli([applyWorkspaceOptions]);
	const argv = await cli.parse(["test", "-w", "dolphin"]);
	t.is(argv.workspace, "dolphin");
});

test("applyWorkspaceOptions: --workspace defaults to 'default'", async (t) => {
	const cli = buildCli([applyWorkspaceOptions]);
	const argv = await cli.parse(["test"]);
	t.is(argv.workspace, "default");
});

test("applyWorkspaceOptions: --workspace specified twice keeps last value", async (t) => {
	const cli = buildCli([applyWorkspaceOptions]);
	const argv = await cli.parse(["test", "--workspace", "first", "--workspace", "second"]);
	t.is(argv.workspace, "second");
});

test("applyWorkspaceOptions: rejects --config when project-config options not applied", (t) => {
	const cli = buildCli([applyWorkspaceOptions]);
	t.throws(() => cli.parse(["test", "--config", "foo.yaml"]), {
		message: /Unknown argument: config/,
	});
});

test("Both helpers combined: all four options accepted", async (t) => {
	const cli = buildCli([applyProjectConfigOptions, applyWorkspaceOptions]);
	const argv = await cli.parse([
		"test",
		"--config", "a.yaml",
		"--dependency-definition", "b.yaml",
		"--workspace", "dolphin",
		"--workspace-config", "ws.yaml",
	]);
	t.is(argv.config, "a.yaml");
	t.is(argv.dependencyDefinition, "b.yaml");
	t.is(argv.workspace, "dolphin");
	t.is(argv.workspaceConfig, "ws.yaml");
});
