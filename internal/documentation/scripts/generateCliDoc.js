import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import Handlebars from "handlebars";
import {buildCliModel} from "./lib/cliModel.js";

const source = readFileSync(fileURLToPath(new URL("./resources/CLI.template.md", import.meta.url)), "utf8");
const template = Handlebars.compile(source);

const model = await buildCliModel();

let content = template({
	// The template renders the usage inside backticks; strip the "Usage:" label
	common: model.common.split("Usage:").join(""),
	commonOptions: model.commonOptions,
	commonExamples: model.commonExamples,
	commands: model.commands,
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
content = content.split("&#x60;").join("`");

const outputPath = fileURLToPath(new URL("../docs/pages/CLI.md", import.meta.url));
try {
	writeFileSync(outputPath, content);
} catch (err) {
	console.error(`Failed to generate docs/pages/CLI.md: ${err.message}.`);
	throw err;
}
console.log("Generated internal/documentation/docs/pages/CLI.md");
