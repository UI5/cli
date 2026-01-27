/**
 * WebComponents Bundler Core
 *
 * Shared bundling logic for middleware and task implementations
 * Eliminates duplication between standalone and reuse approaches
 */

import {rollup} from "rollup";
import {nodeResolve} from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import {PathResolver} from "../utils/path-resolver.js";
import {ThirdpartyGenerator} from "../utils/thirdparty-generator.js";

export class WebComponentsBundler {
	constructor(options = {}) {
		this.namespace = options.namespace || "com/example/app";
		this.thirdpartyNamespace = options.thirdpartyNamespace || "thirdparty";
		this.log = options.log || console;
		this.framework = options.framework || {name: "SAPUI5", version: "1.120.0"};
		this.resolveModule = options.resolveModule;
		this.plugin = options.plugin;

		this.pathResolver = new PathResolver(this.namespace, this.thirdpartyNamespace);

		this.thirdpartyGenerator = new ThirdpartyGenerator(this.pathResolver);
	}

	/**
	 * Bundle webcomponents with rollup
	 *
	 * @param input
	 */
	async bundle(input = "@ui5/webcomponents/dist/MessageStrip.js") {
		this.log.info(`📦 Bundling: ${input}`);

		const bundle = await rollup({
			input,
			plugins: [
				nodeResolve({
					browser: true,
					preferBuiltins: false
				}),
				commonjs(),
				this.plugin
			],
			external: [
				/^sap\//
			]
		});

		const {output} = await bundle.generate({
			format: "amd",
			amd: {
				define: "sap.ui.define"
			}
		});

		return output;
	}

	/**
	 * Process output and write using provided writer strategy
	 *
	 * @param output
	 * @param writer
	 * @param $metadata
	 */
	async processOutput(output, writer, $metadata) {
		// Write chunks to output
		const chunkMapping = new Map();
		for (const chunk of output) {
			if (chunk.type === "chunk") {
				await writer.writeChunk(chunk, this.log);

				// Track chunks for duplication with friendly names
				if (chunk.facadeModuleId) {
					const moduleName = this.pathResolver.extractModuleName(chunk.facadeModuleId);
					if (moduleName) {
						chunkMapping.set(moduleName, {fileName: chunk.fileName, code: chunk.code});
					}
				}
			}
		}

		// Duplicate chunks with friendly names
		if (chunkMapping.size > 0) {
			this.log.info("📝 Duplicating chunks with friendly names...");
			await writer.duplicateChunks(chunkMapping, this.log);
		}

		// Write assets
		for (const asset of output) {
			if (asset.type === "asset") {
				await writer.writeAsset(asset, this.log);
			}
		}

		// Generate and write thirdparty wrappers
		if ($metadata) {
			this.log.info("📝 Creating thirdparty/ versions...");

			const controlWrappers = this.thirdpartyGenerator.generateControlWrappers($metadata, this.log);
			for (const [path, code] of controlWrappers) {
				await writer.write(path, code, this.log);
			}

			const packageExports = this.thirdpartyGenerator.generatePackageExports($metadata, this.log);
			for (const [path, code] of packageExports) {
				await writer.write(path, code, this.log);
			}
		}

		this.log.info("✅ WebComponents bundled successfully");
	}
}
