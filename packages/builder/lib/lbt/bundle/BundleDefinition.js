export const SectionType = {
	/**
	 * The modules are assumed to exist already in the loading environment.
	 */
	Provided: "provided",

	/**
	 * The modules are to be written 1:1 into the resulting module.
	 */
	Raw: "raw",

	/**
	 * The modules are wrapped into a call to jQuery.sap.registerPreload(),
	 * each Javascript module will be embedded in an anonymous function.
	 */
	Preload: "preload",

	/**
	 * Content information for another bundle is written.
	 * Requires UI5 version 1.74.0 which adds runtime support for the 'bundles' and 'bundlesUI5'
	 * ui5loader configuration.
	 */
	BundleInfo: "bundleInfo",

	/**
	 * For each module, a require call will be created.
	 * Usually used as the last section in a merged module to enforce loading and
	 * execution of some specific module or modules.
	 */
	Require: "require"
};
