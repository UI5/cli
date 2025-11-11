import js from "@eslint/js";
import globals from "globals";
import google from "eslint-config-google";

export default [{
	ignores: [
		"**/coverage/",
		"test/tmp/",
		"test/expected/",
		"test/fixtures/",
	],
}, js.configs.recommended, google, {
	languageOptions: {
		globals: {
			...globals.node,
		},

		ecmaVersion: 2023,
		sourceType: "module",
	},

	rules: {
		"indent": ["error", "tab"],
		"linebreak-style": ["error", "unix"],

		"quotes": ["error", "double", {
			allowTemplateLiterals: true,
		}],

		"semi": ["error", "always"],
		"no-negated-condition": "off",
		"require-jsdoc": "off",
		"no-mixed-requires": "off",

		"max-len": ["error", {
			code: 160,
			ignoreUrls: true,
			ignoreRegExpLiterals: true,
		}],

		"no-implicit-coercion": [2, {
			allow: ["!!"],
		}],

		"comma-dangle": "off",
		"no-tabs": "off",
		"no-eval": 2,
		// The following rule must be disabled as of ESLint 9.
		// It's removed and causes issues when present
		// https://eslint.org/docs/latest/rules/valid-jsdoc
		"valid-jsdoc": 0,
	},
}
];
