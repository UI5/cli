/* eslint-disable indent */
import {unified} from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import rehypeIgnore from "rehype-ignore";
import rehypeFormat from "rehype-format";
import remarkGfm from "remark-gfm";
import rehypeVideo from "rehype-video";
import fs from "node:fs";
import path from "node:path";
import {toHtml} from "hast-util-to-html";
import {JSDOM} from "jsdom";

function escapeMarkdown(input) {
	const map = {
        "|": "&#124;"
    };

    const escapeLine = (line) => {
        let out = line;
        for (const key of Object.keys(map)) {
            out = out.replaceAll(key, map[key]);
        }
        return out;
    };

    return input
        .split("\n")
        .map((line) => {
            const trimmed = line.trimStart();

            if (trimmed.startsWith("|")) {
                return line;
            }

            return escapeLine(line);
        })
        .join("\n");
}

function fixMarkdown(input) {
    return input.replaceAll("\\<optional>", "Optional").replaceAll("<optional>", "Optional");
}

async function htmlToMarkdown(options = {}) {
	const file = await unified()
		.use(rehypeParse, {fragment: true})
		.use(rehypeIgnore)
		.use(remarkGfm)
		.use(rehypeVideo)
		.use(rehypeFormat)
		.use(rehypeRemark, {
            document: false,
            handlers: {
                table(state, node) {
                    let html = toHtml(node);
                    const parsedHTML = new JSDOM(html).window.document.getElementsByClassName("params")[1];
                    if (parsedHTML !== undefined) {
                        html = parsedHTML.outerHTML;
                    }
                    const result = {type: "html", value: html};
                    state.patch(node, result);
                    return result;
                }
            }
        })
		.use(remarkStringify, {
            commonmark: true,
            entities: true
        })
		.processSync(options.html);
	return String(file);
}

const excludedFiles = {"index.html": "", "global.html": "", "custom.css": ""};
const inputDirectory = path.join("dist", "api");
const outputDirectory = path.join("docs", "api");

if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory);
} else {
	for (const file of fs.readdirSync(outputDirectory)) {
		fs.rmSync(path.join(outputDirectory, file));
	}
}

for (const file of fs.readdirSync(path.join("dist", "api"))) {
	if (excludedFiles[file] !== undefined) continue;
    const filePath = path.join(inputDirectory, file);
	if (fs.statSync(filePath).isDirectory()) continue;
	const htmlString = fs.readFileSync(filePath);
	let markdown = await htmlToMarkdown({
		html: htmlString
	});
    markdown = escapeMarkdown(markdown);
    markdown = fixMarkdown(markdown);
    if (file.endsWith(".js.html")) {
        markdown = markdown.replace("```", "```javascript");
    }
    fs.writeFileSync(
        path.join(outputDirectory, file.replace(".html", ".md")),
        markdown
    );
}
