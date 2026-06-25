/**
 * Shared yargs option factories used by the CLI commands.
 *
 * Project-graph related options are not relevant for every command (e.g. "ui5 versions"
 * does not load a project). To keep the option definitions in a single place while only
 * exposing them on commands that actually consume them, each command builder opts in
 * to the option groups it needs via the helpers below.
 */

/**
 * Coerce function that keeps only the last value when an option is specified multiple times.
 *
 * If an option is specified multiple times, yargs creates an array for all the values,
 * independently of whether the option is of type "array" or "string".
 * This is unexpected for the options listed in the helpers below, which should all
 * only have one definitive value.
 *
 * The yargs behavior could be disabled by using the parserConfiguration
 * "duplicate-arguments-array": true. However, yargs would then cease to create arrays
 * for those options where we *do* expect the automatic creation of arrays in case the
 * option is specified multiple times. Like "--include-task".
 * Also see https://github.com/yargs/yargs/issues/1318
 *
 * Note: This is not necessary for options of type "boolean".
 *
 * @param {any} arg The yargs value (may be an array if the option was specified multiple times)
 * @returns {any} The last value when arg is an array, otherwise arg unchanged
 */
export function dedupeArray(arg) {
	if (Array.isArray(arg)) {
		return arg[arg.length - 1];
	}
	return arg;
}

/**
 * Adds the project configuration related options ("--config" / "-c" and
 * "--dependency-definition") to the given yargs instance.
 *
 * @param {object} cli The yargs instance
 * @returns {object} The yargs instance
 */
export function applyProjectConfigOptions(cli) {
	return cli
		.option("config", {
			alias: "c",
			describe: "Path to project configuration file in YAML format",
			type: "string"
		})
		.option("dependency-definition", {
			describe: "Path to a YAML file containing the project's dependency tree. " +
				"This option will disable resolution of node package dependencies.",
			type: "string"
		})
		.coerce(["config", "dependency-definition"], dedupeArray);
}

/**
 * Adds the workspace related options ("--workspace-config" and "--workspace" / "-w")
 * to the given yargs instance.
 *
 * @param {object} cli The yargs instance
 * @returns {object} The yargs instance
 */
export function applyWorkspaceOptions(cli) {
	return cli
		.option("workspace-config", {
			describe: "Path to workspace configuration file in YAML format",
			type: "string"
		})
		.option("workspace", {
			alias: "w",
			describe: "Name of the workspace configuration to use",
			default: "default",
			type: "string"
		})
		.coerce(["workspace-config", "workspace"], dedupeArray);
}
