import path from "node:path";
import {fileURLToPath} from "node:url";
import avaCommonConfig from "../../ava.common.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
	...avaCommonConfig,
	environmentVariables: {
		...avaCommonConfig.environmentVariables,
		UI5_DATA_DIR: path.join(__dirname, "test", "tmp", ".ui5-data"),
	},
};
