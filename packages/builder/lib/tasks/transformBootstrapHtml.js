import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:transformBootstrapHtml");
import bootstrapHtmlTransformer from "../processors/bootstrapHtmlTransformer.js";

/* eslint "jsdoc/check-param-names": ["error", {"disableExtraPropertyReporting":true}] */
/**
 * Task for transforming the application bootstrap HTML file.
 *
 * @module builder/tasks/transformBootstrapHtml
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} [parameters.options.namespace] Project namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, options}) {
	const {projectName} = options;
	// Backward compatibility: "namespace" option got renamed to "projectNamespace"
	const namespace = options.projectNamespace || options.namespace;

	let indexPath;
	if (namespace) {
		indexPath = `/resources/${namespace}/index.html`;
	} else {
		indexPath = "/index.html";
	}
	const resource = await workspace.byPath(indexPath);
	if (!resource) {
		log.warn(`Skipping bootstrap transformation due to missing index.html in project "${projectName}".`);
		return;
	}
	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "resources/sap-ui-custom.js"
		}
	});
	await Promise.all(processedResources.map((resource) => workspace.write(resource)));
}
