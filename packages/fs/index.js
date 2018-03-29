const ui5Fs = {
	AbstractAdapter: require("./lib/adapters/AbstractAdapter"),
	FileSystem: require("./lib/adapters/FileSystem"),
	Memory: require("./lib/adapters/Memory"),
	AbstractReader: require("./lib/AbstractReader"),
	AbstractReaderWriter: require("./lib/AbstractReaderWriter"),
	DuplexCollection: require("./lib/DuplexCollection"),
	fsInterface: require("./lib/fsInterface"),
	ReaderCollection: require("./lib/ReaderCollection"),
	ReaderCollectionPrioritized: require("./lib/ReaderCollectionPrioritized"),
	Resource: require("./lib/Resource"),
	resourceFactory: require("./lib/resourceFactory")
};

module.exports = ui5Fs;
