import globals from "globals";
import eslintCommonConfig from "../../eslint.common.config.js";

export default [
	...eslintCommonConfig, // Load common ESLint config
	{
		// Add project-specific ESLint config rules here
		// in order to override common config
		ignores: [
			"lib/middleware/testRunner/",
		]
	},
	{
		// Live reload client script runs in the browser, not Node.js
		files: ["lib/liveReload/client.js"],
		languageOptions: {
			globals: {
				...globals.browser,
			},
			sourceType: "script",
			// Specifically setting the ecmaVersion here, in alignment with current UI5 browser support,
			// to allow independent changes of the common config without affecting the browser code.
			ecmaVersion: 2023,
		}
	}
];
