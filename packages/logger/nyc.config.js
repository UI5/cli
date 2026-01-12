import nycCommonConfig from "../../nyc.common.config.js";

export default {
	...nycCommonConfig,
	"statements": 100,
	"branches": 100,
	"functions": 100,
	"lines": 100,
};
