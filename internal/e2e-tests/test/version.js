// Test running "ui5 --version"
// without any fixtures or additional setup.
// and by using node's child_process module and the ui5.cjs under ../../../packages/cli/bin/ui5.cjs.

import { exec } from "node:child_process";
import {test, describe} from "node:test";
import {fileURLToPath} from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ui5 version", () => {
	test("output the version of the UI5 CLI", ({assert}) => {
		const ui5Path = path.resolve(__dirname, "../../../packages/cli/bin/ui5.cjs");
		exec(`node ${ui5Path} --version`, (error, stdout, stderr) => {
			if (error) {
				assert.fail(error);
				return;
			}
			if (stderr) {
				assert.fail(new Error(stderr));
				return;
			}
			// Test: the expected CLI version output is printed
			// e.g. "5.0.0 (from /path/to/ui5/cli)"
			const outPattern = /\d+\..* \(from .*\)/;
			assert.ok(stdout.match(outPattern));
		});
	});
});
