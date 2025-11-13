import commonConfig from "../../eslint.common.config.js";

export default [
	...commonConfig,
	{
		rules: {
			"no-console": "off" // Allow console output in CLI tools
		}
	}
];
