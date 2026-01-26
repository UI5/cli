/**
 * Path Resolver Utility
 *
 * Centralized namespace and path transformation logic for UI5 WebComponents
 */

export class PathResolver {
	constructor(namespace, thirdpartyNamespace) {
		this.namespace = namespace || "com/example/app";
		this.thirdpartyNamespace = thirdpartyNamespace || "thirdparty";
		this.qualifiedNamespace = this.namespace.replace(/\//g, ".");
	}

	/**
	 * Build thirdparty/ namespace path
	 *
	 * @param fileName
	 */
	thirdpartyPath(fileName) {
		return `${this.thirdpartyNamespace}/${fileName}`.replace(/\.js$/, "");
	}

	/**
	 * Build full resource path for workspace
	 *
	 * @param fileName
	 */
	resourcePath(fileName) {
		return `/resources/${this.namespace}/${this.thirdpartyNamespace}/${fileName}`;
	}

	/**
	 * Check if file is a UI5 wrapper
	 *
	 * @param fileName
	 */
	isUI5Wrapper(fileName) {
		return fileName.startsWith("@ui5/webcomponents/dist/") ||
			fileName.startsWith("@ui5/webcomponents.") ||
			fileName.startsWith("@ui5/webcomponents-base.");
	}

	/**
	 * Check if file is a package export
	 *
	 * @param fileName
	 */
	isPackageExport(fileName) {
		return fileName.startsWith("@ui5/webcomponents.") ||
			fileName.startsWith("@ui5/webcomponents-base.");
	}

	/**
	 * Get friendly chunk name from module path
	 *
	 * @param moduleName
	 */
	getFriendlyName(moduleName) {
		return moduleName.split("/").pop() + ".js";
	}

	/**
	 * Extract module name from chunk facadeModuleId
	 *
	 * @param facadeModuleId
	 */
	extractModuleName(facadeModuleId) {
		if (!facadeModuleId) return null;
		return facadeModuleId.replace(/^.*\/node_modules\//, "").replace(/\.js$/, "");
	}

	/**
	 * Transform relative paths to absolute namespace paths
	 *
	 * @param code
	 */
	toAbsolutePaths(code) {
		return code
			.replace(/"\.\.\/..\/..\/@ui5\/webcomponents"/g, `"${this.namespace}/${this.thirdpartyNamespace}/@ui5/webcomponents"`)
			.replace(/"\.\.\/..\/..\/@ui5\/webcomponents-base"/g, `"${this.namespace}/${this.thirdpartyNamespace}/@ui5/webcomponents-base"`)
			.replace(/"\.\.\/..\/..\//g, `"${this.namespace}/${this.thirdpartyNamespace}/`)
			.replace(/@ui5\.webcomponents/g, `${this.qualifiedNamespace}.${this.thirdpartyNamespace}.@ui5.webcomponents`)
			.replace(/namespace:"@ui5\/webcomponents"/g, `namespace:"${this.namespace}/${this.thirdpartyNamespace}/@ui5/webcomponents"`)
			.replace(/qualifiedNamespace:"@ui5\.webcomponents"/g, `qualifiedNamespace:"${this.qualifiedNamespace}.${this.thirdpartyNamespace}.@ui5.webcomponents"`);
	}
}
