const test = require("ava");
const LibraryFileAnalyzer = require("../../../../lib/lbt/resources/LibraryFileAnalyzer");

test("extract packaging info from .library file", (t) => {
	const libraryFile = `\
<?xml version="1.0" encoding="UTF-8" ?>
<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
  <name>sap.ui.core</name>
  <copyright>(c) 2019 SAP SE</copyright>
  <version>1.99.0</version>
  <documentation>Some doc.</documentation>
  <appData>
    <packaging xmlns="http://www.sap.com/ui5/buildext/packaging" version="2.0" >
      <module-infos>
        <raw-module name="vendor/blanket.js" />
        <raw-module name="vendor/crossroads.js" depends="vendor/signals.js" ignoredGlobals=" foo, bar "/>
        <raw-module name="vendor/hasher.js" depends="vendor/signals.js" />
        <raw-module name="vendor/require.js" />
      </module-infos>
      <all-in-one>
        <exclude name="vendor/blanket.js" />
      </all-in-one>
    </packaging>
  </appData>
</library>
`;

	const expectedInfos = [
		{
			name: "vendor/blanket.js",
			dependencies: [],
			ignoredGlobals: undefined
		},
		{
			name: "vendor/crossroads.js",
			dependencies: ["vendor/signals.js"],
			ignoredGlobals: ["foo", "bar"]
		},
		{
			name: "vendor/hasher.js",
			dependencies: ["vendor/signals.js"],
			ignoredGlobals: undefined
		},
		{
			name: "vendor/require.js",
			dependencies: [],
			ignoredGlobals: undefined
		}
	];

	const actual = LibraryFileAnalyzer.getDependencyInfos("a.library", libraryFile);

	t.deepEqual(Object.keys(actual), expectedInfos.map((exp) => exp.name),
		"Method should return the expected set of modules");
	expectedInfos.forEach(({name, dependencies, ignoredGlobals}) => {
		t.true(actual[name] != null, "expected info should exist");
		t.is(actual[name].rawModule, true, "info should have rawModule marker");
		t.is(actual[name].name, name, "info should have expected module id");
		t.deepEqual(actual[name].dependencies, dependencies, "info should have the expected dependencies");
		t.deepEqual(actual[name].ignoredGlobals, ignoredGlobals, "ignoredGlobals should have the expected value");
	});
});
