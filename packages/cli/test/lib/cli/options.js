import test from "ava";
import yargs from "yargs";
import {
	applyProjectConfigOptions,
	applyWorkspaceOptions,
	dedupeArray,
} from "../../../lib/cli/options.js";

// Options are declared in per-command JSON metadata files and registered via
// applyCommandMetadata(). These helpers only apply .coerce() logic.
// Tests register options manually to isolate the coerce behavior under test.

function buildCli(registerFn, coerceFn) {
	const cli = yargs().exitProcess(false);
	registerFn(cli);
	coerceFn(cli);
	cli.command("test", "test command", () => {}, () => {});
	return cli;
}

function withProjectConfigOptions(cli) {
	cli.option("config", {type: "string"});
	cli.option("dependency-definition", {type: "string"});
}

function withWorkspaceOptions(cli) {
	cli.option("workspace", {type: "string"});
	cli.option("workspace-config", {type: "string"});
}

test("dedupeArray returns last value of array", (t) => {
	t.is(dedupeArray(["a", "b", "c"]), "c");
});

test("dedupeArray returns scalar unchanged", (t) => {
	t.is(dedupeArray("a"), "a");
	t.is(dedupeArray(undefined), undefined);
});

test("applyProjectConfigOptions: --config specified twice keeps last value", async (t) => {
	const cli = buildCli(withProjectConfigOptions, applyProjectConfigOptions);
	const argv = await cli.parse(["test", "--config", "first.yaml", "--config", "second.yaml"]);
	t.is(argv.config, "second.yaml");
});

test("applyProjectConfigOptions: --dependency-definition specified twice keeps last value", async (t) => {
	const cli = buildCli(withProjectConfigOptions, applyProjectConfigOptions);
	const argv = await cli.parse(["test",
		"--dependency-definition", "first.yaml",
		"--dependency-definition", "second.yaml",
	]);
	t.is(argv.dependencyDefinition, "second.yaml");
});

test("applyWorkspaceOptions: --workspace specified twice keeps last value", async (t) => {
	const cli = buildCli(withWorkspaceOptions, applyWorkspaceOptions);
	const argv = await cli.parse(["test", "--workspace", "first", "--workspace", "second"]);
	t.is(argv.workspace, "second");
});

test("applyWorkspaceOptions: --workspace-config specified twice keeps last value", async (t) => {
	const cli = buildCli(withWorkspaceOptions, applyWorkspaceOptions);
	const argv = await cli.parse(["test",
		"--workspace-config", "first.yaml",
		"--workspace-config", "second.yaml",
	]);
	t.is(argv.workspaceConfig, "second.yaml");
});
