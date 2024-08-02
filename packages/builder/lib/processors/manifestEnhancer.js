import semver from "semver";
const {SemVer: Version, lt} = semver;
import {promisify} from "node:util";
import path from "node:path/posix";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:manifestEnhancer");

const APP_DESCRIPTOR_V22 = new Version("1.21.0");

function isAbsoluteUrl(url) {
	if (url.startsWith("/")) {
		return true;
	}
	try {
		const parsedUrl = new URL(url);
		// URL with ui5 protocol shouldn't be treated as absolute URL and will be handled separately
		return parsedUrl.protocol !== "ui5:";
	} catch {
		// URL constructor without base requires absolute URL and throws an error for relative URLs
		return false;
	}
}

/**
 * Returns a bundle URL from the given bundle name, relative to the given namespace.
 *
 * @param {string} bundleName Bundle name (e.g. "sap.ui.demo.app.i18n.i18n") to be resolved to a relative URL
 * @param {string} sapAppId Project namespace from sap.app/id (e.g. "sap.ui.demo.app")
 *                          to which a bundleName should be resolved to
 * @returns {string} Relative bundle URL (e.g. "i18n/i18n.properties")
 */
function getRelativeBundleUrlFromName(bundleName, sapAppId) {
	const bundleUrl = "/resources/" + bundleName.replace(/\./g, "/") + ".properties";
	return normalizeBundleUrl(bundleUrl, sapAppId);
}

// Copied from sap/base/util/LoaderExtensions.resolveUI5Url
// Adjusted to not resolve the URL, but create an absolute path prefixed with /resources
function resolveUI5Url(sUrl) {
	// check for ui5 scheme
	if (sUrl.startsWith("ui5:")) {
		let sNoScheme = sUrl.replace("ui5:", "");

		// check for authority
		if (!sNoScheme.startsWith("//")) {
			// URLs using the 'ui5' protocol must be absolute.
			// Relative and server absolute URLs are reserved for future use.
			return null;
		}

		sNoScheme = sNoScheme.replace("//", "");

		return "/resources/" + sNoScheme;
	} else {
		// not a ui5 url
		return sUrl;
	}
}

/**
 * Normalizes a bundle URL relative to the project namespace.
 *
 * @param {string} bundleUrl Relative bundle URL to be normalized
 * @param {string} sapAppId Project namespace from sap.app/id (e.g. "sap.ui.demo.app")
 *                          to which the URL is relative to
 * @returns {string} Normalized relative bundle URL (e.g. "i18n/i18n.properties")
 */
function normalizeBundleUrl(bundleUrl, sapAppId) {
	// Create absolute path with namespace from sap.app/id
	const absoluteNamespace = `/resources/${sapAppId.replaceAll(/\./g, "/")}`;

	const resolvedAbsolutePath = path.resolve(absoluteNamespace, bundleUrl);
	const resolvedRelativePath = path.relative(absoluteNamespace, resolvedAbsolutePath);
	return resolvedRelativePath;
}

/**
 * Returns the bundle URL from the given bundle configuration.
 *
 * @param {object} bundleConfig Bundle configuration
 * @param {string} sapAppId Project namespace from sap.app/id (e.g. "sap.ui.demo.app")
 *                          to which a bundleName should be resolved to
 * @param {string} [defaultBundleUrl] Default bundle url in case bundleConfig is not defined
 */
function getBundleUrlFromConfig(bundleConfig, sapAppId, defaultBundleUrl) {
	if (!bundleConfig) {
		// Use default URL (or undefined if argument is not provided)
		return defaultBundleUrl;
	} else if (typeof bundleConfig === "string") {
		return bundleConfig;
	} else if (typeof bundleConfig === "object") {
		return getBundleUrlFromConfigObject(bundleConfig, sapAppId);
	}
}

// Same as above, but does only accept objects, not strings or defaults
function getBundleUrlFromConfigObject(bundleConfig, sapAppId, fallbackBundleUrl) {
	if (typeof bundleConfig === "object") {
		if (bundleConfig.bundleName) {
			return getRelativeBundleUrlFromName(bundleConfig.bundleName, sapAppId);
		} else if (bundleConfig.bundleUrl) {
			return bundleConfig.bundleUrl;
		}
	}
	return fallbackBundleUrl;
}

