import baseConfig from "../../eslint.common.config.js";

export default [
	...baseConfig,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				sap: "readonly"
			}
		},
		rules: {
			"no-console": "off", // This is a PoC/internal tool, console is expected
			"prefer-rest-params": "off" // UI5 controllers use arguments object
		}
	}
];
