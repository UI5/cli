/*!
 * ${copyright}
 */
sap.ui.define([], function () {
	sap.ui.getCore().initLibrary({
		name: "library.j",
		version: "${version}",
		dependencies: ["sap.ui.core"],
		designtime: "library/j/designtime/library.designtime",
		types: ["library.j.MyValidEnum"],
	});

	/**
	 * MyValidEnum
	 *
	 * @enum {string}
	 * @public
	 * @ui5-metamodel This enumeration also will be described in the UI5 (legacy) designtime metamodel
	 */
	library.j.MyValidEnum = {
		/**
		 * Foo
		 * @public
		 */
		Foo: "Foo",
		/**
		 * Bar
		 * @public
		 */
		Bar: "Bar",
	};

	/**
	 * ThisIsEnumToo
	 *
	 * @enum {string}
	 * @public
	 */
	library.j.ThisIsEnumToo = {
		/**
		 * Value1
		 * @public
		 */
		Value1: "Value1",
		/**
		 * Value2
		 * @public
		 */
		Value2: "Value2",
	};

	return library.j;
});
