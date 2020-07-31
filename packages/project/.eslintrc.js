module.exports = {
	"env": {
		"node": true,
		"es6": true
	},
	"parserOptions": {
		"ecmaVersion": 8
	},
	"extends": ["eslint:recommended", "google"],
	"plugins": [
		"jsdoc"
	],
	"rules": {
		"indent": [
			"error",
			"tab"
		],
		"linebreak-style": [
			"error",
			"unix"
		],
		"quotes": [
			"error",
			"double",
			{"allowTemplateLiterals": true}
		],
		"semi": [
			"error",
			"always"
		],
		"no-negated-condition": "off",
		"require-jsdoc": "off",
		"no-mixed-requires": "off",
		"max-len": ["warn", 120],
		"no-implicit-coercion": [
			2,
			{"allow": ["!!"]}
		],
		"comma-dangle": "off",
		"no-tabs": "off",
		"valid-jsdoc": 0,
		// jsdoc/check-examples is temporarily set to "warn" as the rule causes issues in our CI
		// See: https://github.com/gajus/eslint-plugin-jsdoc/issues/508
		"jsdoc/check-examples": 1,
		"jsdoc/check-param-names": 2,
		"jsdoc/check-tag-names": 2,
		"jsdoc/check-types": 2,
		"jsdoc/newline-after-description": 2,
		"jsdoc/no-undefined-types": 0,
		"jsdoc/require-description": 0,
		"jsdoc/require-description-complete-sentence": 0,
		"jsdoc/require-example": 0,
		"jsdoc/require-hyphen-before-param-description": 0,
		"jsdoc/require-param": 2,
		"jsdoc/require-param-description": 0,
		"jsdoc/require-param-name": 2,
		"jsdoc/require-param-type": 2,
		"jsdoc/require-returns": 0,
		"jsdoc/require-returns-description": 0,
		"jsdoc/require-returns-type": 2,
		"jsdoc/valid-types": 0
	},
	"settings": {
		"jsdoc": {
			"tagNamePreference": {
				"return": "returns"
			}
		}
	},
	"root": true
};
