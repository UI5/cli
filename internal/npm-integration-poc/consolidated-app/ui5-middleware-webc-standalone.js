/**
 * UI5 Custom Middleware: WebComponents Bundler (Standalone Plugin)
 *
 * Serves @ui5/webcomponents on-demand during development using
 * the custom standalone rollup-plugin-ui5-webcomponents.js
 */

import ui5WebComponentsPlugin from "../lib/plugins/rollup-plugin-ui5-webcomponents.js";
import {WebComponentsBundler} from "../lib/core/webcomponents-bundler.js";
import {CacheWriter} from "../lib/core/output-writer.js";
import {DEFAULT_CONFIG, createPluginOptions, createBundlerOptions} from "../lib/config/standalone-config.js";

/**
 * Custom middleware entry point
 *
 * @param root0
 * @param root0.log
 */
export default function({log}) {
	const $metadata = {};

	// Create plugin instance
	const plugin = ui5WebComponentsPlugin(createPluginOptions(log, $metadata));

	// Create bundler with cache writer
	const bundler = new WebComponentsBundler(createBundlerOptions(log, plugin));

	const cacheWriter = new CacheWriter(bundler.pathResolver);

	return async function(req, res, next) {
		// Handle requests for thirdparty/ webcomponents
		if (!req.path.startsWith(`/${DEFAULT_CONFIG.thirdpartyNamespace}/`)) {
			return next();
		}

		log.info(`✅ Handling webcomponents request: ${req.path}`);

		const modulePath = req.path.substring(1).replace(/\.js$/, "");

		try {
			let bundledCode = cacheWriter.get(modulePath);

			if (!bundledCode) {
				log.info(`📦 Bundling webcomponent on-demand: ${modulePath}`);

				const output = await bundler.bundle();
				await bundler.processOutput(output, cacheWriter, $metadata);

				bundledCode = cacheWriter.get(modulePath);

				if (!bundledCode) {
					log.warn(`⚠️ Module not found: ${modulePath}`);
					log.info(`🔍 Available: ${JSON.stringify(cacheWriter.keys())}`);
					return next();
				}

				log.info(`✅ Bundled and cached: ${modulePath}`);
			} else {
				log.info(`📋 Serving from cache: ${modulePath}`);
			}

			res.setHeader("Content-Type", "application/javascript");
			res.end(bundledCode);
		} catch (error) {
			log.error(`❌ Error bundling ${modulePath}: ${error.message}`);
			log.error(error.stack);
			next(error);
		}
	};
}
