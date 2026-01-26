/**
 * WebComponent Metadata Extractor
 *
 * Reads and parses custom-elements.json from @ui5/webcomponents packages
 * to extract component metadata needed for UI5 wrapper generation.
 */

import {readFileSync} from "fs";
import {join} from "path";

export class WebComponentMetadata {
	constructor(packageName, resolveModule) {
		this.packageName = packageName;
		this.resolveModule = resolveModule;
		this.metadata = null;
		this.components = new Map();
	}

	/**
	 * Load metadata from custom-elements.json
	 */
	load() {
		try {
			// Resolve package.json to find customElements manifest path
			const packageJsonPath = this.resolveModule(`${this.packageName}/package.json`);
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

			// Read custom-elements.json
			const customElementsPath = packageJson.customElements ?
				join(packageJsonPath, "..", packageJson.customElements) :
				join(packageJsonPath, "..", "dist", "custom-elements.json");

			this.metadata = JSON.parse(readFileSync(customElementsPath, "utf-8"));

			// Index components by name and path
			if (this.metadata.modules) {
				for (const module of this.metadata.modules) {
					if (module.declarations && module.declarations.length > 0) {
						const declaration = module.declarations[0];
						if (declaration.customElement) {
							this.components.set(declaration.name, {
								name: declaration.name,
								tagName: declaration.tagName,
								module: module.path,
								properties: declaration.members?.filter((m) => m.kind === "field") || [],
								slots: declaration.slots || [],
								events: declaration.events || [],
								methods: declaration.members?.filter((m) => m.kind === "method") || [],
								cssProperties: declaration.cssProperties || [],
								cssParts: declaration.cssParts || []
							});

							// Also index by module path
							this.components.set(module.path, this.components.get(declaration.name));
						}
					}
				}
			}

			return true;
		} catch (error) {
			console.error(`Failed to load metadata for ${this.packageName}:`, error.message);
			return false;
		}
	}

	/**
	 * Get component metadata by name
	 *
	 * @param componentName
	 */
	getComponent(componentName) {
		return this.components.get(componentName);
	}

	/**
	 * Get component metadata by module path
	 *
	 * @param modulePath
	 */
	getComponentByPath(modulePath) {
		return this.components.get(modulePath);
	}

	/**
	 * Get all components
	 */
	getAllComponents() {
		const components = [];
		for (const [key, value] of this.components.entries()) {
			// Only return components keyed by name (not by path)
			if (key === value.name) {
				components.push(value);
			}
		}
		return components;
	}

	/**
	 * Get package version
	 */
	getVersion() {
		try {
			const packageJsonPath = this.resolveModule(`${this.packageName}/package.json`);
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
			return packageJson.version;
		} catch {
			return "0.0.0";
		}
	}
}
