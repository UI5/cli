const path = require("path");
const yazl = require("yazl");
const resourceFactory = require("@ui5/fs").resourceFactory;
const log = require("@ui5/logger").getLogger("builder:processors:bundlers:manifestBundler");

/**
 * Repository to handle i18n resource files
 *
 * @private
 */
class I18nResourceList {
	/**
	 * Constructor
	 */
	constructor() {
		this.propertyFiles = new Map();
	}

	/**
	 * Adds a i18n resource to the repository
	 *
	 * @param {string} directory Path to the i18n resource
	 * @param {module:@ui5/fs.Resource} resource i18n resource
	 */
	add(directory, resource) {
		const normalizedDirectory = path.normalize(directory);
		if (!this.propertyFiles.has(normalizedDirectory)) {
			this.propertyFiles.set(normalizedDirectory, [resource]);
		} else {
			this.propertyFiles.get(normalizedDirectory).push(resource);
		}
	}

	/**
	 * Gets all registered i18n files within the provided path
	 *
	 * @param {string} directory Path to search for
	 * @returns {Array} Array of resources files
	 */
	get(directory) {
		return this.propertyFiles.get(path.normalize(directory)) || [];
	}
}

/**
 * Creates a manifest bundle from the provided resources.
 *
 * @alias module:@ui5/builder.processors.manifestBundler
 * @public
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @param {object} parameters.options Options
 * @param {string} parameters.options.namespace Namespace of the project
 * @param {string} parameters.options.bundleName Name of the bundled zip file
 * @param {string} parameters.options.propertiesExtension Extension name of the properties files, e.g. ".properties"
 * @param {string} parameters.options.descriptor Descriptor name
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with manifest bundle resources
 */
module.exports = ({resources, options}) => {
	function getDescriptorI18nInfo(manifest) {
		const content = JSON.parse(manifest.content);
		let i18nFullPath = content["sap.app"]["i18n"];
		// i18n section in sap.app can be either a string or an object with bundleUrl
		if (typeof i18nFullPath === "object") {
			i18nFullPath = i18nFullPath.bundleUrl;
		}
		if (!i18nFullPath) {
			i18nFullPath = "i18n/i18n.properties";
		}
		return {
			path: path.join(path.dirname(manifest.path), path.dirname(i18nFullPath)),
			rootName: path.basename(i18nFullPath, options.propertiesExtension)
		};
	}

	return Promise.all(resources.map((resource) =>
		resource.getBuffer().then((content) => {
			const basename = path.basename(resource.getPath());
			return {
				name: basename,
				isManifest: basename === options.descriptor,
				path: resource.getPath(),
				content: content
			};
		})
	)).then((resources) => {
		const archiveContent = new Map();
		const descriptorI18nInfos = new Map();
		const i18nResourceList = new I18nResourceList();

		resources.forEach((resource) => {
			if (resource.isManifest) {
				const descriptorI18nInfo = getDescriptorI18nInfo(resource);
				descriptorI18nInfos.set(descriptorI18nInfo.path, descriptorI18nInfo.rootName);
				archiveContent.set(resource.path, resource.content);
			} else {
				const directory = path.dirname(resource.path);
				i18nResourceList.add(directory, resource);
			}
		});

		descriptorI18nInfos.forEach((rootName, directory) => {
			i18nResourceList.get(directory)
				.filter((resource) => resource.name.startsWith(rootName))
				.forEach((resource) => archiveContent.set(resource.path, resource.content));
		});

		return archiveContent;
	}).then((archiveContent) => new Promise((resolve) => {
		const zip = new yazl.ZipFile();
		const rBasePath = new RegExp(`^/resources/${options.namespace}/`);
		archiveContent.forEach((content, path) => {
			if (!rBasePath.test(path)) {
				log.verbose(`Not bundling resource with path ${path} since it is not based on path ` +
					`/resources/${options.namespace}/`);
				return;
			}
			// Remove base path. Absolute paths are not allowed in ZIP files
			const normalizedPath = path.replace(rBasePath, "");
			zip.addBuffer(content, normalizedPath);
		});
		zip.end();

		const pathPrefix = "/resources/" + options.namespace + "/";
		const res = resourceFactory.createResource({
			path: pathPrefix + options.bundleName,
			stream: zip.outputStream
		});
		resolve([res]);
	}));
};
