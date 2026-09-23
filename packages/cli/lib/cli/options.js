/**
 * Shared yargs coerce helpers used by the CLI commands.
 *
 * Option declarations have moved to per-command JSON metadata files
 * (packages/cli/lib/cli/commands/*.json) and are applied at runtime via
 * applyCommandMetadata(). The functions below apply only the coerce logic
 * that cannot be expressed in JSON.
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
 * Applies deduplication coerce for the project configuration options
 * ("--config" / "-c" and "--dependency-definition").
 *
 * Option declarations are in the command's JSON metadata file.
 *
 * @param {object} cli The yargs instance
 * @returns {object} The yargs instance
 */
export function applyProjectConfigOptions(cli) {
	return cli.coerce(["config", "dependency-definition"], dedupeArray);
}

/**
 * Applies deduplication coerce for the workspace options
 * ("--workspace-config" and "--workspace" / "-w").
 *
 * Option declarations are in the command's JSON metadata file.
 *
 * @param {object} cli The yargs instance
 * @returns {object} The yargs instance
 */
export function applyWorkspaceOptions(cli) {
	return cli.coerce(["workspace-config", "workspace"], dedupeArray);
}
