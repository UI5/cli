/**
 * Builds a structured documentation model for the UI5 CLI by introspecting the
 * real yargs command definitions in-process — no subprocess execution and no
 * help-text parsing.
 *
 * The CLI's command/base modules operate on whatever yargs instance is passed
 * to them and never import yargs themselves, so we can construct the instance
 * exactly like `packages/cli/lib/cli/cli.js` does (minus update-notifier and
 * the final parse()) and read its metadata. yargs is loaded from the CLI
 * package to match the exact version the CLI ships with.
 */

import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {readdirSync} from "node:fs";
import {
	optionDetails,
	positionalDetails,
	switchColumn,
	plainDescription,
	tableCellDescription,
} from "./formatDetails.js";

const CLI_LIB_URL = new URL("../../../../packages/cli/lib/cli/", import.meta.url);

/**
 * Loads yargs (from the CLI package), the CLI's base configuration and all
 * command modules.
 *
 * @returns {Promise<{yargs: Function, base: Function, commandModules: object[]}>} The CLI building blocks
 */
async function loadCli() {
	const cliRequire = createRequire(new URL("cli.js", CLI_LIB_URL));
	const {default: yargs} = await import(pathToFileURL(cliRequire.resolve("yargs")).href);
	const {default: base} = await import(new URL("base.js", CLI_LIB_URL).href);

	const commandsDir = new URL("commands/", CLI_LIB_URL);
	const commandModules = [];
	for (const name of readdirSync(commandsDir).filter((entry) => entry.endsWith(".js"))) {
		const {default: command} = await import(new URL(name, commandsDir).href);
		commandModules.push(command);
	}
	return {yargs, base, commandModules};
}

/**
 * Creates a fresh yargs instance configured like the real CLI (parser config
 * and script name), without any commands or global options.
 *
 * @param {Function} yargs The yargs factory
 * @returns {object} A configured yargs instance
 */
function makeInstance(yargs) {
	const cli = yargs([]);
	cli.parserConfiguration({"parse-numbers": false});
	cli.scriptName("ui5");
	return cli;
}

/**
 * Returns the command handlers registered on a yargs instance, keyed by command name.
 *
 * @param {object} instance A yargs instance
 * @returns {object} Command handlers keyed by name
 */
function getCommandHandlers(instance) {
	return instance.getInternalMethods().getCommandInstance().getCommandHandlers();
}

/**
 * Returns the descriptions map (option/positional keys to descriptions) of a yargs instance.
 *
 * @param {object} instance A yargs instance
 * @returns {object} Descriptions keyed by option/positional name
 */
function getDescriptions(instance) {
	return instance.getInternalMethods().getUsageInstance().getDescriptions();
}

/**
 * Builds a map from a command's original command string to its aliases, as
 * registered on the given (parent) yargs instance. Aliases are stored on the
 * usage instance rather than on the command handler.
 *
 * @param {object} instance A yargs instance the commands are registered on
 * @returns {object} Map of original command string to alias-name array
 */
function getAliasMap(instance) {
	const aliasMap = {};
	for (const [cmd, , , aliases] of instance.getInternalMethods().getUsageInstance().getCommands()) {
		aliasMap[cmd] = aliases || [];
	}
	return aliasMap;
}

/**
 * Applies a command handler's builder to a fresh yargs instance and captures
 * any examples the builder registers (yargs offers no example getter).
 *
 * @param {Function} yargs The yargs factory
 * @param {object} handler A yargs command handler
 * @returns {{child: object, examples: Array<[string, string]>}} The child instance and captured examples
 */
function applyBuilder(yargs, handler) {
	const child = makeInstance(yargs);
	const examples = [];
	child.example = (cmd, description) => {
		examples.push([cmd, description || ""]);
		return child; // preserve chaining
	};
	if (typeof handler.builder === "function") {
		handler.builder(child);
	}
	return {child, examples};
}

/**
 * Maps a captured [command, description] example pair to a template example object.
 *
 * @param {[string, string]} example The example pair
 * @param {string} commandField The template field name for the command
 * @param {string} descriptionField The template field name for the description
 * @returns {object} The template example object
 */
function toExample([cmd, description], commandField, descriptionField) {
	return {
		[commandField]: cmd.split("$0").join("ui5"),
		[descriptionField]: plainDescription(description),
	};
}

/**
 * Extracts the command-specific (or, for the root, common) options of a yargs
 * instance as template option objects. Alias entries are collapsed into their
 * primary option. The built-in "help"/"version" options are only included for
 * the common options.
 *
 * @param {object} instance A yargs instance
 * @param {boolean} includeHelpVersion Whether to include the built-in help/version options
 * @param {Set<string>} [positionalNames] Positional names to exclude (yargs registers them as options too)
 * @returns {object[]} Template option objects ({option, optionDescription, optionDetails})
 */
