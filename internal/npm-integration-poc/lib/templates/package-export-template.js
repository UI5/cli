/**
 * Package Export Template Generator
 *
 * Generates package export files for @ui5/webcomponents packages
 */

/**
 * Generate package export with absolute paths (for thirdparty/ namespace)
 *
 * @param packageInfo
 * @param options
 */
export function generatePackageExportThirdparty(packageInfo, options) {
	const {packageName, version, chunkName} = packageInfo;
	const {namespace, thirdpartyNamespace} = options;

	return `/*!
 * UI5 WebComponents Package Export
 */
sap.ui.define([
	"${namespace}/${thirdpartyNamespace}/${chunkName || packageName.split("/").pop()}"
], function(WebCPackage) {
	"use strict";

	// Re-export package object
	const pkg = Object.assign({}, WebCPackage);

	// Export UI5 metadata
	pkg["_ui5metadata"] = {
		"name": "${namespace}/${thirdpartyNamespace}/@ui5/${packageName.split("/").pop()}",
		"version": "${version}",
		"dependencies": ["sap.ui.core"],
		"types": [],
		"interfaces": [],
		"controls": [],
		"elements": []
	};

	return pkg;
});`;
}
