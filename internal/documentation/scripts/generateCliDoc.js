import {execSync as exec} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import Handlebars from "handlebars";

const source = readFileSync(fileURLToPath(new URL("./resources/CLI.template.md", import.meta.url)), "utf8");
const template = Handlebars.compile(source);


let first = true;
const obj = {
	common: "",
	usage: "",
	desc: "",
	positionals: [],
	commands: [],
	commonOptions: [],
	addOptions: [],
	examples: [],
};

function execute(command) {
	parseOutput(exec(command).toString());
}

function parseOutput(stdout) {
	const sections = stdout.split("\n\n");
	if (first) {
		for (const section of sections) {
			if (section.includes("Usage:")) {
				obj.common = section;
			}
			if (section.includes("Options:")) {
				obj.commonOptions = section.split("\n");
			}
			if (section.includes("Examples:")) {
				obj.examples = section.split("\n");
			}
			if (section.includes("Commands:")) {
				obj.commands = section.split("\n");
			}
		}
		first = false;
	} else {
		if (sections[0].includes("local")) {
			obj.usage = sections[1];
			obj.desc = sections[2];
		} else {
			obj.usage = sections[0];
			obj.desc = sections[1];
		}

		obj.commands = [];
		obj.examples = [];
		obj.positionals = [];
		obj.addOptions = [];
		for (const section of sections) {
			if (section.includes("Positionals:")) {
				obj.positionals = section.split("\n");
			}
			if (section.includes("Options:")) {
				obj.addOptions = section.split("\n").filter(function(el) {
					const array = obj.commonOptions;
					array.forEach(function(item, index, array) {
						array[index] = item.replace(/\s+/g, "");
					});
					return !array.includes(el.replace(/\s+/g, ""));
				});
			}
			if (section.includes("Examples:")) {
				obj.examples = section.split("\n");
			}
			if (section.includes("Commands:")) {
				obj.commands = section.split("\n");
			}
		}
	}
}


function parseAliases(details) {
	if (!details || !details.startsWith("[aliases:")) return [];
	return details.slice("[aliases:".length, -1).trim().split(",").map((s) => s.trim()).filter(Boolean);
}

// Calls --help for commandPath and builds a full command entry from the current obj state.
/**
 * @param {string} commandPath
 * @param {string[]} aliases
 */
function buildCommandEntry(commandPath, aliases = []) {
	execute(commandPath + " --help");

	const commandsObj = [];
	obj.commands.shift();
	// `< 1` (not `<= 1`) so commands with exactly one subcommand are included too
	if (!(obj.commands.length < 1)) {
		for (const all of obj.commands) {
			const temp = checkChars(all);
			const {command, description} = splitString(temp);
			commandsObj.push({childCommand: command, commandDescription: description});
		}
	}

	const positionalObj = [];
	obj.positionals.shift();
	if (!(obj.positionals.length < 1)) {
		let index = 0;
		for (const all of obj.positionals) {
			const temp = checkChars(all);
			const {command, description, details} = splitString(temp);
			if (!(/\S/.test(command))) {
				if (index > 0) {
					positionalObj[index - 1].positionalDescription =
						positionalObj[index - 1].positionalDescription.concat("<br>", description);
					positionalObj[index - 1].positionalDetails = details;
				}
				continue;
			}
			positionalObj.push({
				positional: command,
				positionalDescription: description,
				positionalDetails: details
			});
			index++;
		}
	}

	const optionObj = [];
	obj.addOptions.shift();
	if (!(obj.addOptions.length <= 1)) {
		for (const all of obj.addOptions) {
			const temp = checkChars(all);
			// yargs appends a trailing empty line to some sections; skip it to avoid ghost table rows
			if (temp == "") {
				continue;
			}
			const {command, description, details} = splitString(temp);
			optionObj.push({option: command, optionDescription: description, optionDetails: details});
		}
	}

	const exampleObj = [];
	obj.examples.shift();
	if (!(obj.examples.length <= 1)) {
		for (const all of obj.examples) {
			const temp = checkChars(all);
			if (temp == "") {
				continue;
			}
			const {command, description} = splitString(temp);
			exampleObj.push({example: command, exampleDescription: description});
		}
	}

	return {
		command: commandPath,
		description: obj.desc,
		usage: obj.usage,
		aliases,
		childCommands: commandsObj,
		positionals: positionalObj,
		options: optionObj,
		examples: exampleObj
	};
}

/**
 * Iterates commandsArray by index so newly appended subcommand entries are
 * automatically picked up on subsequent iterations — depth-first without explicit recursion.
 *
 * @param {Record<string, any>[]} commandsArray
 */
function discoverSubCommands(commandsArray) {
	const seen = new Set(commandsArray.map((e) => e.command));

	for (let i = 0; i < commandsArray.length; i++) {
		for (const child of commandsArray[i].childCommands || []) {
			const subPath = child.childCommand && child.childCommand.trim();
			if (!subPath || !/\S/.test(subPath)) {
				continue;
			}
			// A command with positionals (<arg> or [arg]) is a leaf — skip recursion.
			if (subPath.includes("<") || subPath.includes("[")) {
				continue;
			}
			if (seen.has(subPath)) {
				continue;
			}
			seen.add(subPath);
			commandsArray.push(buildCommandEntry(subPath));
		}
	}
}

function generateDoc() {
	execute("ui5 --help");

	const optionObj = [];
	obj.commonOptions.shift();
	for (const all of obj.commonOptions) {
		const temp = checkChars(all);
		const {command, description, details} = splitString(temp);
		optionObj.push({commonOption: command, commonOptionDescription: description, commonOptionDetails: details});
	}

	obj.examples.shift();
	const examplesObj = [];
	for (const all of obj.examples) {
		const temp = checkChars(all);
		if (temp == "") {
			continue;
		}
		const {command, description} = splitString(temp);
		examplesObj.push({commonExample: command, commonExampleDescription: description});
	}

	obj.commands.shift();
	const commandsArray = [];
	const commands = obj.commands;
	for (const all of commands) {
		const command = all.trim().split(" ").slice(0, 2).join(" ");
		// Parse [aliases: ...] from the root commands-list line before execute() overwrites obj
		const {details: lineDetails} = splitString(checkChars(all));
		const commandObj = buildCommandEntry(command, parseAliases(lineDetails));
		commandsArray.push(commandObj);
	}

	discoverSubCommands(commandsArray);
	// Order subcommands right after their parent commands
	commandsArray.sort((a, b) => a.command.localeCompare(b.command));

	let content = template({
		common: obj.common.split("Usage:").join(""),
		commonOptions: optionObj,
		commonExamples: examplesObj,
		commands: commandsArray
	});

	content = content
		.split("&lt;").join("<")
		.split("&gt;").join(">")
		// Escape <option> as it's considered HTML tag to prevent rendering issues
		.replaceAll("<option>", "&lt;option&gt;")
		// Wrap standalone URLs in backticks to prevent VitePress from treating them as live links
		// Only target URLs that are not already in markdown link syntax [text](url)
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

function splitString(temp) {
	let details;

	const match = temp.split("  ").filter((s) => s).map((s) => s.trim());
	if (match.length && match[match.length - 1].startsWith("[") && match[match.length - 1].endsWith("]")) {
		details = match.pop();
	}
	const description = match.pop() || "";
	const command = match.pop() || "";

	return {command, description, details};
}

function checkChars(all) {
	let clean = all.split("|").join("\\|");
	clean = clean.replace(/"\D+[di]\d{6,}/i, "\"~");
	return clean;
}

generateDoc();
