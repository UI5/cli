
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:resourceListCreator");
import ResourceCollector from "../lbt/resources/ResourceCollector.js";
import LocatorResourcePool from "../lbt/resources/LocatorResourcePool.js";
import ResourceInfo from "../lbt/resources/ResourceInfo.js";
import Resource from "@ui5/fs/Resource";


/**
 * List of resource patterns that describe all debug resources.
 *
 * @since 1.29.1
 */
const DEFAULT_DEBUG_RESOURCES_FILTER = [
	"**/*-dbg.js",
	"**/*-dbg.controller.js",
	"**/*-dbg.designtime.js",
	"**/*-dbg.support.js",
	"**/*-dbg.view.js",
	"**/*-dbg.fragment.js",
	"**/*-dbg.css",
	"**/*.js.map"
];

/**
 * List of resource patterns that describe bundled resources.
 *
 * @since 1.29.1
 */
const DEFAULT_BUNDLE_RESOURCES_FILTER = [
	"**/Component-preload.js",
	"**/library-preload.js",
	"**/library-preload-dbg.js",
	"**/library-preload.json",
	"**/library-h2-preload.js",
	"**/designtime/library-preload.designtime.js",
	"**/library-preload.support.js",
	"**/library-all.js",
	"**/library-all-dbg.js"
];

/**
 * List of resource patterns that describe all designtime resources.
 *
 * @since 1.31.0
 */
const DEFAULT_DESIGNTIME_RESOURCES_FILTER = [
	"**/designtime/*",
	"**/*.designtime.js",
	"**/*.control",
	"**/*.interface",
	"**/*.type",
	"**/themes/*/*.less",
	"**/library.templates.xml",
	"**/library.dependencies.xml",
	"**/library.dependencies.json"
];

/**
 * List of resource patterns that describe all support (assistant) resources.
 *
 * @since 1.53.0
 */
const DEFAULT_SUPPORT_RESOURCES_FILTER = [
	"**/*.support.js"
];

/**
 * Creates and adds resources.json entry (itself) to the list.
 *
 * Retrieves the string content of the overall result and returns it.
 *
 * @param {ResourceInfoList} list resources list
 * @param {string} prefix
 * @returns {string} new content with resources.json entry
 */
function makeResourcesJSON(list, prefix) {
	// having the file size entry part of the file is a bit like the chicken egg scenario
	// you can't change the value of the file size without changing the file size
	// so this part here tries to cope with that.

	// try to add resources.json entry with previous size of the list string.
	// get the content to be added (resources.json entry)
	// modify the size of the entry from the calculated one

	let contentString = JSON.stringify(list, null, "\t");
	const resourcesJson = new ResourceInfo(prefix + "resources.json");
	// initial size
	resourcesJson.size = Buffer.from(contentString).byteLength;
	list.add(resourcesJson);

	contentString = JSON.stringify(list, null, "\t");

	let newLength = Buffer.from(contentString).byteLength;

	// Adjust size until it is correct
	// This entry's size depends on the file size which depends on this entry's size,...
	// Updating the number of the size in the content might influence the size of the file itself
	// This is deterministic because e.g. in the content -> <code>"size": 1000</code> has the same
	// amount of bytes as <code>"size": 9999</code> the difference might only come for:
	// * adding the initial entry of resources.json
	// * changes when the number of digits of the number changes, e.g. 100 -> 1000
	while (resourcesJson.size !== newLength) {
		resourcesJson.size = newLength;
		list.add(resourcesJson);
		contentString = JSON.stringify(list, null, "\t");
		newLength = Buffer.from(contentString).byteLength;
	}
	return contentString;
}

/**
 * Creates resources.json files
 *
 * @private
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of resources
 * @param {@ui5/fs/Resource[]} [parameters.dependencyResources=[]] List of dependency resources
 * @param {object} [parameters.options] Options
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with the resources.json resources
 */
export default async function({resources, dependencyResources = [], options}) {
	options = Object.assign({
		failOnOrphans: false,
		externalResources: undefined,
		debugResources: DEFAULT_DEBUG_RESOURCES_FILTER,
		mergedResources: DEFAULT_BUNDLE_RESOURCES_FILTER,
		designtimeResources: DEFAULT_DESIGNTIME_RESOURCES_FILTER,
		supportResources: DEFAULT_SUPPORT_RESOURCES_FILTER
	}, options);

	const pool = new LocatorResourcePool();
	await pool.prepare( resources );
	await pool.prepare( dependencyResources );

	const collector = new ResourceCollector(pool);
	const visitPromises = resources.map((resource) => collector.visitResource(resource));

	await Promise.all(visitPromises);
	log.verbose(`	Found ${collector.resources.size} resources`);

	// determine additional information for the found resources
	if ( options && options.externalResources ) {
		collector.setExternalResources(options.externalResources);
	}

	await collector.determineResourceDetails({
		debugResources: options.debugResources,
		mergedResources: options.mergedResources,
		designtimeResources: options.designtimeResources,
		supportResources: options.supportResources
	});

	// group resources by components and create ResourceInfoLists
	collector.groupResourcesByComponents();

	const resourceLists = [];

	// write out resources.json files
	for (const [prefix, list] of collector.components.entries()) {
		log.verbose(`	Writing '${prefix}resources.json'`);

		const contentString = makeResourcesJSON(list, prefix);

		resourceLists.push(new Resource({
			path: `/resources/${prefix}resources.json`,
			string: contentString
		}));
	}
	for (const [prefix, list] of collector.themePackages.entries()) {
		log.verbose(`	Writing '${prefix}resources.json'`);

		const contentString = makeResourcesJSON(list, prefix);

		resourceLists.push(new Resource({
			path: `/resources/${prefix}resources.json`,
			string: contentString
		}));
	}
	const unassigned = collector.resources;
	if ( unassigned.size > 0 && options.failOnOrphans ) {
		log.error(`resources.json generation failed because of unassigned resources: ${[...unassigned].join(", ")}`);
		throw new Error(
			`resources.json generation failed with error: There are ${unassigned.size} ` +
			`resources which could not be assigned to components.`);
	}

	return resourceLists;
}
