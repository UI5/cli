/**
 * Shared Configuration for Standalone WebComponents Integration
 *
 * DRY principle: Centralized configuration to eliminate duplication
 * between task and middleware implementations.
 */

import {createRequire} from "module";

const require = createRequire(import.meta.url);

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
	namespace: "com/example/app",
	thirdpartyNamespace: "thirdparty",
	scopeSuffix: null,
	framework: {
		name: "SAPUI5",
		version: "1.120.0"
	}
};

/**
 * Create resolveModule function for node resolution
 *
 * @returns {Function} resolveModule function
 */
export function createResolveModule() {
	return (id) => {
		try {
			return require.resolve(id);
		} catch {
			return null;
		}
	};
}

/**
 * Create plugin options object
 *
 * @param {object} log Logger instance
 * @param {object} $metadata Metadata object
 * @param {object} overrides Configuration overrides
 * @returns {object} Plugin options
 */
export function createPluginOptions(log, $metadata, overrides = {}) {
	return {
		...DEFAULT_CONFIG,
		...overrides,
		log,
		resolveModule: createResolveModule(),
		$metadata
	};
}

/**
 * Create bundler options object
 *
 * @param {object} log Logger instance
 * @param {object} plugin Plugin instance
 * @param {object} overrides Configuration overrides
 * @returns {object} Bundler options
 */
export function createBundlerOptions(log, plugin, overrides = {}) {
	return {
		...DEFAULT_CONFIG,
		...overrides,
		log,
		resolveModule: createResolveModule(),
		plugin
	};
}
