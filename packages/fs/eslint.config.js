import eslintCommonConfig from "../../eslint.common.config.js";

export default [
	...eslintCommonConfig, // Load common ESLint config
	{
		// Add project-specific ESLint config rules here
		// in order to override common config
	}
];
