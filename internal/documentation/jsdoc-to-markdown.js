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

async function htmlToMarkdown(options = {}) {
	const file = await unified()
		.use(rehypeParse, {fragment: true})
		.use(rehypeIgnore)
		.use(remarkGfm)
		.use(rehypeVideo)
		.use(rehypeFormat)
		.use(rehypeRemark)
		.use(remarkStringify)
		.processSync(options.html);
	return String(file);
}

const excludedFiles = {"index.html": "", "global.html": ""};
const inputDirectory = path.join("dist", "api");
const outputDirectory = path.join("docs", "api");

if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory);
}

for (const file of fs.readdirSync(path.join("dist", "api"))) {
	if (excludedFiles[file] !== undefined) continue;
    const filePath = path.join(inputDirectory, file);
	if (fs.statSync(filePath).isDirectory()) continue;
	const htmlString = fs.readFileSync(filePath);
	const markdown = await htmlToMarkdown({
		html: htmlString
	});
    fs.writeFileSync(
        path.join(outputDirectory, file.replace(".html", ".md")),
        markdown
    );
}
