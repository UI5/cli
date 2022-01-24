const test = require("ava");
const {parseJS, Syntax} = require("../../../../lib/lbt/utils/parseUtils");

test("invalid options", (t) => {
	t.throws(function() {
		parseJS("var x;", {foobar: true});
	}, {
		message: /Allowed parser options are/
	});
});

test("Syntax export", (t) => {
	t.deepEqual(Syntax, require("espree").Syntax, "Syntax is a 1:1 export of the espree export with the same name");
});

test("successful parse step", (t) => {
	const ast = parseJS("var x;");
	t.true(ast != null && typeof ast === "object");
	t.is(ast.type, "Program");
});

test("successful parse step (ES2021 features)", (t) => {
	const ast = parseJS("const x = 1_000_000_000;"); // numeric separators
	t.true(ast != null && typeof ast === "object");
	t.is(ast.type, "Program");
});
