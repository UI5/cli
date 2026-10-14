import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:transformBootstrapHtml");
import bootstrapHtmlTransformer from "../processors/bootstrapHtmlTransformer.js";

/**
 * Task for transforming the application bootstrap HTML file.
 *
 * @module builder/tasks/transformBootstrapHtml
 * @returns {object} The task descriptor
 */
export default function() {
	return {task};
}

/**
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} [parameters.options.projectNamespace] Project namespace
 * @returns {Promise<undefined>} Promise resolving once the bootstrap HTML has been transformed
 */
async function task({workspace, options: {projectName, projectNamespace}}) {
	let indexPath;
	if (projectNamespace) {
		indexPath = `/resources/${projectNamespace}/index.html`;
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
