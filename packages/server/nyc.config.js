import nycCommonConfig from "../../nyc.common.config.js";

// Tested via vm.runInContext (test/lib/server/liveReloadClient.integration.js), so nyc does not track coverage.
nycCommonConfig.exclude.push("lib/liveReload/client.js");

export default {
	...nycCommonConfig,
	"statements": 90,
	"branches": 85,
	"functions": 95,
	"lines": 90,
};
