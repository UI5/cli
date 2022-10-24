import test from "ava";
import {Syntax as EspreeSyntax, VisitorKeys as EspreeVisitorKeys} from "espree";
import {parseJS, Syntax, VisitorKeys} from "../../../../lib/lbt/utils/parseUtils.js";

test("invalid options", (t) => {
	t.throws(function() {
		parseJS("var x;", {foobar: true});
	}, {
		message: /Allowed parser options are/
	});
});

test("Syntax export", (t) => {
	t.is(Syntax, EspreeSyntax, "Syntax is a 1:1 export of the espree export with the same name");
});

test("VisitorKeys export", (t) => {
	t.is(VisitorKeys, EspreeVisitorKeys, "VisitorKeys is a 1:1 export of the espree export with the same name");
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
