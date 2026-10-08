import nycCommonConfig from "../../nyc.common.config.js";

export default {
	...nycCommonConfig,
	"exclude": [
		...nycCommonConfig.exclude,
		// Vendored third-party code (ajv-errors@3.0.0), not tested in this repo
		"lib/validation/ajvErrors/**",
	],
	"statements": 95,
	"branches": 90,
	"functions": 95,
	"lines": 95,
};