function extractOptions(instance, includeHelpVersion, positionalNames = new Set()) {
	const opts = instance.getOptions();
	const descriptions = getDescriptions(instance);
	const demandedOptions = instance.getDemandedOptions();

	const aliasKeys = new Set();
	for (const key of Object.keys(opts.alias || {})) {
		for (const alias of opts.alias[key]) {
			aliasKeys.add(alias);
		}
	}

	const options = [];
	for (const key of Object.keys(opts.key || {})) {
		if (aliasKeys.has(key)) {
			continue; // alias of another option, already covered
		}
		if (positionalNames.has(key)) {
			continue; // registered via .positional(), documented in the Positionals table
		}
		if ((opts.hiddenOptions || []).includes(key)) {
			continue; // hidden option (e.g. deprecated), not shown in help
		}
		if ((key === "help" || key === "version") && !includeHelpVersion) {
			continue; // documented once as a common option
		}
		options.push({
			option: switchColumn(key, opts),
			optionDescription: tableCellDescription(descriptions[key]),
			optionDetails: optionDetails(key, opts, demandedOptions),
		});
	}
	return options;
}

/**
 * Extracts the positional arguments of a command from its handler metadata
 * (demanded/optional arrays parsed from the command string), enriched with the
 * command instance's descriptions, choices and types.
 *
 * @param {object} handler The command handler
 * @param {object} opts The command instance's yargs options object
 * @param {object} descriptions The command instance's descriptions map
 * @returns {object[]} Template positional objects
 */
function extractPositionals(handler, opts, descriptions) {
	const entries = [
		...(handler.demanded || []).map((entry) => ({...entry, required: true})),
		...(handler.optional || []).map((entry) => ({...entry, required: false})),
	];

	const positionals = [];
	for (const entry of entries) {
		const name = entry.cmd[0];
		if (name.startsWith("-")) {
			continue; // usage-hint literal (e.g. "[--development]"), not a real positional
		}
		positionals.push({
			positional: name,
			positionalDescription: tableCellDescription(descriptions[name]),
			positionalDetails: positionalDetails({
				variadic: entry.variadic,
				required: entry.required,
				name,
				opts,
			}),
		});
	}
	return positionals;
}

/**
 * Recursively walks a command node, producing one section per command (and
 * per subcommand) and appending it to the accumulator.
 *
 * @param {Function} yargs The yargs factory
 * @param {string} name The command name (key in the parent's handler map)
 * @param {object} handler The command handler
 * @param {string[]} parentTokens The command path of the parent (e.g. ["cache"])
 * @param {string[]} aliases The command's alias names (e.g. ["ls", "list"])
 * @param {object[]} sections The accumulator for produced sections
 */
function walkCommand(yargs, name, handler, parentTokens, aliases, sections) {
	const tokens = [...parentTokens, name];
	const {child, examples} = applyBuilder(yargs, handler);
	const opts = child.getOptions();
	const descriptions = getDescriptions(child);
	const subHandlers = getCommandHandlers(child);
	const subAliasMap = getAliasMap(child);

	const positionals = extractPositionals(handler, opts, descriptions);
	const positionalNames = new Set(positionals.map((positional) => positional.positional));

	sections.push({
		command: `ui5 ${tokens.join(" ")}`,
		description: plainDescription(handler.description),
		aliases: aliases.map((alias) => `\`ui5 ${[...parentTokens, alias].join(" ")}\``).join(", "),
		usage: `ui5 ${[...parentTokens, handler.original].join(" ")}`,
		childCommands: Object.entries(subHandlers).map(([, subHandler]) => ({
			childCommand: `ui5 ${[...tokens, subHandler.original].join(" ")}`,
			commandDescription: tableCellDescription(subHandler.description),
		})),
		options: extractOptions(child, false, positionalNames),
		positionals,
		examples: examples.map((example) => toExample(example, "example", "exampleDescription")),
	});

	for (const [subName, subHandler] of Object.entries(subHandlers)) {
		walkCommand(yargs, subName, subHandler, tokens, subAliasMap[subHandler.original] || [], sections);
	}
}

/**
 * Builds the full documentation model for the CLI template.
 *
 * @returns {Promise<object>} The model ({common, commonOptions, commonExamples, commands})
 */
export async function buildCliModel() {
	const {yargs, base, commandModules} = await loadCli();

	const root = makeInstance(yargs);
	const commonExamples = [];
	root.example = (cmd, description) => {
		commonExamples.push([cmd, description || ""]);
		return root;
	};
	base(root);
	for (const command of commandModules) {
		root.command(command);
	}

	const usages = root.getInternalMethods().getUsageInstance().getUsage();
	const common = usages.length ? usages[0][0] : "";

	const rootAliasMap = getAliasMap(root);
	const sections = [];
	for (const [name, handler] of Object.entries(getCommandHandlers(root))) {
		walkCommand(yargs, name, handler, [], rootAliasMap[handler.original] || [], sections);
	}

	return {
		common,
		commonOptions: extractOptions(root, true).map((option) => ({
			commonOption: option.option,
			commonOptionDescription: option.optionDescription,
			commonOptionDetails: option.optionDetails,
		})),
		commonExamples: commonExamples.map(
			(example) => toExample(example, "commonExample", "commonExampleDescription")),
		commands: sections,
	};
}
