import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:versionInfoGenerator");
import {createResource} from "@ui5/fs/resourceFactory";
import posixPath from "node:path/posix";
import parseJSON from "../utils/json.js";

/**
 * @public
 * @module @ui5/builder/processors/versionInfoGenerator
 */

function pad(v) {
	return String(v).padStart(2, "0");
}
function getTimestamp() {
	const date = new Date();
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	// yyyyMMddHHmm
	return year + month + day + hours + minutes;
}

/**
 * Manifest libraries as defined in the manifest.json file
 *
 * @typedef {Object<string, {lazy: boolean}>} ManifestLibraries
 *
 * sample:
 * ```json
 * {
 * 	"sap.chart": {
 * 		"lazy": true
 * 	},
 * 	"sap.f": { }
 * }
 * ```
 */

/**
 * Extracted information from a manifest's <code>sap.app</code> and <code>sap.ui5</code> sections.
 *
 * @typedef {object} ManifestInfo
 *
 * @property {string} id The library name, e.g. "lib.x"
 * @property {string} embeddedBy the library this component is embedded in, e.g. "lib.x"
 * @property {string[]} embeds the embedded component names, e.g. ["lib.x.sub"]
 * @property {module:@ui5/builder/processors/versionInfoGenerator~ManifestLibraries} libs the dependencies, e.g.
 * 				{"sap.chart":{"lazy": true}, "sap.f":{}}
 */


/**
 * Processes manifest resource and extracts information.
 *
 * @param {@ui5/fs/Resource} manifestResource
 * @returns {Promise<module:@ui5/builder/processors/versionInfoGenerator~ManifestInfo>}
 */
const processManifest = async (manifestResource) => {
	const manifestContent = await manifestResource.getString();
	const manifestObject = parseJSON(manifestContent, manifestResource.getPath());
	const manifestInfo = Object.create(null);

	// sap.ui5/dependencies is used for the "manifestHints/libs"
	if (manifestObject["sap.ui5"]) {
		const manifestDependencies = manifestObject["sap.ui5"]["dependencies"];
		if (manifestDependencies && manifestDependencies.libs) {
			const libs = Object.create(null);
			for (const [libKey, libValue] of Object.entries(manifestDependencies.libs)) {
				libs[libKey] = Object.create(null);
				if (libValue.lazy) {
					libs[libKey].lazy = true;
				}
			}
			manifestInfo.libs = libs;
		}
	}

	// sap.app/embeds, sap.app/embeddedBy and sap.app/id is used for "components"
	if (manifestObject["sap.app"]) {
		const manifestEmbeds = manifestObject["sap.app"]["embeds"];
		manifestInfo.embeds = manifestEmbeds;

		const manifestEmbeddedBy = manifestObject["sap.app"]["embeddedBy"];
		manifestInfo.embeddedBy = manifestEmbeddedBy;

		const id = manifestObject["sap.app"]["id"];
		manifestInfo.id = id;
	}
	return manifestInfo;
};

/**
 * Checks if a component (componentPath) is bundled with the library (embeddedBy)
 *
 * @param {string} embeddedBy e.g. "../"
 * @param {string} componentPath e.g. "lib/x/sub"
 * @param {string} libraryPathPrefix e.g. "lib/x"
 * @returns {boolean} whether or not this component is bundled with the library
 */
