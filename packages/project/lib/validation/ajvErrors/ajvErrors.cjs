/*
 * ajv-errors
 *
 * Version: 3.0.0
 *
 * Author: Evgeny Poberezkin
 * Web: https://github.com/ajv-validator/ajv-errors/tree/7efe8c29c3ea461eef29335e0199742dbc18e791
 * Source: extracted from the npm package tarball (ajv-errors@3.0.0, dist/ajv-errors.js compiled to CJS)
 *         The GitHub repo ships only TypeScript sources; the CJS build is produced by `tsc` and published to npm.
 *         To update: `npm pack ajv-errors@<version>`, extract `dist/ajv-errors.js`, rename to ajvErrors.cjs.
 *
 * Licensed under
 *   MIT License, see "/LICENSES/MIT.txt"
 *
 * Copyright (c) 2017 Evgeny Poberezkin
 *
 */
"use strict";
Object.defineProperty(exports, "__esModule", {value: true});
const ajv_1 = require("ajv");
const codegen_1 = require("ajv/dist/compile/codegen");
const code_1 = require("ajv/dist/compile/codegen/code");
const validate_1 = require("ajv/dist/compile/validate");
const errors_1 = require("ajv/dist/compile/errors");
const names_1 = require("ajv/dist/compile/names");
const keyword = "errorMessage";
const used = new ajv_1.Name("emUsed");
const KEYWORD_PROPERTY_PARAMS = {
	required: "missingProperty",
	dependencies: "property",
	dependentRequired: "property",
};
const INTERPOLATION = /\$\{[^}]+\}/;
const INTERPOLATION_REPLACE = /\$\{([^}]+)\}/g;
const EMPTY_STR = /^""\s*\+\s*|\s*\+\s*""$/g;
function errorMessage(options) {
	return {
		keyword,
		schemaType: ["string", "object"],
		post: true,
		code(cxt) {
			const {gen, data, schema, schemaValue, it} = cxt;
			if (it.createErrors === false) {
				return;
			}
			const sch = schema;
			const instancePath = codegen_1.strConcat(names_1.default.instancePath, it.errorPath);
			gen.if(ajv_1._ `${names_1.default.errors} > 0`, () => {
				if (typeof sch == "object") {
					const [kwdPropErrors, kwdErrors] = keywordErrorsConfig(sch);
					if (kwdErrors) {
						processKeywordErrors(kwdErrors);
					}
					if (kwdPropErrors) {
						processKeywordPropErrors(kwdPropErrors);
					}
					processChildErrors(childErrorsConfig(sch));
				}
				const schMessage = typeof sch == "string" ? sch : sch._;
				if (schMessage) {
					processAllErrors(schMessage);
				}
				if (!options.keepErrors) {
					removeUsedErrors();
				}
			});
			function childErrorsConfig({properties, items}) {
				const errors = {};
				if (properties) {
					errors.props = {};
					for (const p in properties) {
						errors.props[p] = [];
					}
				}
				if (items) {
					errors.items = {};
					for (let i = 0; i < items.length; i++) {
						errors.items[i] = [];
					}
				}
				return errors;
			}
			function keywordErrorsConfig(emSchema) {
				let propErrors;
				let errors;
				for (const k in emSchema) {
					if (k === "properties" || k === "items") {
						continue;
					}
					const kwdSch = emSchema[k];
					if (typeof kwdSch == "object") {
						propErrors || (propErrors = {});
						const errMap = (propErrors[k] = {});
						for (const p in kwdSch) {
							errMap[p] = [];
						}
					} else {
						errors || (errors = {});
						errors[k] = [];
					}
				}
				return [propErrors, errors];
			}
			function processKeywordErrors(kwdErrors) {
				const kwdErrs = gen.const("emErrors", ajv_1.stringify(kwdErrors));
				const templates = gen.const("templates", getTemplatesCode(kwdErrors, schema));
				gen.forOf("err", names_1.default.vErrors, (err) => gen.if(matchKeywordError(err, kwdErrs), () => gen.code(ajv_1._ `${kwdErrs}[${err}.keyword].push(${err})`).assign(ajv_1._ `${err}.${used}`, true)));
				const {singleError} = options;
				if (singleError) {
					const message = gen.let("message", ajv_1._ `""`);
					const paramsErrors = gen.let("paramsErrors", ajv_1._ `[]`);
					loopErrors((key) => {
						gen.if(message, () => gen.code(ajv_1._ `${message} += ${typeof singleError == "string" ? singleError : ";"}`));
						gen.code(ajv_1._ `${message} += ${errMessage(key)}`);
						gen.assign(paramsErrors, ajv_1._ `${paramsErrors}.concat(${kwdErrs}[${key}])`);
					});
					errors_1.reportError(cxt, {message, params: ajv_1._ `{errors: ${paramsErrors}}`});
				} else {
					loopErrors((key) => errors_1.reportError(cxt, {
						message: errMessage(key),
						params: ajv_1._ `{errors: ${kwdErrs}[${key}]}`,
					}));
				}
				function loopErrors(body) {
					gen.forIn("key", kwdErrs, (key) => gen.if(ajv_1._ `${kwdErrs}[${key}].length`, () => body(key)));
				}
				function errMessage(key) {
					return ajv_1._ `${key} in ${templates} ? ${templates}[${key}]() : ${schemaValue}[${key}]`;
				}
			}
			function processKeywordPropErrors(kwdPropErrors) {
				const kwdErrs = gen.const("emErrors", ajv_1.stringify(kwdPropErrors));
				const templatesCode = [];
				for (const k in kwdPropErrors) {
					templatesCode.push([
						k,
						getTemplatesCode(kwdPropErrors[k], schema[k]),
					]);
				}
				const templates = gen.const("templates", gen.object(...templatesCode));
				const kwdPropParams = gen.scopeValue("obj", {
					ref: KEYWORD_PROPERTY_PARAMS,
					code: ajv_1.stringify(KEYWORD_PROPERTY_PARAMS),
				});
				const propParam = gen.let("emPropParams");
				const paramsErrors = gen.let("emParamsErrors");
				gen.forOf("err", names_1.default.vErrors, (err) => gen.if(matchKeywordError(err, kwdErrs), () => {
					gen.assign(propParam, ajv_1._ `${kwdPropParams}[${err}.keyword]`);
					gen.assign(paramsErrors, ajv_1._ `${kwdErrs}[${err}.keyword][${err}.params[${propParam}]]`);
					gen.if(paramsErrors, () => gen.code(ajv_1._ `${paramsErrors}.push(${err})`).assign(ajv_1._ `${err}.${used}`, true));
				}));
				gen.forIn("key", kwdErrs, (key) => gen.forIn("keyProp", ajv_1._ `${kwdErrs}[${key}]`, (keyProp) => {
					gen.assign(paramsErrors, ajv_1._ `${kwdErrs}[${key}][${keyProp}]`);
					gen.if(ajv_1._ `${paramsErrors}.length`, () => {
						const tmpl = gen.const("tmpl", ajv_1._ `${templates}[${key}] && ${templates}[${key}][${keyProp}]`);
						errors_1.reportError(cxt, {
							message: ajv_1._ `${tmpl} ? ${tmpl}() : ${schemaValue}[${key}][${keyProp}]`,
							params: ajv_1._ `{errors: ${paramsErrors}}`,
						});
					});
				}));
			}
			function processChildErrors(childErrors) {
				const {props, items} = childErrors;
				if (!props && !items) {
					return;
				}
				const isObj = ajv_1._ `typeof ${data} == "object"`;
				const isArr = ajv_1._ `Array.isArray(${data})`;
				const childErrs = gen.let("emErrors");
				let childKwd;
				let childProp;
				const templates = gen.let("templates");
				if (props && items) {
					childKwd = gen.let("emChildKwd");
					gen.if(isObj);
					gen.if(isArr, () => {
						init(items, schema.items);
						gen.assign(childKwd, ajv_1.str `items`);
					}, () => {
						init(props, schema.properties);
						gen.assign(childKwd, ajv_1.str `properties`);
					});
					childProp = ajv_1._ `[${childKwd}]`;
				} else if (items) {
					gen.if(isArr);
					init(items, schema.items);
					childProp = ajv_1._ `.items`;
				} else if (props) {
					gen.if(codegen_1.and(isObj, codegen_1.not(isArr)));
					init(props, schema.properties);
					childProp = ajv_1._ `.properties`;
				}
				gen.forOf("err", names_1.default.vErrors, (err) => ifMatchesChildError(err, childErrs, (child) => gen.code(ajv_1._ `${childErrs}[${child}].push(${err})`).assign(ajv_1._ `${err}.${used}`, true)));
				gen.forIn("key", childErrs, (key) => gen.if(ajv_1._ `${childErrs}[${key}].length`, () => {
					errors_1.reportError(cxt, {
						message: ajv_1._ `${key} in ${templates} ? ${templates}[${key}]() : ${schemaValue}${childProp}[${key}]`,
						params: ajv_1._ `{errors: ${childErrs}[${key}]}`,
					});
					gen.assign(ajv_1._ `${names_1.default.vErrors}[${names_1.default.errors}-1].instancePath`, ajv_1._ `${instancePath} + "/" + ${key}.replace(/~/g, "~0").replace(/\\//g, "~1")`);
				}));
				gen.endIf();
				function init(children, msgs) {
					gen.assign(childErrs, ajv_1.stringify(children));
					gen.assign(templates, getTemplatesCode(children, msgs));
				}
			}
			function processAllErrors(schMessage) {
				const errs = gen.const("emErrs", ajv_1._ `[]`);
				gen.forOf("err", names_1.default.vErrors, (err) => gen.if(matchAnyError(err), () => gen.code(ajv_1._ `${errs}.push(${err})`).assign(ajv_1._ `${err}.${used}`, true)));
				gen.if(ajv_1._ `${errs}.length`, () => errors_1.reportError(cxt, {
					message: templateExpr(schMessage),
					params: ajv_1._ `{errors: ${errs}}`,
				}));
			}
			function removeUsedErrors() {
				const errs = gen.const("emErrs", ajv_1._ `[]`);
				gen.forOf("err", names_1.default.vErrors, (err) => gen.if(ajv_1._ `!${err}.${used}`, () => gen.code(ajv_1._ `${errs}.push(${err})`)));
				gen.assign(names_1.default.vErrors, errs).assign(names_1.default.errors, ajv_1._ `${errs}.length`);
			}
			function matchKeywordError(err, kwdErrs) {
				return codegen_1.and(ajv_1._ `${err}.keyword !== ${keyword}`, ajv_1._ `!${err}.${used}`, ajv_1._ `${err}.instancePath === ${instancePath}`, ajv_1._ `${err}.keyword in ${kwdErrs}`,
					// TODO match the end of the string?
					ajv_1._ `${err}.schemaPath.indexOf(${it.errSchemaPath}) === 0`, ajv_1._ `/^\\/[^\\/]*$/.test(${err}.schemaPath.slice(${it.errSchemaPath.length}))`);
			}
			function ifMatchesChildError(err, childErrs, thenBody) {
				gen.if(codegen_1.and(ajv_1._ `${err}.keyword !== ${keyword}`, ajv_1._ `!${err}.${used}`, ajv_1._ `${err}.instancePath.indexOf(${instancePath}) === 0`), () => {
					const childRegex = gen.scopeValue("pattern", {
						ref: /^\/([^/]*)(?:\/|$)/,
						code: ajv_1._ `new RegExp("^\\\/([^/]*)(?:\\\/|$)")`,
					});
					const matches = gen.const("emMatches", ajv_1._ `${childRegex}.exec(${err}.instancePath.slice(${instancePath}.length))`);
					const child = gen.const("emChild", ajv_1._ `${matches} && ${matches}[1].replace(/~1/g, "/").replace(/~0/g, "~")`);
					gen.if(ajv_1._ `${child} !== undefined && ${child} in ${childErrs}`, () => thenBody(child));
				});
			}
			function matchAnyError(err) {
				return codegen_1.and(ajv_1._ `${err}.keyword !== ${keyword}`, ajv_1._ `!${err}.${used}`, codegen_1.or(ajv_1._ `${err}.instancePath === ${instancePath}`, codegen_1.and(ajv_1._ `${err}.instancePath.indexOf(${instancePath}) === 0`, ajv_1._ `${err}.instancePath[${instancePath}.length] === "/"`)), ajv_1._ `${err}.schemaPath.indexOf(${it.errSchemaPath}) === 0`, ajv_1._ `${err}.schemaPath[${it.errSchemaPath}.length] === "/"`);
			}
			function getTemplatesCode(keys, msgs) {
				const templatesCode = [];
				for (const k in keys) {
					const msg = msgs[k];
					if (INTERPOLATION.test(msg)) {
						templatesCode.push([k, templateFunc(msg)]);
					}
				}
				return gen.object(...templatesCode);
			}
			function templateExpr(msg) {
				if (!INTERPOLATION.test(msg)) {
					return ajv_1.stringify(msg);
				}
				return new code_1._Code(code_1.safeStringify(msg)
					.replace(INTERPOLATION_REPLACE, (_s, ptr) => `" + JSON.stringify(${validate_1.getData(ptr, it)}) + "`)
					.replace(EMPTY_STR, ""));
			}
			function templateFunc(msg) {
				return ajv_1._ `function(){return ${templateExpr(msg)}}`;
			}
		},
		metaSchema: {
			anyOf: [
				{type: "string"},
				{
					type: "object",
					properties: {
						properties: {$ref: "#/$defs/stringMap"},
						items: {$ref: "#/$defs/stringList"},
						required: {$ref: "#/$defs/stringOrMap"},
						dependencies: {$ref: "#/$defs/stringOrMap"},
					},
					additionalProperties: {type: "string"},
				},
			],
			$defs: {
				stringMap: {
					type: "object",
					additionalProperties: {type: "string"},
				},
				stringOrMap: {
					anyOf: [{type: "string"}, {$ref: "#/$defs/stringMap"}],
				},
				stringList: {type: "array", items: {type: "string"}},
			},
		},
	};
}
const ajvErrors = (ajv, options = {}) => {
	if (!ajv.opts.allErrors) {
		throw new Error("ajv-errors: Ajv option allErrors must be true");
	}
	if (ajv.opts.jsPropertySyntax) {
		throw new Error("ajv-errors: ajv option jsPropertySyntax is not supported");
	}
	return ajv.addKeyword(errorMessage(options));
};
exports.default = ajvErrors;
module.exports = ajvErrors;
module.exports.default = ajvErrors;