// See runtime logic in sap/ui/core/Lib#_normalizeI18nSettings
function getBundleUrlFromSapUi5LibraryI18n(vI18n) {
	if (vI18n == null || vI18n === true) {
		return "messagebundle.properties";
	} else if (typeof vI18n === "string") {
		return vI18n;
	} else if (typeof vI18n === "object") {
		return vI18n.bundleUrl;
	} else {
		return null;
	}
}

class ManifestEnhancer {
	/**
	 * @param {string} manifest manifest.json content
	 * @param {string} filePath manifest.json file path
	 * @param {fs} fs Node fs or custom [fs interface]{@link module:@ui5/fs/fsInterface}
	 */
	constructor(manifest, filePath, fs) {
		this.fsReadDir = promisify(fs.readdir);
		this.cwd = path.dirname(filePath);
		this.filePath = filePath;
		this.manifest = JSON.parse(manifest);

		this.isModified = false;
		this.runInvoked = false;
	}

	markModified() {
		this.isModified = true;
	}

	async readdir(relativePath) {
		const absolutePath = path.resolve(this.cwd, relativePath);
		try {
			return await this.fsReadDir(absolutePath);
		} catch (err) {
			if (err?.code === "ENOENT") {
				return [];
			} else {
				throw err;
			}
		}
	}

	async findSupportedLocales(i18nBundleUrl) {
		const i18nBundleName = path.basename(i18nBundleUrl, ".properties");
		const i18nBundlePrefix = `${i18nBundleName}_`;
		const i18nBundleDir = path.dirname(i18nBundleUrl);
		const i18nBundleFiles = await this.readdir(i18nBundleDir);
		const supportedLocales = [];
		i18nBundleFiles.forEach((fileName) => {
			if (!fileName.endsWith(".properties")) {
				return;
			}
			const fileNameWithoutExtension = path.basename(fileName, ".properties");
			if (fileNameWithoutExtension === i18nBundleName) {
				supportedLocales.push("");
			} else if (fileNameWithoutExtension.startsWith(i18nBundlePrefix)) {
				const locale = fileNameWithoutExtension.replace(i18nBundlePrefix, "");
				supportedLocales.push(locale);
			}
		});
		return supportedLocales.sort();
	}

	async processBundleConfig({bundleConfig, fallbackBundleUrl, isTerminologyBundle = false, fallbackLocale}) {
		const bundleUrl = getBundleUrlFromConfigObject(bundleConfig, this.manifest["sap.app"].id, fallbackBundleUrl);
		if (!bundleUrl) {
			return;
		}
		if (bundleConfig.supportedLocales) {
			return;
		}

		const supportedLocales = await this.getSupportedLocales(
			bundleUrl, fallbackLocale ?? bundleConfig.fallbackLocale, isTerminologyBundle
		);
		if (supportedLocales.length > 0) {
			bundleConfig.supportedLocales = supportedLocales;
			this.markModified();
		}
	}