const isBundledWithLibrary = (embeddedBy, componentPath, libraryPathPrefix) => {
	if (typeof embeddedBy === "undefined") {
		log.verbose(`  Component '${componentPath}' doesn't declare 'sap.app/embeddedBy', don't list it as 'embedded'`);
		return false;
	}
	if (typeof embeddedBy !== "string") {
		log.error(
			`  Component '${componentPath}': property 'sap.app/embeddedBy' is of type '${typeof embeddedBy}' ` +
			`(expected 'string'), it won't be listed as 'embedded'`);
		return false;
	}
	if ( !embeddedBy.length ) {
		log.error(
			`  Component '${componentPath}': property 'sap.app/embeddedBy' has an empty string value ` +
			`(which is invalid), it won't be listed as 'embedded'`
		);
		return false;
	}
	let resolvedEmbeddedBy = posixPath.resolve(componentPath, embeddedBy);
	if ( resolvedEmbeddedBy && !resolvedEmbeddedBy.endsWith("/") ) {
		resolvedEmbeddedBy = resolvedEmbeddedBy + "/";
	}
	if ( libraryPathPrefix === resolvedEmbeddedBy ) {
		log.verbose(
			`  Component '${componentPath}': property 'sap.app/embeddedBy' points to library, list it as 'embedded'`);
		return true;
	} else {
		log.verbose(
			`  Component '${componentPath}': property 'sap.app/embeddedBy' points to '${resolvedEmbeddedBy}', ` +
			`don't list it as 'embedded'`);
		return false;
	}
};

/**
 * Retrieves the manifest path of a subcomponent
 *
 * @param {string} filePath path to the manifest, e.g. "lib/x/manifest.json"
 * @param {string} subPath relative sub path, e.g. "sub"
 * @returns {string} manifest path, e.g. "lib/x/sub/manifest.json"
 */
const getManifestPath = (filePath, subPath) => {
	return posixPath.resolve(posixPath.dirname(filePath), subPath, "manifest.json");
};

/**
 * Represents dependency information for a library.
 * Dependencies can be retrieved using <code>#getResolvedLibraries</code>
 * and with that are resolved recursively
 */
class DependencyInfo {
	/**
	 *
	 * @param {module:@ui5/builder/processors/versionInfoGenerator~ManifestLibraries} libs
	 * @param {string} name library name, e.g. "lib.x"
	 */
	constructor(libs, name) {
		this.libs = libs;
		this.name = name;
	}

	/**
	 * Add library to libsResolved and if already present
	 * merge lazy property
	 *
	 * @param {string} libName library name, e.g. "lib.x"
	 * @param {boolean} lazy
	 * @returns {{lazy: boolean}} the added library
	 */
	addResolvedLibDependency(libName, lazy) {
		let alreadyResolved = this._libsResolved[libName];
		if (!alreadyResolved) {
			alreadyResolved = Object.create(null);
			if (lazy) {
				alreadyResolved.lazy = true;
			}
			this._libsResolved[libName] = alreadyResolved;
		} else {
			// siblings if sibling is eager only if one other sibling eager
			alreadyResolved.lazy = alreadyResolved.lazy && lazy;
		}
		return alreadyResolved;
	}

	/**
	 * Resolves dependencies recursively and retrieves them with
	 * - resolved siblings a lazy and a eager dependency becomes eager
	 * - resolved children become lazy if their parent is lazy
	 *
	 * @param {Map<string,DependencyInfo>} dependencyInfoMap
	 * @returns {module:@ui5/builder/processors/versionInfoGenerator~ManifestLibraries} resolved libraries
	 */
	getResolvedLibraries(dependencyInfoMap) {
		if (!this._libsResolved) {
			// early set if there is a potential cycle
			this._libsResolved = Object.create(null);
			if (!this.libs) {
				return this._libsResolved;
			}
			for (const [libName, libValue] of Object.entries(this.libs)) {
				const lazy = libValue.lazy;
				const dependencyInfoObjectAdded = this.addResolvedLibDependency(libName, lazy);
				const dependencyInfo = dependencyInfoMap.get(libName);
				if (dependencyInfo) {
					const childLibsResolved = dependencyInfo.getResolvedLibraries(dependencyInfoMap);

					// children if parent is lazy children become lazy
					for (const [resolvedLibName, resolvedLib] of Object.entries(childLibsResolved)) {
						this.addResolvedLibDependency(resolvedLibName,
							resolvedLib.lazy || dependencyInfoObjectAdded.lazy);
					}
				} else {
					log.info(`Cannot find dependency '${libName}' `+
						`defined in the manifest.json or .library file of project '${this.name}'. ` +
						"This might prevent some UI5 runtime performance optimizations from taking effect. " +
						"Please double check your project's dependency configuration.");
				}
			}
		}
		return this._libsResolved;
	}
}


