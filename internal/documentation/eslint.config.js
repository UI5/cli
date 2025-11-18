import eslintCommonConfig from "../../eslint.common.config.js";

export default [
	{
		// Ignore VitePress generated files and build output
		ignores: [
			"dist/",
			".vitepress/",
			"jsdoc/"
		]
	},
	...eslintCommonConfig, // Load common ESLint config
	{
		// Documentation-specific overrides
		rules: {
			"no-console": "off", // Allow console in documentation scripts
		}
	}
];
