/**
 * UI5 Custom Middleware: WebComponents & NPM Modules Bundler (Standalone Plugin)
 *
 * Serves packages on-demand during development based on SCAN_RESULT configuration.
 */

import ui5WebComponentsPlugin from "../lib/plugins/rollup-plugin-ui5-webcomponents.js";
import {WebComponentsBundler} from "../lib/core/webcomponents-bundler.js";
import {CacheWriter} from "../lib/core/output-writer.js";
import {createPluginOptions, createBundlerOptions} from "../lib/config/standalone-config.js";
import {createRollupConfig, generateAMDBundle} from "../scenarios/shared-config.js";
import {
	SCAN_RESULT,
	getExternals,
	getPathsMapping,
	sanitizePackageName,
	createDevelopmentPlugin
} from "./bundler-config.js";

/**
 * Custom middleware entry point
 */
export default function({log}) {
	const $metadata = {};

	// WebComponents bundler setup
	const plugin = ui5WebComponentsPlugin(createPluginOptions(log, $metadata));
	const bundler = new WebComponentsBundler(createBundlerOptions(log, plugin));
	const cacheWriter = new CacheWriter(bundler.pathResolver);

	// NPM package cache
	const npmCache = new Map();
	const devPlugin = createDevelopmentPlugin();

	return async function(req, res, next) {
		// Only handle /resources/thirdparty/ requests
		if (!req.path.startsWith("/resources/thirdparty/")) {
			return next();
		}

		const modulePath = req.path.replace(/^\/resources\//, "").replace(/\.js$/, "");
		const moduleName = modulePath.replace(/^thirdparty\//, "");

		try {
			// Check cache first
			if (npmCache.has(modulePath)) {
				log.info(`📋 Serving from cache: ${modulePath}`);
				res.setHeader("Content-Type", "application/javascript");
				return res.end(npmCache.get(modulePath));
			}

			let bundledCode;

			// Find package in scan result by output name or sanitized name
			const packageName = Object.keys(SCAN_RESULT).find((pkg) => {
				const info = SCAN_RESULT[pkg];
				const outputName = info.outputName || sanitizePackageName(pkg);
				return outputName === moduleName;
			});

			if (packageName) {
				const scanInfo = SCAN_RESULT[packageName];
				const externals = getExternals(packageName);
				const paths = getPathsMapping(packageName);

				log.info(`📦 Bundling on-demand: ${packageName}`);

				const entryPoint = scanInfo.entryPoints[0];
				const config = createRollupConfig(entryPoint, [devPlugin], {
					external: externals.length > 0 ? externals : undefined
				});

				const outputOptions = {
					...scanInfo.outputOptions,
					...(Object.keys(paths).length > 0 ? {paths} : {})
				};

				bundledCode = await generateAMDBundle(config, outputOptions);
			}

			// Try WebComponents as fallback
			if (!bundledCode) {
				bundledCode = cacheWriter.get(modulePath);
				if (!bundledCode) {
					log.info(`📦 Bundling webcomponent on-demand: ${modulePath}`);
					const output = await bundler.bundle();
					await bundler.processOutput(output, cacheWriter, $metadata);
					bundledCode = cacheWriter.get(modulePath);
				}
			}

			if (!bundledCode) {
				log.warn(`⚠️ Module not found: ${modulePath}`);
				return next();
			}

			// Cache and serve
			npmCache.set(modulePath, bundledCode);
			log.info(`✅ Bundled: ${modulePath} (${(bundledCode.length / 1024).toFixed(1)} KB)`);

			res.setHeader("Content-Type", "application/javascript");
			res.end(bundledCode);
		} catch (error) {
			log.error(`❌ Error bundling ${modulePath}: ${error.message}`);
			log.error(error.stack);
			next(error);
		}
	};
}