/**
 * Sorts the keys of a given object
 *
 * @param {object} obj the object
 * @returns {object} the object with sorted keys
 */
const sortObjectKeys = (obj) => {
	const sortedObject = Object.create(null);
	const keys = Object.keys(obj);
	keys.sort();
	keys.forEach((key) => {
		sortedObject[key] = obj[key];
	});
	return sortedObject;
};

/**
 * Builds the manifestHints object from the dependencyInfo
 *
 * @param {DependencyInfo} dependencyInfo
 * @param {Map<string, DependencyInfo>} dependencyInfoMap
 * @returns {{dependencies: {libs: ManifestLibraries}}} manifestHints
 */
const getManifestHints = (dependencyInfo, dependencyInfoMap) => {
	if (dependencyInfo) {
		const libsResolved = dependencyInfo.getResolvedLibraries(dependencyInfoMap);
		if (libsResolved && Object.keys(libsResolved).length) {
			return {
				dependencies: {
					libs: sortObjectKeys(libsResolved)
				}
			};
		}
	}
};

/**
 * Common type for Library and Component
 * embeds and bundled components make only sense for library
 *
 * @typedef {object} ArtifactInfo
 * @property {string} componentName The library name, e.g. "lib.x"
 * @property {Set<string>} bundledComponents The embedded components which have an embeddedBy reference to the library
 * @property {DependencyInfo} dependencyInfo The dependency info object
 * @property {module:@ui5/builder/processors/versionInfoGenerator~ArtifactInfo[]} embeds The embedded artifact infos
 */


/**
 * Processes the manifest and creates a ManifestInfo and an ArtifactInfo.
 *
 * @param {@ui5/fs/Resource} libraryManifest
 * @param {string} [name] library name, if not provided using the ManifestInfo's id
 * @returns {Promise<{manifestInfo: ManifestInfo, libraryArtifactInfo: ArtifactInfo}>}
 */
async function processManifestAndGetArtifactInfo(libraryManifest, name) {
	const manifestInfo = await processManifest(libraryManifest);
	name = name || manifestInfo.id;
	const libraryArtifactInfo = Object.create(null);
	libraryArtifactInfo.componentName = name;
	libraryArtifactInfo.dependencyInfo = new DependencyInfo(manifestInfo.libs, name);
	return {manifestInfo, libraryArtifactInfo};
}

/**
 * Processes the library info and fills the maps <code>dependencyInfoMap</code> and <code>embeddedInfoMap</code>.
 *
 * @param {module:@ui5/builder/processors/versionInfoGenerator~LibraryInfo} libraryInfo
 * @returns {Promise<module:@ui5/builder/processors/versionInfoGenerator~ArtifactInfo|undefined>}
 */
