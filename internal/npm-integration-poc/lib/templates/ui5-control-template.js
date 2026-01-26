/**
 * UI5 Control Wrapper Template Generator
 *
 * Generates UI5 control wrapper code that extends sap.ui.core.webc.WebComponent
 */

/**
 * Generate UI5 control wrapper with relative paths (for gen/ namespace)
 *
 * @param metadata
 * @param options
 */
export function generateUI5ControlGen(metadata, options) {
	const {componentName, ui5Metadata} = metadata;

	return `/*!
 * UI5 WebComponent Wrapper
 */
sap.ui.define([
	"sap/ui/core/webc/WebComponent",
	"../../../@ui5/webcomponents",
	"../../../${componentName}"
], function(WebComponent) {
	"use strict";

	const ${componentName} = WebComponent.extend("@ui5.webcomponents.dist.${componentName}", {
		metadata: ${JSON.stringify(ui5Metadata, null, 2)}
	});

	return ${componentName};
});`;
}

/**
 * Generate UI5 control wrapper with absolute paths (for thirdparty/ namespace)
 *
 * @param metadata
 * @param options
 */
export function generateUI5ControlThirdparty(metadata, options) {
	const {componentName, ui5Metadata} = metadata;
	const {namespace, thirdpartyNamespace, qualifiedNamespace} = options;

	// Transform metadata to use absolute namespace paths
	const transformedMetadata = {
		...ui5Metadata,
		namespace: `${namespace}/${thirdpartyNamespace}/@ui5/webcomponents`,
		qualifiedNamespace: `${qualifiedNamespace}.${thirdpartyNamespace}.@ui5.webcomponents`
	};

	return `/*!
 * UI5 WebComponent Wrapper
 */
sap.ui.define([
	"sap/ui/core/webc/WebComponent",
	"${namespace}/${thirdpartyNamespace}/@ui5/webcomponents",
	"${namespace}/${thirdpartyNamespace}/${componentName}"
], function(WebComponent) {
	"use strict";

	const ${componentName} = WebComponent.extend("${qualifiedNamespace}.${thirdpartyNamespace}.@ui5.webcomponents.dist.${componentName}", {
		metadata: ${JSON.stringify(transformedMetadata, null, 2)}
	});

	return ${componentName};
});`;
}