	async getSupportedLocales(bundleUrl, fallbackLocale, isTerminologyBundle = false) {
		// Ignore absolute URLs
		if (isAbsoluteUrl(bundleUrl)) {
			return [];
		}
		const resolvedBundleUrl = resolveUI5Url(bundleUrl);
		if (!resolvedBundleUrl) {
			// In case of a relative ui5-protocol URL
			return [];
		}
		const sapAppId = this.manifest["sap.app"].id;
		const normalizedBundleUrl = normalizeBundleUrl(resolvedBundleUrl, sapAppId);
		if (normalizedBundleUrl.startsWith("../")) {
			log.verbose(
				`${this.filePath}: ` +
				`bundleUrl '${bundleUrl}' points to a bundle outside of the ` +
				`current namespace '${sapAppId}', enhancement of 'supportedLocales' is skipped`
			);
			return [];
		}
		const supportedLocales = await this.findSupportedLocales(normalizedBundleUrl);
		if (!isTerminologyBundle && supportedLocales.length > 0) {
			if (typeof fallbackLocale === "string" && !supportedLocales.includes(fallbackLocale)) {
				log.error(
					`${this.filePath}: ` +
					`Generated supported locales ('${supportedLocales.join("', '")}') for ` +
					`bundle '${normalizedBundleUrl}' ` +
					"not containing the defined fallback locale '" + fallbackLocale + "'. Either provide a " +
					"properties file for defined fallbackLocale or configure another available fallbackLocale"
				);
				return [];
			} else if (typeof fallbackLocale === "undefined" && !supportedLocales.includes("en")) {
				log.warn(
					`${this.filePath}: ` +
					`Generated supported locales ('${supportedLocales.join("', '")}') for ` +
					`bundle '${normalizedBundleUrl}' ` +
					"do not contain default fallback locale 'en'. Either provide a " +
					"properties file for 'en' or configure another available fallbackLocale"
				);
			}
		}
		return supportedLocales;
	}

	async processSapAppI18n() {
		const sapApp = this.manifest["sap.app"];
		let sapAppI18n = sapApp.i18n;

		// Process enhanceWith bundles first, as they check for an existing supportedLocales property
		// defined by the developer, but not the one generated by the tooling.
		await this.processTerminologiesAndEnhanceWith(sapAppI18n);

		const i18nBundleUrl = getBundleUrlFromConfig(sapAppI18n, sapApp.id, "i18n/i18n.properties");

		if (!sapAppI18n?.supportedLocales && i18nBundleUrl) {
			const supportedLocales = await this.getSupportedLocales(i18nBundleUrl, sapAppI18n?.fallbackLocale);
			if (supportedLocales.length > 0) {
				if (!sapAppI18n || typeof sapAppI18n === "string") {
					sapAppI18n = sapApp.i18n = {
						bundleUrl: i18nBundleUrl
					};
				}
				sapAppI18n.supportedLocales = supportedLocales;
				this.markModified();
			}
		}
	}

	/**
	 *	Processes the terminologies and enhanceWith bundles of a bundle configuration.
	 *
	 * @param {object} bundleConfig
	 */
	async processTerminologiesAndEnhanceWith(bundleConfig) {
		const bundleConfigs = [];
		const terminologyBundleConfigs = [];

		if (bundleConfig?.terminologies) {
			terminologyBundleConfigs.push(...Object.values(bundleConfig.terminologies));
		}

		bundleConfig?.enhanceWith?.forEach((config) => {
			// The runtime logic propagates supportedLocales information to the enhanceWith bundles.
			// In order to not break existing behavior, we do not generate supportedLocales for enhanceWith bundles
			// in case the parent bundle does have supportedLocales defined.
			if (!bundleConfig.supportedLocales) {
				bundleConfigs.push({config, fallbackLocale: bundleConfig.fallbackLocale});
			}
			if (config.terminologies) {
				terminologyBundleConfigs.push(...Object.values(config.terminologies));
			}
		});

		await Promise.all(
			bundleConfigs.map(({config, fallbackLocale}) => this.processBundleConfig({
				bundleConfig: config,
				fallbackLocale
			}))
		);
		await Promise.all(
			terminologyBundleConfigs.map((bundleConfig) => this.processBundleConfig({
				bundleConfig, isTerminologyBundle: true
			}))
		);
	}

