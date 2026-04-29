import eslintCommonConfig from "../../eslint.common.config.js";

export default [
	{
		// Ignore test files and build output
		ignores: [
			"tmp/",
			"fixtures/",
		]
	},
	...eslintCommonConfig, // Load common ESLint config
];
