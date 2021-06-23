const crypto = require("crypto");
const resourceFactory = require("@ui5/fs").resourceFactory;
const log = require("@ui5/logger").getLogger("builder:tasks:generateCachebusterInfo");

async function signByTime(resource) {
	return resource.getStatInfo().mtime.getTime();
}

async function signByHash(resource) {
	const hasher = crypto.createHash("sha1");
	const buffer = await resource.getBuffer();

	hasher.update(buffer.toString("binary"));
	return hasher.digest("hex");
}

function getSigner(type) {
	type = type || "time";

	switch (type) {
	case "time":
		return signByTime;
	case "hash":
		return signByHash;

	default:
		throw new Error(`Invalid signature type: '${type}'. Valid ones are: 'time' or 'hash'`);
	}
}

/**
 * Task to generate the application cachebuster info file.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateCachebusterInfo
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.namespace Namespace of the application
 * @param {string} [parameters.options.signatureType='time'] Type of signature to be used ('time' or 'hash')
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options: {namespace, signatureType}}) {
	const basePath = `/resources/${namespace}/`;
	return workspace.byGlob(`/resources/${namespace}/**/*`)
		.then(async (resources) => {
			const cachebusterInfo = {};
			const signer = getSigner(signatureType);

			await Promise.all(resources.map(async (resource) => {
				let resourcePath = resource.getPath();
				if (!resourcePath.startsWith(basePath)) {
					log.verbose(
						`Ignoring resource with path ${resourcePath} since it is not based on path ${basePath}`);
					return;
				}
				// Remove base path. Absolute paths are not allowed in cachebuster info
				resourcePath = resourcePath.replace(basePath, "");
				cachebusterInfo[resourcePath] = await signer(resource);
			}));
			const cachebusterInfoResource = resourceFactory.createResource({
				path: `/resources/${namespace}/sap-ui-cachebuster-info.json`,
				string: JSON.stringify(cachebusterInfo, null, 2)
			});
			return workspace.write(cachebusterInfoResource);
		});
};
