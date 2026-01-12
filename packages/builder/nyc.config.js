import nycCommonConfig from "../../nyc.common.config.js";

// Exclude jsdoc library files from coverage as they are originally maintained at https://github.com/UI5/openui5/tree/master/lib/jsdoc
nycCommonConfig.exclude.push("lib/processors/jsdoc/lib/**");

export default {
	...nycCommonConfig,
	"statements": 95,
	"branches": 90,
	"functions": 95,
	"lines": 95,
};
