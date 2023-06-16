import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

function createMockResource(content, path, name = "library.js") {
	return {
		async getBuffer() {
			return content;
		},
		getPath() {
			return path;
		},
		getName() {
			return name;
		}
	};
}

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("analyze: library.js with non supported property", async (t) => {
	const libraryJS = `
sap.ui.define([
	'sap/ui/core/Core',
], function(Core) {
	"use strict";
	sap.ui.getCore().initLibrary({
		name : "library.test",
		version: "1.0.0",
		customProperty1: "UI5",
		dependencies : ["sap.ui.core"],
		types: [
			"library.test.ButtonType",
			"library.test.DialogType",
		],
		interfaces: [
			"library.test.IContent",
		],
		controls: [
			"library.test.Button",
			"library.test.CheckBox",
			"library.test.Dialog",
			"library.test.Input",
			"library.test.Label",
			"library.test.Link",
			"library.test.Menu",
			"library.test.Text"
		],
		elements: [
			"library.test.MenuItem"
		],
		extensions: {
			customExtension: "UI5"
		},
		designtime: "library/test/library.designtime.js",
		customProperty2: "UI5"
	});
	return thisLib;
});`;

	const librayJSPath = "library/test/library.js";
	const errorLogStub = sinon.stub();
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS.js", {
		"@ui5/logger": {
			getLogger: () => ({
				error: errorLogStub
			})
		}
	});

	const mockResource = createMockResource(libraryJS, librayJSPath);

	await analyzeLibraryJSWithStubbedLogger(mockResource);

	t.is(errorLogStub.callCount, 2, "Error log is called twice");
	t.is(errorLogStub.getCall(0).args[0],
		"Unexpected property 'customProperty1' or wrong type for 'customProperty1'" +
		" for a library initalization call in 'library/test/library.js'",
		"The error log message of the first call is correct");
	t.is(errorLogStub.getCall(1).args[0],
		"Unexpected property 'customProperty2' or wrong type for 'customProperty2'" +
		" for a library initalization call in 'library/test/library.js'",
		"The error log message of the first call is correct");
});


test.serial("analyze: library.js with SpreadExpression", async (t) => {
	const libraryJS = `
sap.ui.define([
	'sap/ui/core/Core',
], function(Core) {
	"use strict";
	const myExtensions = {myProperty1: "Value1", myProperty2: "Value2"};
	sap.ui.getCore().initLibrary({
		...myExtensions,
		name : "library.test",
		version: "1.0.0",
		elements: [
			"library.test.MenuItem"
		],
	});
	return thisLib;
});`;

	const librayJSPath = "library/test/library.js";
	const errorLogStub = sinon.stub();
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS", {
		"@ui5/logger": {
			getLogger: () => ({
				error: errorLogStub
			})
		}
	});

	const mockResource = createMockResource(libraryJS, librayJSPath);

	const result = await analyzeLibraryJSWithStubbedLogger(mockResource);

	t.is(errorLogStub.callCount, 0, "Error log is not called");
	t.is(result.elements[0], "library.test.MenuItem", "The libraryjs is correctly analyzed");
});

test.serial("analyze: library.js with property 'noLibraryCSS'", async (t) => {
	const libraryJS = `
sap.ui.define([
	'sap/ui/core/Core',
], function(Core) {
	"use strict";
	sap.ui.getCore().initLibrary({
		name : "library.test",
		version: "1.0.0",
		noLibraryCSS: true,
		elements: [
			"library.test.MenuItem"
		],
	});
	return thisLib;
});`;

	const librayJSPath = "library/test/library.js";
	const errorLogStub = sinon.stub();
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS", {
		"@ui5/logger": {
			getLogger: () => ({
				error: errorLogStub
			})
		}
	});

	const mockResource = createMockResource(libraryJS, librayJSPath);

	const result = await analyzeLibraryJSWithStubbedLogger(mockResource);

	t.is(errorLogStub.callCount, 0, "Error log is not called");
	t.is(result.elements[0], "library.test.MenuItem", "The libraryjs is correctly analyzed");
	t.true(result.noLibraryCSS, "The 'noLibraryCSS' property is correctly 'true'");
});

test.serial("analyze: library.js with AMD defined initLibrary", async (t) => {
	let libraryJS = `
sap.ui.define([
	'sap/ui/core/Core',
], function(Core) {
	"use strict";
	var thisLib = Core.initLibrary({
		name : "library.test",
		version: "1.0.0",
		noLibraryCSS: true,
		elements: [
			"library.test.MenuItem"
		],
	});
	return thisLib;
});`;

	const librayName = "library.js";
	const librayJSPath = "library/test/library.js";
	const errorLogStub = sinon.stub();
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS", {
		"@ui5/logger": {
			getLogger: () => ({
				error: errorLogStub
			})
		}
	});

	let mockResource = createMockResource(libraryJS, librayJSPath, librayName);
	let result = await analyzeLibraryJSWithStubbedLogger(mockResource);
	t.is(errorLogStub.callCount, 0, "Error log is not called");
	t.is(result.elements[0], "library.test.MenuItem", "The libraryjs is correctly analyzed");


	libraryJS = `
sap.ui.define([
	'sap/ui/core/Lib',
], function(Lib) {
	"use strict";
	var thisLib = Lib.init({
		name : "library.test",
		version: "1.0.0",
		noLibraryCSS: true,
		elements: [
			"library.test.MenuItem"
		],
	});
	return thisLib;
});`;

	mockResource = createMockResource(libraryJS, librayJSPath, librayName);
	result = await analyzeLibraryJSWithStubbedLogger(mockResource);
	t.is(errorLogStub.callCount, 0, "Error log is not called");
	t.is(result.elements[0], "library.test.MenuItem", "The libraryjs is correctly analyzed");
});

test.serial("analyze: library.js with unknown initLibrary call", async (t) => {
	const libraryJS = `
sap.ui.define([
	'sap/ui/core/Core',
], function(Core) {
	"use strict";
	var thisLib = SomeGlobalVar.initLibrary({
		name : "library.test",
		version: "1.0.0",
		noLibraryCSS: true,
		elements: [
			"library.test.MenuItem"
		],
	});
	return thisLib;
});`;

	const librayName = "library.js";
	const librayJSPath = "library/test/library.js";
	const errorLogStub = sinon.stub();
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS", {
		"@ui5/logger": {
			getLogger: () => ({
				error: errorLogStub
			})
		}
	});

	const mockResource = createMockResource(libraryJS, librayJSPath, librayName);
	const result = await analyzeLibraryJSWithStubbedLogger(mockResource);
	t.is(errorLogStub.callCount, 0, "Error log is not called");
	t.deepEqual(result.types, [], "initLibrary is a method with unknown source and is not analyzed");
	t.deepEqual(result.controls, [], "initLibrary is a method with unknown source and is not analyzed");
	t.deepEqual(result.elements, [], "initLibrary is a method with unknown source and is not analyzed");
	t.deepEqual(result.interfaces, [], "initLibrary is a method with unknown source and is not analyzed");
});
