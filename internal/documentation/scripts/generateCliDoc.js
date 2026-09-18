import {readFileSync, writeFileSync, readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import Handlebars from "handlebars";

const SCRIPTS_DIR = new URL(".", import.meta.url);
const TEMPLATE_PATH = new URL("./resources/CLI.template.md", SCRIPTS_DIR);
const METADATA_DIR = new URL("./metadata/", SCRIPTS_DIR);
const COMMANDS_DIR = new URL("./metadata/commands/", SCRIPTS_DIR);

const source = readFileSync(fileURLToPath(TEMPLATE_PATH), "utf8");
const template = Handlebars.compile(source);

function loadJson(url) {
	return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

function formatOptionKey(option) {
	const aliases = Array.isArray(option.alias) ?
		option.alias :
		(option.alias ? [option.alias] : []);
	const shortAliases = aliases.filter((a) => a.length === 1).map((a) => `-${a}`);
	const longAliases = aliases.filter((a) => a.length > 1).map((a) => `--${a}`);
	return [...shortAliases, `--${option.key}`, ...longAliases].join(", ");
}

function formatDetails(option) {
	const parts = [];
	if (option.array) {
		parts.push("[array]");
	} else if (option.type) {
		parts.push(`[${option.type}]`);
	}
	if (option.choices?.length) {
		const quoted = option.choices.map((c) => `"${c}"`).join(", ");
		parts.push(`[choices: ${quoted}]`);
	}
	if (option.defaultDescription != null) {
		parts.push(`[default: ${option.defaultDescription}]`);
	} else if ("default" in option) {
		if (typeof option.default === "string") {
			parts.push(`[default: "${option.default}"]`);
		} else {
			parts.push(`[default: ${option.default}]`);
		}
	}
	return parts.join(" ") || undefined;
}

function formatPositionalDetails(positional) {
	const parts = [];
	if (positional.type) {
		parts.push(`[${positional.type}]`);
	}
	if (positional.required) {
		parts.push("[required]");
	}
	if (positional.choices?.length) {
		const quoted = positional.choices.map((c) => `"${c}"`).join(", ");
		parts.push(`[choices: ${quoted}]`);
	}
	return parts.join(" ") || undefined;
}

function escapeTableCell(str) {
	return str ? str.replace(/\|/g, "\\|") : str;
}

function buildOptionRow(opt) {
	return {
		option: escapeTableCell(formatOptionKey(opt)),
		optionDescription: escapeTableCell(opt.describe),
		optionDetails: escapeTableCell(formatDetails(opt))
	};
}

function buildPositionalRow(pos) {
	return {
		positional: escapeTableCell(pos.key),
		positionalDescription: escapeTableCell(pos.describe?.replace(/\n/g, "<br>") ?? ""),
		positionalDetails: escapeTableCell(formatPositionalDetails(pos))
	};
}

function buildExampleRow(example) {
	const [cmd, desc] = example;
	const resolved = cmd.replace(/\$0\b/g, "ui5");
	return {
		example: resolved,
		exampleDescription: desc
	};
}

function hasContent(subDef) {
	return (subDef.options?.length > 0) ||
		(subDef.positionals?.length > 0) ||
		(subDef.examples?.length > 0);
}

function buildCommandSection(def, parentPath) {
	const commandWords = def.command.split(/\s+/);
	const commandName = commandWords[0];
	const fullPath = parentPath ? `${parentPath} ${commandName}` : commandName;
	const heading = `ui5 ${fullPath}`;
	const usage = `ui5 ${parentPath ? parentPath + " " : ""}${def.command}`;

	const aliases = def.aliases ?
		def.aliases.map((a) => `\`ui5 ${a}\``).join(", ") :
		null;

	const childCommands = (def.subcommands || []).map((sub) => {
		const subName = sub.command.split(/\s+/)[0];
		return {
			childCommand: `ui5 ${fullPath} ${subName}`,
			commandDescription: sub.describe
		};
	});

	const options = (def.options || [])
		.filter((o) => !o.hidden)
		.map(buildOptionRow);

	const positionals = (def.positionals || []).map(buildPositionalRow);

	const examples = (def.examples || []).map(buildExampleRow);

	return {
		command: heading,
		description: def.describe,
		usage,
		aliases,
		childCommands,
		options,
		positionals,
		examples
	};
}

function flattenCommand(def, parentPath = "") {
	const sections = [buildCommandSection(def, parentPath)];
	const commandName = def.command.split(/\s+/)[0];
	const fullPath = parentPath ? `${parentPath} ${commandName}` : commandName;

	for (const sub of (def.subcommands || [])) {
		if (hasContent(sub)) {
			sections.push(...flattenCommand(sub, fullPath));
		}
	}
	return sections;
}

function generateDoc() {
	const base = loadJson(new URL("base.json", METADATA_DIR));
	const commandFiles = readdirSync(fileURLToPath(COMMANDS_DIR))
		.filter((f) => f.endsWith(".json"))
		.sort();
	const commandDefs = commandFiles.map((f) => loadJson(new URL(f, COMMANDS_DIR)));

	const commonOptions = base.options
		.filter((o) => !o.hidden)
		.map(buildOptionRow);

	const commonExamples = base.examples.map(([cmd, desc]) => ({
		commonExample: cmd,
		commonExampleDescription: desc
	}));

	const commands = commandDefs.flatMap((def) => flattenCommand(def));

	let content = template({
		common: base.usage,
		commonOptions: commonOptions.map((o) => ({
			commonOption: o.option,
			commonOptionDescription: o.optionDescription,
			commonOptionDetails: o.optionDetails
		})),
		commonExamples,
		commands
	});

	content = content
		.split("&amp;").join("&")
		.split("&quot;").join("\"")
		.split("&#x27;").join("'")
		.split("&#x60;").join("`")
		.split("&lt;").join("<")
		.split("&gt;").join(">")
		.replaceAll("<option>", "&lt;option&gt;")
		.replace(/(?<!\()(https?:\/\/[^\s)]+)(?!\))/g, "`$1`");
	content = content.split("&#x3D;").join("=");

	try {
		writeFileSync("./docs/pages/CLI.md", content);
	} catch (err) {
		console.error(`Failed to generate docs/pages/CLI.md: ${err.message}.`);
		throw err;
	}
	console.log("Generated internal/documentation/docs/pages/CLI.md");
}

generateDoc();
