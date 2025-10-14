import eslintCommonConfig from "../../eslint.common.config.js";

export default [
	...eslintCommonConfig, // Load common ESLint config
	{
		files: ["bin/ui5.cjs"],

		languageOptions: {
			globals: {},
			ecmaVersion: 2020,
			sourceType: "commonjs",
		},
	},
];