const processLibraryInfo = async (libraryInfo) => {
	if (!libraryInfo.libraryManifest) {
		log.verbose(
			`Cannot add meta information for library '${libraryInfo.name}'. The manifest.json file cannot be found`);
		return;
	}

	const {manifestInfo, libraryArtifactInfo} =
		await processManifestAndGetArtifactInfo(libraryInfo.libraryManifest, libraryInfo.name);

	const bundledComponents = new Set();
	libraryArtifactInfo.bundledComponents = bundledComponents;

	const embeds = manifestInfo.embeds||[]; // e.g. ["sub"]
	// filter only embedded manifests
	const embeddedPaths = embeds.map((embed) => {
		return getManifestPath(libraryInfo.libraryManifest.getPath(), embed);
	});
	// e.g. manifest resource with lib/x/sub/manifest.json
	let embeddedManifests = libraryInfo.embeddedManifests || [];
	embeddedManifests = embeddedManifests.filter((manifestResource) => {
		return embeddedPaths.includes(manifestResource.getPath());
	});

	// get all embedded manifests
	const embeddedManifestPromises = embeddedManifests.map(async (embeddedManifest) => {
		const {manifestInfo: embeddedManifestInfo, libraryArtifactInfo: embeddedArtifactInfo} =
			await processManifestAndGetArtifactInfo(embeddedManifest);

		const componentName = embeddedManifestInfo.id;

		const embeddedManifestDirName = posixPath.dirname(embeddedManifest.getPath());
		const libraryManifestDirName = posixPath.dirname(libraryInfo.libraryManifest.getPath());

		if (isBundledWithLibrary(embeddedManifestInfo.embeddedBy, embeddedManifestDirName,
			libraryManifestDirName + "/")) {
			bundledComponents.add(componentName);
		}
		return embeddedArtifactInfo;
	});

	const embeddedArtifactInfos = await Promise.all(embeddedManifestPromises);
	libraryArtifactInfo.embeds = embeddedArtifactInfos;

	return libraryArtifactInfo;
};

/**
 * Library Info
 *
 * contains information about the name and the version of the library and its manifest, as well as the nested manifests.
 *
 * @public
 * @typedef {object} LibraryInfo
 * @property {string} name The library name, e.g. "lib.x"
 * @property {string} version The library version, e.g. "1.0.0"
 * @property {string} [id] The npm package id of the library project, e.g. "@openui5/sap.ui.core".
 *   Used by {@link resolveFramework} to detect the UI5 framework via npm-scope scanning.
 * @property {@ui5/fs/Resource} libraryManifest library manifest resource,
 *  e.g. resource with path "lib/x/manifest.json"
 * @property {@ui5/fs/Resource[]} embeddedManifests list of embedded manifest resources,
 *  e.g. resource with path "lib/x/sub/manifest.json"
 */

/**
 * Resolves the UI5 framework name and version from raw project inputs.
 *
 * Resolution order:
 * 1. Explicit config: <code>frameworkName</code> is <code>"OpenUI5"</code> or <code>"SAPUI5"</code>
 *    → returns it with <code>frameworkVersion</code> coalesced to <code>""</code>.
 * 2. Dependency scan: examines <code>libraryInfos[].id</code> for <code>@sapui5/</code> or
 *    <code>@openui5/</code> npm scopes; version comes from the <code>sap.ui.core</code> entry.
 * 3. Fallback: <code>{name: "", version: ""}</code>.
 *
 * The returned object always has both <code>name</code> and <code>version</code> as strings.
 *
 * @public
 * @param {string} [frameworkName] Framework name from the root project's ui5.yaml
 * @param {string} [frameworkVersion] Framework version from the root project's ui5.yaml
 * @param {module:@ui5/builder/processors/versionInfoGenerator~LibraryInfo[]} libraryInfos
 *   Library infos; each entry's optional <code>id</code> field is used for the npm-scope scan
 * @returns {{name: string, version: string}} Resolved framework object
 */
export function resolveFramework(frameworkName, frameworkVersion, libraryInfos) {
	if (frameworkName === "OpenUI5" || frameworkName === "SAPUI5") {
		return {name: frameworkName, version: frameworkVersion || ""};
	}
	let openui5Detected = false;
	let openui5CoreVersion = "";
	for (const libraryInfo of libraryInfos) {
		const {id} = libraryInfo;
		if (id?.startsWith("@sapui5/")) {
			return {name: "SAPUI5", version: ""};
		}
		if (id?.startsWith("@openui5/")) {
			openui5Detected = true;
			if (libraryInfo.name === "sap.ui.core") {
				openui5CoreVersion = libraryInfo.version;
			}
		}
	}
	if (openui5Detected) {
		return {name: "OpenUI5", version: openui5CoreVersion};
	}
	return {name: "", version: ""};
}

