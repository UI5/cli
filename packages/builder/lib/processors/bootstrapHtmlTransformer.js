import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:bootstrapHtmlTransformer");
import cheerio from "cheerio";

/**
 * @module @ui5/builder/processors/bootstrapHtmlTransformer
 */

/**
 * Transforms the UI5 bootstrap of a HTML resource files.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of resources to be processed
 * @param {object} parameters.options Options
 * @param {string} parameters.options.src Bootstrap "src" that should be used
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with the cloned resources
 */
export default function({resources, options: {src}}) {
	async function processResource(resource) {
		const content = await resource.getString();
		const $ = cheerio.load(content);
		const bootstrapScript = $("script#sap-ui-bootstrap");
		if (bootstrapScript.length === 1) {
			bootstrapScript.attr("src", src);
			resource.setString($.html());
		} else if (bootstrapScript.length > 1) {
			log.warn("Skipping bootstrap transformation. " +
				"Found multiple bootstrap script tags with id=sap-ui-bootstrap.");
		} else {
			log.warn("Skipping bootstrap transformation. " +
				"Could not find bootstrap script tag with id=sap-ui-bootstrap.");
		}
		return resource;
	}

	return Promise.all(resources.map(processResource));
}
