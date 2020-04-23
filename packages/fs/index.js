/**
 * @module @ui5/fs
 * @public
 */
const modules = {
	/**
	 * @public
	 * @alias module:@ui5/fs.adapters
	 * @namespace
	 */
	adapters: {
		AbstractAdapter: "./lib/adapters/AbstractAdapter",
		FileSystem: "./lib/adapters/FileSystem",
		Memory: "./lib/adapters/Memory"
	},
	AbstractReader: "./lib/AbstractReader",
	AbstractReaderWriter: "./lib/AbstractReaderWriter",
	DuplexCollection: "./lib/DuplexCollection",
	fsInterface: "./lib/fsInterface",
	ReaderCollection: "./lib/ReaderCollection",
	ReaderCollectionPrioritized: "./lib/ReaderCollectionPrioritized",
	Resource: "./lib/Resource",
	resourceFactory: "./lib/resourceFactory"
};

const hasOwnProperty = Object.prototype.hasOwnProperty;
function exportModules(exportRoot, modulePaths) {
	for (const moduleName in modulePaths) {
		if (hasOwnProperty.call(modulePaths, moduleName)) {
			if (typeof modulePaths[moduleName] === "object") {
				exportRoot[moduleName] = {};
				exportModules(exportRoot[moduleName], modulePaths[moduleName]);
			} else {
				Object.defineProperty(exportRoot, moduleName, {
					get() {
						return require(modulePaths[moduleName]);
					}
				});
			}
		}
	}
}

exportModules(module.exports, modules);
