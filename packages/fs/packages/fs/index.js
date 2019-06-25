/**
 * @module @ui5/fs
 * @public
 */
const modules = {
	/**
	 * @public
	 * @see module:@ui5/fs.adapters.AbstractAdapter
	 * @see module:@ui5/fs.adapters.FileSystem
	 * @see module:@ui5/fs.adapters.Memory
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

function exportModules(exportRoot, modulePaths) {
	for (const moduleName in modulePaths) {
		if (modulePaths.hasOwnProperty(moduleName)) {
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