	async processSapUi5Models() {
		const sapUi5Models = this.manifest["sap.ui5"]?.models;
		if (typeof sapUi5Models !== "object") {
			return;
		}
		const modelConfigs = Object.values(sapUi5Models)
			.filter((modelConfig) => modelConfig.type === "sap.ui.model.resource.ResourceModel");

		await Promise.all(
			modelConfigs.map(async (modelConfig) => {
				// Process enhanceWith bundles first, as they check for an existing supportedLocales property
				// defined by the developer, but not the one generated by the tooling.
				await this.processTerminologiesAndEnhanceWith(modelConfig.settings);

				// Fallback to empty settings object in case only a "uri" is defined which will be converted
				// to a settings object at runtime.
				const settings = modelConfig.settings || {};

				// Ensure to pass the "uri" property as fallback bundle URL according to the runtime logic.
				// It is only taken into account if no "bundleUrl" or "bundleName" is defined.
				await this.processBundleConfig({bundleConfig: settings, fallbackBundleUrl: modelConfig.uri});

				// Ensure that the settings object is assigned back to the modelConfig
				// in case it didn't existing before.
				if (!modelConfig.settings) {
					modelConfig.settings = settings;
				}
			})
		);
	}

	async processSapUi5LibraryI18n() {
		let sapUi5LibraryI18n = this.manifest["sap.ui5"]?.library?.i18n;

		// Process enhanceWith bundles first, as they check for an existing supportedLocales property
		// defined by the developer, but not the one generated by the tooling.
		await this.processTerminologiesAndEnhanceWith(sapUi5LibraryI18n);

		const i18nBundleUrl = getBundleUrlFromSapUi5LibraryI18n(sapUi5LibraryI18n);
		if (i18nBundleUrl && !sapUi5LibraryI18n?.supportedLocales) {
			const supportedLocales = await this.getSupportedLocales(i18nBundleUrl, sapUi5LibraryI18n?.fallbackLocale);
			if (supportedLocales.length > 0) {
				if (!sapUi5LibraryI18n || typeof sapUi5LibraryI18n !== "object") {
					this.manifest["sap.ui5"] ??= {};
					this.manifest["sap.ui5"].library ??= {};
					sapUi5LibraryI18n = this.manifest["sap.ui5"].library.i18n = {
						bundleUrl: i18nBundleUrl
					};
				}
				sapUi5LibraryI18n.supportedLocales = supportedLocales;
				this.markModified();
			}
		}
	}

	async run() {
		// Prevent multiple invocations
		if (this.runInvoked) {
			throw new Error("ManifestEnhancer#run can only be invoked once per instance");
		}
		this.runInvoked = true;

		if (!this.manifest._version) {
			log.verbose(`${this.filePath}: _version is not defined. No supportedLocales can be generated`);
			return;
		}

		if (lt(this.manifest._version, APP_DESCRIPTOR_V22)) {
			log.verbose(`${this.filePath}: _version is lower than 1.21.0 so no supportedLocales can be generated`);
			return;
		}

		if (!this.manifest["sap.app"]?.id) {
			log.verbose(`${this.filePath}: sap.app/id is not defined. No supportedLocales can be generated`);
			return;
		}

		if (this.manifest["sap.app"].type === "library") {
			await this.processSapUi5LibraryI18n();
		} else {
			await Promise.all([
				this.processSapAppI18n(),
				this.processSapUi5Models()
			]);
		}

		if (this.isModified) {
			return this.manifest;
		}
	}
}

/**
 * @module @ui5/builder/processors/manifestEnhancer
 */

/**
 * Enriches the content of the manifest.json file.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of manifest.json resources to be processed
 * @param {fs|module:@ui5/fs/fsInterface} parameters.fs Node fs or custom
 *    [fs interface]{@link module:@ui5/fs/fsInterface}.
 * @returns {Promise<Array<@ui5/fs/Resource|undefined>>} Promise resolving with an array of modified resources
 */
export default async function({resources, fs}) {
	const res = await Promise.all(
		resources.map(async (resource) => {
			const manifest = await resource.getString();
			const filePath = resource.getPath();
			const manifestEnhancer = new ManifestEnhancer(manifest, filePath, fs);
			const enrichedManifest = await manifestEnhancer.run();
			if (enrichedManifest) {
				resource.setString(JSON.stringify(enrichedManifest, null, 2));
				return resource;
			}
		})
	);
	return res.filter(($) => $);
}

export const __internals__ = (process.env.NODE_ENV === "test") ?
	{ManifestEnhancer, getRelativeBundleUrlFromName, normalizeBundleUrl, resolveUI5Url} : undefined;
