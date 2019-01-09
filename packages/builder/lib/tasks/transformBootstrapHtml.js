const log = require("@ui5/logger").getLogger("builder:tasks:transformBootstrapHtml");
const bootstrapHtmlTransformer = require("../processors/bootstrapHtmlTransformer");

/**
 * Task for transforming the application bootstrap HTML file.
 *
 * @module builder/tasks/transformBootstrapHtml
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} parameters.options.namespace Project namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, options}) {
	if (!options.namespace) {
		log.warn(`Skipping bootstrap transformation due to missing namespace of project "${options.projectName}".`);
		return;
	}
	const resource = await workspace.byPath(`/resources/${options.namespace}/index.html`);
	if (!resource) {
		log.warn(`Skipping bootstrap transformation due to missing index.html in project "${options.projectName}".`);
		return;
	}
	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "resources/sap-ui-custom.js"
		}
	});
	await Promise.all(processedResources.map((resource) => workspace.write(resource)));
};
