/**
 * @module @ui5/fs
 * @public
 */
module.exports = {
	/**
	 * @public
	 * @see module:@ui5/fs.adapters.AbstractAdapter
	 * @see module:@ui5/fs.adapters.FileSystem
	 * @see module:@ui5/fs.adapters.Memory
	 */
	adapters: {
		AbstractAdapter: require("./lib/adapters/AbstractAdapter"),
		FileSystem: require("./lib/adapters/FileSystem"),
		Memory: require("./lib/adapters/Memory")
	},
	AbstractReader: require("./lib/AbstractReader"),
	AbstractReaderWriter: require("./lib/AbstractReaderWriter"),
	DuplexCollection: require("./lib/DuplexCollection"),
	fsInterface: require("./lib/fsInterface"),
	ReaderCollection: require("./lib/ReaderCollection"),
	ReaderCollectionPrioritized: require("./lib/ReaderCollectionPrioritized"),
	Resource: require("./lib/Resource"),
	resourceFactory: require("./lib/resourceFactory")
};
