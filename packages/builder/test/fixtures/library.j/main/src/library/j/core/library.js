/*!
 * ${copyright}
 */
sap.ui.define([], function () {
	sap.ui.getCore().initLibrary({
		name: "library.j.core",
		version: "${version}",
		dependencies: ["sap.ui.core"],
		designtime: "library/j/core/designtime/library.designtime",
		types: ["library.j.core.AnotherValidEnum"],
	});

	/**
	 * AnotherValidEnum
	 *
	 * @enum {string}
	 * @public
	 * @ui5-metamodel This enumeration also will be described in the UI5 (legacy) designtime metamodel
	 */
	library.j.core.AnotherValidEnum = {
		/**
		 * Fizz
		 * @public
		 */
		Fizz: "Fizz",
		/**
		 * Buzz
		 * @public
		 */
		Buzz: "Buzz",
	};

	return library.j.core;
});
