import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

// Define the new content you want to write to the file
const content =
readFileSync(fileURLToPath(new URL("../.vitepress/pathConfigurations/nextconfig.ts", import.meta.url)), "utf8");

// Write the new content to the file, replacing the old content
writeFileSync("./.vitepress/config.ts", content, "utf8");

console.log("File has been replaced with new content.");
