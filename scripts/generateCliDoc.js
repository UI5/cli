import {execSync as exec} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import Handlebars from "handlebars";

const source = readFileSync(fileURLToPath(new URL("../scripts/resources/CLI.template.md", import.meta.url)), "utf8");
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
		execute(command + " --help");

		const commandsObj = [];
		obj.commands.shift();
		if (!(obj.commands.length <= 1)) {
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
					positionalObj[index - 1].positionalDescription =
						positionalObj[index - 1].positionalDescription.concat("<br>", description);
					positionalObj[index - 1].positionalDetails =details;
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

		const commandObj = {
			command: command,
			description: obj.desc,
			usage: obj.usage,
			childCommands: commandsObj,
			positionals: positionalObj,
			options: optionObj,
			examples: exampleObj
		};
		commandsArray.push(commandObj);
	}
	let content = template({
		common: obj.common.split("Usage:").join(""),
		commonOptions: optionObj,
		commonExamples: examplesObj,
		commands: commandsArray
	});

	content = content.split("&lt;").join("<").split("&gt;").join(">");
	content = content.split("&#x3D;").join("=");
	try {
		writeFileSync("./packages/documentation/docs/pages/CLI.md", content);
	} catch (err) {
		console.error(`Failed to generate docs/pages/CLI.md: ${err.message}.`);
		throw err;
	}
	console.log("Generated docs/pages/CLI.md");
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
