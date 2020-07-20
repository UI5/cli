/**
 * @module @ui5/fs
 * @public
 */
module.exports = {
	/**
	 * @public
	 * @alias module:@ui5/fs.adapters
	 * @namespace
	 */
	adapters: {
		/**
		 * @type {typeof import('./lib/adapters/AbstractAdapter')}
		 */
		AbstractAdapter: "./lib/adapters/AbstractAdapter",
		/**
		 * @type {typeof import('./lib/adapters/FileSystem')}
		 */
		FileSystem: "./lib/adapters/FileSystem",
		/**
		 * @type {typeof import('./lib/adapters/Memory')}
		 */
		Memory: "./lib/adapters/Memory"
	},
	/**
	 * @type {typeof import('./lib/AbstractReader')}
	 */
	AbstractReader: "./lib/AbstractReader",
	/**
	 * @type {typeof import('./lib/AbstractReaderWriter')}
	 */
	AbstractReaderWriter: "./lib/AbstractReaderWriter",
	/**
	 * @type {typeof import('./lib/DuplexCollection')}
	 */
	DuplexCollection: "./lib/DuplexCollection",
	/**
	 * @type {import('./lib/fsInterface')}
	 */
	fsInterface: "./lib/fsInterface",
	/**
	 * @type {typeof import('./lib/ReaderCollection')}
	 */
	ReaderCollection: "./lib/ReaderCollection",
	/**
	 * @type {typeof import('./lib/ReaderCollectionPrioritized')}
	 */
	ReaderCollectionPrioritized: "./lib/ReaderCollectionPrioritized",
	/**
	 * @type {typeof import('./lib/Resource')}
	 */
	Resource: "./lib/Resource",
	/**
	 * @type {typeof import('./lib/ResourceTagCollection')}
	 */
	ResourceTagCollection: "./lib/ResourceTagCollection",
	/**
	 * @type {import('./lib/resourceFactory')}
	 */
	resourceFactory: "./lib/resourceFactory"
};

function exportModules(exportRoot, modulePaths) {
	for (const moduleName of Object.keys(modulePaths)) {
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

exportModules(module.exports, JSON.parse(JSON.stringify(module.exports)));
