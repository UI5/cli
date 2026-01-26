/**
 * Custom Standalone Rollup Plugin for UI5 WebComponents
 *
 * Generates metadata for thirdparty/ UI5 wrapper generation.
 * All UI5 wrappers use absolute namespace paths for application use.
 */

import {WebComponentMetadata} from "../utils/WebComponentMetadata.js";
import {UI5MetadataTransformer} from "../utils/UI5MetadataTransformer.js";

export default function ui5WebComponentsPlugin(options = {}) {
	const {
		namespace = "com/example/app",
		thirdpartyNamespace = "thirdparty",
		scopeSuffix = "custom",
		log = console,
		resolveModule,
		$metadata = {}
	} = options;

	// Qualified namespace (dots instead of slashes)
	const qualifiedNamespace = namespace.replace(/\//g, ".");

	// Component metadata cache
	let metadataLoader = null;
	let metadataTransformer = null;
	const processedComponents = new Set();

	return {
		name: "ui5-webcomponents",

		buildStart() {
			// Initialize metadata loader and transformer
			metadataLoader = new WebComponentMetadata("@ui5/webcomponents", resolveModule);
			metadataTransformer = new UI5MetadataTransformer();

			// Load metadata from custom-elements.json
			const loaded = metadataLoader.load();
			if (!loaded) {
				log.warn("Failed to load web component metadata");
			}

			// Initialize $metadata container
			$metadata.controls = $metadata.controls || {};
			$metadata.packages = $metadata.packages || {};
			$metadata.chunks = $metadata.chunks || {};

			log.info("🔧 UI5 WebComponents plugin initialized");
		},

		resolveId(source, importer, options) {
			// Detect web component imports
			if (source.startsWith("@ui5/webcomponents/dist/")) {
				const componentPath = source.replace("@ui5/webcomponents/", "");
				const component = metadataLoader.getComponentByPath(componentPath);

				if (component) {
					// Mark this module for later processing
					const resolvedId = resolveModule(source);
					log.info(`✅ Detected web component: ${component.name}`);

					return {
						id: resolvedId,
						meta: {
							ui5WebComponent: {
								componentName: component.name,
								componentPath,
								metadata: component
							}
						}
					};
				}
			}

			// Handle package imports (for package exports)
			if (source === "@ui5/webcomponents" || source === "@ui5/webcomponents-base") {
				return {
					id: `${source}#PACKAGE`,
					meta: {
						ui5Package: {
							packageName: source
						}
					}
				};
			}

			return null;
		},

		load(id) {
			// Handle package pseudo-modules
			if (id.endsWith("#PACKAGE")) {
				// Return minimal code - will be replaced in generateBundle
				return "export default {};";
			}

			return null;
		},

		generateBundle(outputOptions, bundle) {
			log.info("📦 Generating UI5 wrappers...");

			// Get package version
			const packageVersion = metadataLoader.getVersion();

			// Process each module that was marked as a web component
			for (const [, chunkOrAsset] of Object.entries(bundle)) {
				if (chunkOrAsset.type === "chunk") {
					const moduleInfo = this.getModuleInfo(chunkOrAsset.facadeModuleId);

					if (moduleInfo?.meta?.ui5WebComponent) {
						const {componentName, metadata: wcMetadata} = moduleInfo.meta.ui5WebComponent;

						if (processedComponents.has(componentName)) {
							continue;
						}

						log.info(`  ⚙️ Processing ${componentName}...`);

						// Transform web component metadata to UI5 format
						const ui5Metadata = metadataTransformer.transform(wcMetadata, {
							namespace,
							qualifiedNamespace,
							thirdpartyNamespace,
							scopeSuffix,
							packageVersion
						});

						// Store in $metadata for task post-processing (thirdparty/ generation)
						$metadata.controls[`@ui5/webcomponents/dist/${componentName}.js`] = {
							componentName,
							ui5Metadata
						};

						log.info(`    ✅ Stored metadata for thirdparty wrapper: @ui5/webcomponents/dist/${componentName}.js`);

						processedComponents.add(componentName);
					}
				}
			}

			// Store package export metadata for task post-processing (thirdparty/ generation)
			const packagesToExport = ["@ui5/webcomponents", "@ui5/webcomponents-base"];

			for (const packageName of packagesToExport) {
				const shortName = packageName.split("/").pop();

				// Store in $metadata for task to create thirdparty version
				$metadata.packages[`@ui5/${shortName}.js`] = {
					packageName,
					version: packageVersion,
					chunkName: "MessageStrip"
				};

				log.info(`  ✅ Stored metadata for thirdparty package export: @ui5/${shortName}.js`);
			}

			log.info("✅ UI5 wrappers generated successfully");
		}
	};
}
