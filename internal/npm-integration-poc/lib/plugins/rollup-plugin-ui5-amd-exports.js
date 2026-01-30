/**
 * Rollup Plugin: UI5 AMD Exports
 *
 * Transforms Rollup's named exports pattern:
 *   sap.ui.define(['exports'], function(exports) { exports.foo = ...; })
 *
 * Into UI5-compatible pattern:
 *   sap.ui.define([], function() { const exports = {}; ...; return exports; })
 *
 * This is necessary because UI5's sap.ui.define doesn't support the 'exports' dependency.
 */

export default function ui5AmdExportsPlugin() {
	return {
		name: "ui5-amd-exports",
		renderChunk(code) {
			// Pattern: sap.ui.define(['exports'], (function (exports) { 'use strict';
			const exportsPattern = /^(sap\.ui\.define\(\[)'exports'(\],\s*\(function\s*\()(\w+)(\)\s*\{\s*'use strict';)/;
			const match = code.match(exportsPattern);

			if (!match) {
				// No exports dependency, return as-is
				return null;
			}

			// Get the parameter name (usually 'exports', but could be mangled)
			const exportsVarName = match[3];

			// Transform the code:
			// 1. Remove 'exports' from dependencies
			// 2. Remove parameter from function
			// 3. Add const declaration at the start
			// 4. Add return statement at the end

			let transformed = code;

			// Remove 'exports' dependency and parameter, add const declaration
			transformed = transformed.replace(
				exportsPattern,
				`$1$2$4\n\n  const ${exportsVarName} = {};`
			);

			// Add return statement before the closing }));
			const closingPattern = /(\s*)\}\)\);?\s*$/;
			transformed = transformed.replace(closingPattern, `\n$1  return ${exportsVarName};\n$1}));\n`);

			return {code: transformed, map: null};
		}
	};
}
