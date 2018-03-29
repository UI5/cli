"use strict";

const SectionType = {
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
	 * For each module, a jQuery.sap.require call will be created.
	 * Usually used as the last section in a merged module to enforce loading and
	 * execution of some specific module or modules.
	 */
	Require: "require"
};

module.exports.SectionType = SectionType;
