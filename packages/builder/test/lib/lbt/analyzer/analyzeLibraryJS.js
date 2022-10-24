import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

function createMockResource(content, path) {
	return {
		async getBuffer() {
			return content;
		},
		getPath() {
			return path;
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
	const myLoggerInstance = {
		error: errorLogStub
	};
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().returns(myLoggerInstance)
		}
	});

	const mockResource = createMockResource(libraryJS, librayJSPath);

	await analyzeLibraryJSWithStubbedLogger(mockResource);

	t.is(errorLogStub.callCount, 2, "Error log is called twice");
	t.is(errorLogStub.getCall(0).args[0],
		"Unexpected property 'customProperty1' or wrong type for 'customProperty1'" +
		" in sap.ui.getCore().initLibrary call in 'library/test/library.js'",
		"The error log message of the first call is correct");
	t.is(errorLogStub.getCall(1).args[0],
		"Unexpected property 'customProperty2' or wrong type for 'customProperty2'" +
		" in sap.ui.getCore().initLibrary call in 'library/test/library.js'",
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
	const logger = await esmock("@ui5/logger");
	const errorLogStub = sinon.stub();
	const myLoggerInstance = {
		error: errorLogStub
	};
	sinon.stub(logger, "getLogger").returns(myLoggerInstance);
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS");

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
	const logger = await esmock("@ui5/logger");
	const errorLogStub = sinon.stub();
	const myLoggerInstance = {
		error: errorLogStub
	};
	sinon.stub(logger, "getLogger").returns(myLoggerInstance);
	const analyzeLibraryJSWithStubbedLogger = await esmock("../../../../lib/lbt/analyzer/analyzeLibraryJS");

	const mockResource = createMockResource(libraryJS, librayJSPath);

	const result = await analyzeLibraryJSWithStubbedLogger(mockResource);

	t.is(errorLogStub.callCount, 0, "Error log is not called");
	t.is(result.elements[0], "library.test.MenuItem", "The libraryjs is correctly analyzed");
	t.true(result.noLibraryCSS, "The 'noLibraryCSS' property is correctly 'true'");
});
