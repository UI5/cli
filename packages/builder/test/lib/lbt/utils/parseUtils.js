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

test("successful parse step (ES2022 features)", (t) => {
	const ast = parseJS("class X { #foo; }"); // Private class field
	t.true(ast != null && typeof ast === "object");
	t.is(ast.type, "Program");
});

test("ES2023: Hashbang", (t) => {
	// espree is able to parse the code without setting option 'comment' to true.
	// However, the comment will only be present in the AST by setting the option to true, which ensures better testing.
	const ast = parseJS(`#!/usr/bin/env node
const foo="Bar";`, {comment: true}); // Hashbang
	t.true(ast != null && typeof ast === "object");
	t.is(ast.type, "Program");
	t.is(ast.comments.length, 1);
	t.is(ast.comments[0].type, "Hashbang");
	t.is(ast.comments[0].value, "/usr/bin/env node");
});
