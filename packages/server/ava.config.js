import avaCommonConfig from "../../ava.common.config.js";

export default {
	...avaCommonConfig,
	nodeArguments: [
		...avaCommonConfig.nodeArguments,
		"--import",
		"./test/utils/suppressLog.js"
	]
};
