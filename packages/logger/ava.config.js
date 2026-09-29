import avaCommonConfig from "../../ava.common.config.js";

// The logger tests assert on @ui5/logger's stderr fallback, which only fires when no
// listener is attached to its process events. Drop the suppressLog --import that the
// common config adds, as it would attach exactly those listeners.
const nodeArguments = [];
for (let i = 0; i < avaCommonConfig.nodeArguments.length; i++) {
	const arg = avaCommonConfig.nodeArguments[i];
	if (arg === "--import" && avaCommonConfig.nodeArguments[i + 1]?.endsWith("suppressLog.js")) {
		i++; // Skip both "--import" and the module path
		continue;
	}
	nodeArguments.push(arg);
}

export default {
	...avaCommonConfig,
	nodeArguments,
};
