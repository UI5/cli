import nycCommonConfig from "../../nyc.common.config.js";

// Exclude TestRunner files from coverage as they are originally maintained at https://github.com/UI5/openui5/tree/master/src/sap.ui.core/test/sap/ui/qunit
nycCommonConfig.exclude.push("lib/middleware/testRunner/TestRunner.js");

export default {
	...nycCommonConfig,
	"statements": 90,
	"branches": 85,
	"functions": 95,
	"lines": 90,
};
