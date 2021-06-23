const posixPath = require("path").posix;
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
		const normalizedDirectory = posixPath.normalize(directory);
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
		return this.propertyFiles.get(posixPath.normalize(directory)) || [];
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
module.exports = ({resources, options: {namespace, bundleName, propertiesExtension, descriptor}}) => {
	function bundleNameToUrl(bundleName, appId) {
		if (!bundleName.startsWith(appId)) {
			return null;
		}
		const relativeBundleName = bundleName.substring(appId.length + 1);
		return relativeBundleName.replace(/\./g, "/") + propertiesExtension;
	}

	function addDescriptorI18nInfos(descriptorI18nInfos, manifest) {
		function addI18nInfo(i18nPath) {
			if (i18nPath.startsWith("ui5:")) {
				log.warn(`Using the ui5:// protocol for i18n bundles is currently not supported ('${i18nPath}' in ${manifest.path})`);
				return;
			}
			descriptorI18nInfos.set(
				posixPath.join(posixPath.dirname(manifest.path), posixPath.dirname(i18nPath)),
				posixPath.basename(i18nPath, propertiesExtension)
			);
		}

		const content = JSON.parse(manifest.content);
		const appI18n = content["sap.app"]["i18n"];
		let bundleUrl;
		// i18n section in sap.app can be either a string or an object with bundleUrl
		if (typeof appI18n === "object") {
			if (appI18n.bundleUrl) {
				bundleUrl = appI18n.bundleUrl;
			} else if (appI18n.bundleName) {
				bundleUrl = bundleNameToUrl(appI18n.bundleName, content["sap.app"]["id"]);
			}
		} else if (typeof appI18n === "string") {
			bundleUrl = appI18n;
		} else {
			bundleUrl = "i18n/i18n.properties";
		}
		if (bundleUrl) {
			addI18nInfo(bundleUrl);
		}

		if (typeof appI18n === "object" && Array.isArray(appI18n.enhanceWith)) {
			appI18n.enhanceWith.forEach((enhanceWithEntry) => {
				let bundleUrl;
				if (enhanceWithEntry.bundleUrl) {
					bundleUrl = enhanceWithEntry.bundleUrl;
				} else if (enhanceWithEntry.bundleName) {
					bundleUrl = bundleNameToUrl(enhanceWithEntry.bundleName, content["sap.app"]["id"]);
				}
				if (bundleUrl) {
					addI18nInfo(bundleUrl);
				}
			});
		}
	}

	return Promise.all(resources.map((resource) =>
		resource.getBuffer().then((content) => {
			const basename = posixPath.basename(resource.getPath());
			return {
				name: basename,
				isManifest: basename === descriptor,
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
				addDescriptorI18nInfos(descriptorI18nInfos, resource);
				archiveContent.set(resource.path, resource.content);
			} else {
				const directory = posixPath.dirname(resource.path);
				i18nResourceList.add(directory, resource);
			}
		});

		descriptorI18nInfos.forEach((rootName, directory) => {
			const i18nResources = i18nResourceList.get(directory)
				.filter((resource) => resource.name.startsWith(rootName));

			if (i18nResources.length) {
				i18nResources.forEach((resource) => archiveContent.set(resource.path, resource.content));
			} else {
				log.warn(`Could not find any resources for i18n bundle '${directory}'`);
			}
		});

		return archiveContent;
	}).then((archiveContent) => new Promise((resolve) => {
		const zip = new yazl.ZipFile();
		const basePath = `/resources/${namespace}/`;
		archiveContent.forEach((content, path) => {
			if (!path.startsWith(basePath)) {
				log.verbose(`Not bundling resource with path ${path} since it is not based on path ${basePath}`);
				return;
			}
			// Remove base path. Absolute paths are not allowed in ZIP files
			const normalizedPath = path.replace(basePath, "");
			zip.addBuffer(content, normalizedPath);
		});
		zip.end();

		const pathPrefix = "/resources/" + namespace + "/";
		const res = resourceFactory.createResource({
			path: pathPrefix + bundleName,
			stream: zip.outputStream
		});
		resolve([res]);
	}));
};
