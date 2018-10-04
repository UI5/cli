const {test} = require("ava");
const path = require("path");
const execa = require("execa");
const pkg = require("../../../../package.json");
const ui5Cli = path.join(__dirname, "..", "..", "..", "..", "bin", "ui5.js");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test("ui5 --version", async (t) => {
	const {stdout} = await ui5(["--version"]);
	t.is(stdout, pkg.version);
});

test("ui5 -v", async (t) => {
	const {stdout} = await ui5(["-v"]);
	t.is(stdout, pkg.version);
});