/**
 * Creates sap-ui-version.json.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {object} parameters.options Options
 * @param {string} parameters.options.rootProjectName Name of the root project
 * @param {string} parameters.options.rootProjectVersion Version of the root project
 * @param {module:@ui5/builder/processors/versionInfoGenerator~LibraryInfo[]} parameters.options.libraryInfos Array of
 *				objects representing libraries,
 *  e.g.
 *  ```json
 *   {
 *      name: "lib.x",
 *      version: "1.0.0",
 *      libraryManifest: @ui5/fs/Resource,
 *      embeddedManifests: @ui5/fs/Resource[]
 *   }
 *   ```
 *
 * @param {string} [parameters.options.frameworkName] Framework name from the root project's ui5.yaml,
 *				e.g. <code>"OpenUI5"</code> or <code>"SAPUI5"</code>. Used for framework resolution.
 * @param {string} [parameters.options.frameworkVersion] Framework version from the root project's ui5.yaml,
 *				e.g. <code>"1.136.0"</code>. Used only when <code>frameworkName</code> is recognized;
 *				defaults to <code>""</code> when omitted.
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with an array containing the versionInfo resource
 */

export default async function({options}) {
	if (!options.rootProjectName || options.rootProjectVersion === undefined || options.libraryInfos === undefined) {
		throw new Error("[versionInfoGenerator]: Missing options parameters");
	}

	const buildTimestamp = getTimestamp();

	/**
	 * componentName to dependency info
	 *
	 * @type {Map<string, DependencyInfo>}
	 */
	const dependencyInfoMap = new Map();


	// process library infos
	const libraryInfosProcessPromises = options.libraryInfos.map((libraryInfo) => {
		return processLibraryInfo(libraryInfo);
	});

	let artifactInfos = await Promise.all(libraryInfosProcessPromises);
	artifactInfos = artifactInfos.filter(Boolean);

	// fill dependencyInfoMap
	artifactInfos.forEach((artifactInfo) => {
		dependencyInfoMap.set(artifactInfo.componentName, artifactInfo.dependencyInfo);
	});


	const libraries = options.libraryInfos.map((libraryInfo) => {
		const library = {
			name: libraryInfo.name,
			version: libraryInfo.version,
			buildTimestamp: buildTimestamp,
			scmRevision: ""// TODO: insert current library scm revision here
		};

		const dependencyInfo = dependencyInfoMap.get(libraryInfo.name);
		const manifestHints = getManifestHints(dependencyInfo, dependencyInfoMap);
		if (manifestHints) {
			library.manifestHints = manifestHints;
		}
		return library;
	});

	// sort libraries alphabetically
	libraries.sort((a, b) => {
		return a.name.localeCompare(b.name);
	});

	// components
	let components;
	artifactInfos.forEach((artifactInfo) => {
		artifactInfo.embeds.forEach((embeddedArtifactInfo) => {
			const componentObject = Object.create(null);
			const bundledComponents = artifactInfo.bundledComponents;
			const componentName = embeddedArtifactInfo.componentName;
			if (!bundledComponents.has(componentName)) {
				componentObject.hasOwnPreload = true;
			}
			componentObject.library = artifactInfo.componentName;

			const manifestHints = getManifestHints(embeddedArtifactInfo.dependencyInfo, dependencyInfoMap);
			if (manifestHints) {
				componentObject.manifestHints = manifestHints;
			}

			components = components || Object.create(null);
			components[componentName] = componentObject;
		});
	});

	// sort components alphabetically
	components = components && sortObjectKeys(components);

	const versionJson = {
		name: options.rootProjectName,
		version: options.rootProjectVersion, // TODO: insert current application version here
		buildTimestamp: buildTimestamp,
		scmRevision: "", // TODO: insert current application scm revision here
		// gav: "", // TODO: insert current application id + version here
		framework: resolveFramework(options.frameworkName, options.frameworkVersion, options.libraryInfos),
		libraries,
		components
	};

	return [createResource({
		path: "/resources/sap-ui-version.json",
		string: JSON.stringify(versionJson, null, "\t")
	})];
}
