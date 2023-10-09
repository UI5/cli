import test from "ava";
import sinon from "sinon";
import minifier from "../../../lib/processors/minifier.js";
import {__localFunctions__} from "../../../lib/processors/minifier.js";
import {createResource} from "@ui5/fs/resourceFactory";

// Node.js itself tries to parse sourceMappingURLs in all JavaScript files. This is unwanted and might even lead to
// obscure errors when dynamically generating Data-URI soruceMappingURL values.
// Therefore use this constant to never write the actual string.
const SOURCE_MAPPING_URL = "//" + "# sourceMappingURL";

test("Basic minifier", async (t) => {
	const content = `/*!
 * \${copyright}
 */
 function myFunc(myArg) {
 	jQuery.sap.require("something");
 	console.log("Something required")
 }
myFunc();
`;
	const testResource = createResource({
		path: "/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource}] = await minifier({
		resources: [testResource]
	});

	const expected = `/*!
 * \${copyright}
 */
function myFunc(e){jQuery.sap.require("something");console.log("Something required")}myFunc();
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	t.deepEqual(await dbgResource.getString(), content, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"test.controller.js",` +
		`"names":["myFunc","myArg","jQuery","sap","require","console","log"],` +
		`"sources":["test-dbg.controller.js"],` +
		`"mappings":";;;AAGC,SAASA,OAAOC,GACfC,OAAOC,IAAIC,QAAQ,aACnBC,QAAQC,IAAI,qBACb,CACDN"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
});

test("Basic minifier with taskUtil and useWorkers: true", async (t) => {
	const taskUtilMock = {
		registerCleanupTask: sinon.stub()
	};
	const content = `/*!
 * \${copyright}
 */
 function myFunc(myArg) {
 	jQuery.sap.require("something");
 	console.log("Something required")
 }
myFunc();
`;
	const testResource = createResource({
		path: "/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource}] = await minifier({
		resources: [testResource],
		taskUtil: taskUtilMock,
		options: {
			useWorkers: true
		}
	});

	const expected = `/*!
 * \${copyright}
 */
function myFunc(e){jQuery.sap.require("something");console.log("Something required")}myFunc();
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	t.deepEqual(await dbgResource.getString(), content, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"test.controller.js",` +
		`"names":["myFunc","myArg","jQuery","sap","require","console","log"],` +
		`"sources":["test-dbg.controller.js"],` +
		`"mappings":";;;AAGC,SAASA,OAAOC,GACfC,OAAOC,IAAIC,QAAQ,aACnBC,QAAQC,IAAI,qBACb,CACDN"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");

	// Call to registerCleanupTask indicates worker pool was used
	t.is(taskUtilMock.registerCleanupTask.callCount, 1, "taskUtil#registerCleanupTask got called once");
});

test("minifier with useWorkers: true and missing taskUtil", async (t) => {
	const content = `/*!
 * \${copyright}
 */
 function myFunc(myArg) {
 	jQuery.sap.require("something");
 	console.log("Something required")
 }
myFunc();
`;
	const testResource = createResource({
		path: "/test.controller.js",
		string: content
	});
	await t.throwsAsync(minifier({
		resources: [testResource],
		options: {
			useWorkers: true
		}
	}), {
		message: "Minifier: Option 'useWorkers' requires a taskUtil instance to be provided"
	}, "Threw with expected error message");
});

test("Multiple resources", async (t) => {
	const content1 = `
function test1(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test1();`;
	const content2 = `
function test2(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test2();`;
	const content3 = `
function test3(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test3();`;

	const testResources = [
		createResource({
			path: "/test1.controller.js",
			string: content1
		}),
		createResource({
			path: "/test2.fragment.js",
			string: content2
		}),
		createResource({
			path: "/test3.designtime.js",
			string: content3
		})
	];

	const resources = await minifier({
		resources: testResources
	});

	const expectedMinified1 = `function test1(t){var o=t;console.log(o)}test1();
${SOURCE_MAPPING_URL}=test1.controller.js.map`;
	const expectedMinified2 = `function test2(t){var o=t;console.log(o)}test2();
${SOURCE_MAPPING_URL}=test2.fragment.js.map`;
	const expectedMinified3 = `function test3(t){var o=t;console.log(o)}test3();
${SOURCE_MAPPING_URL}=test3.designtime.js.map`;

	const expectedSourceMap1 =
		`{"version":3,"file":"test1.controller.js",` +
		`"names":["test1","paramA","variableA","console","log"],"sources":["test1-dbg.controller.js"],` +
		`"mappings":"AACA,SAASA,MAAMC,GACd,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;
	const expectedSourceMap2 =
		`{"version":3,"file":"test2.fragment.js",` +
		`"names":["test2","paramA","variableA","console","log"],"sources":["test2-dbg.fragment.js"],` +
		`"mappings":"AACA,SAASA,MAAMC,GACd,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;
	const expectedSourceMap3 =
		`{"version":3,"file":"test3.designtime.js",` +
		`"names":["test3","paramA","variableA","console","log"],"sources":["test3-dbg.designtime.js"],` +
		`"mappings":"AACA,SAASA,MAAMC,GACd,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;

	t.is(resources[0].resource.getPath(), "/test1.controller.js",
		"Correct resource path for minified content of resource 1");
	t.deepEqual(await resources[0].resource.getString(), expectedMinified1, "Correct minified content for resource 1");
	t.is(resources[0].dbgResource.getPath(), "/test1-dbg.controller.js",
		"Correct resource path for debug content of resource 1");
	t.deepEqual(await resources[0].dbgResource.getString(), content1, "Correct debug content for resource 1");
	t.is(resources[0].sourceMapResource.getPath(), "/test1.controller.js.map",
		"Correct resource path for source map content of resource 1");
	t.deepEqual(await resources[0].sourceMapResource.getString(), expectedSourceMap1,
		"Correct source map content for resource 1");

	t.is(resources[1].resource.getPath(), "/test2.fragment.js",
		"Correct resource path for minified content of resource 2");
	t.deepEqual(await resources[1].resource.getString(), expectedMinified2, "Correct minified content for resource 2");
	t.is(resources[1].dbgResource.getPath(), "/test2-dbg.fragment.js",
		"Correct resource path for debug content of resource 2");
	t.deepEqual(await resources[1].dbgResource.getString(), content2, "Correct debug content for resource 2");
	t.is(resources[1].sourceMapResource.getPath(), "/test2.fragment.js.map",
		"Correct resource path for source map content of resource 2");
	t.deepEqual(await resources[1].sourceMapResource.getString(), expectedSourceMap2,
		"Correct source map content for resource 2");

	t.is(resources[2].resource.getPath(), "/test3.designtime.js",
		"Correct resource path for minified content of resource 3");
	t.deepEqual(await resources[2].resource.getString(), expectedMinified3, "Correct minified content for resource 3");
	t.is(resources[2].dbgResource.getPath(), "/test3-dbg.designtime.js",
		"Correct resource path for debug content of resource 3");
	t.deepEqual(await resources[2].dbgResource.getString(), content3, "Correct debug content for resource 3");
	t.is(resources[2].sourceMapResource.getPath(), "/test3.designtime.js.map",
		"Correct resource path for source map content of resource 3");
	t.deepEqual(await resources[2].sourceMapResource.getString(), expectedSourceMap3,
		"Correct source map content for resource 3");
});

test("Input source map: Incorrect parameters", async (t) => {
	const content = `some content`;

	const testResource = createResource({
		path: "/resources/test.controller.js",
		string: content
	});
	await t.throwsAsync(minifier({
		resources: [testResource],
		options: {
			readSourceMappingUrl: true,
		}
	}), {
		message: `Option 'readSourceMappingUrl' requires parameter 'fs' to be provided`
	}, "Threw with expected error message");
});

test("Input source map: Provided inline", async (t) => {
	const content = `/*!
 * \${copyright}
 */
"use strict";

sap.ui.define(["sap/m/MessageBox", "./BaseController"], function (MessageBox, __BaseController) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  /**
   * @namespace test.controller
   */
  const Main = BaseController.extend("test.controller.Main", {
    sayHello: function _sayHello() {
      MessageBox.show("Hello World!");
    }
  });
  return Main;
});

${SOURCE_MAPPING_URL}=data:application/json;charset=utf-8;base64,` +
	`eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC5jb250cm9sbGVyLmpzIiwibmFtZXMiOlsic2FwIiwidWkiLCJkZWZpbmUiLCJNZXNzYWdlQm94Ii` +
	`wiX19CYXNlQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIkJhc2VDb250` +
	`cm9sbGVyIiwiTWFpbiIsImV4dGVuZCIsInNheUhlbGxvIiwiX3NheUhlbGxvIiwic2hvdyJdLCJzb3VyY2VzIjpbInRlc3QuY29udHJvbGxlci` +
	`50cyJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBRkE7O0FBQUFBLEdBQUEsQ0FBQUMsRUFBQSxDQUFBQyxNQUFBLHFEQUFBQyxVQUFB` +
	`LEVBQUFDLGdCQUFBO0VBQUE7O0VBQUEsU0FBQUMsdUJBQUFDLEdBQUE7SUFBQSxPQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxXQU` +
	`FBRCxHQUFBLENBQUFFLE9BQUEsbUJBQUFGLEdBQUEsQ0FBQUUsT0FBQSxHQUFBRixHQUFBO0VBQUE7RUFBQSxNQUlPRyxjQUFjLEdBQUFKLHNC` +
	`QUFBLENBQUFELGdCQUFBO0VBRXJCO0FBQ0E7QUFDQTtFQUZBLE1BR3FCTSxJQUFJLEdBQVNELGNBQWMsQ0FBQUUsTUFBQTtJQUN4Q0MsUUFBUS` +
	`xXQUFBQyxVQUFBLEVBQVM7TUFDdkJWLFVBQVUsQ0FBQ1csSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUNoQztFQUFDO0VBQUEsT0FIbUJKLElBQUk7` +
	`QUFBQSJ9`;
	/* The above is a base64 encoded version of the following string
		(identical to one in the next input source map test below):
		`{"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox","__BaseController",` +
		`"_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend","sayHello",` +
		`"_sayHello","show"],"sources":["test.controller.ts"],"mappings":"AAAA;AACA;AACA;AAFA;;AAAAA,GAAA,CAAAC,` +
		`EAAA,CAAAC,MAAA,qDAAAC,UAAA,EAAAC,gBAAA;EAAA;;EAAA,SAAAC,uBAAAC,GAAA;IAAA,OAAAA,GAAA,IAAAA,GAAA,CAAAC,` +
		`UAAA,WAAAD,GAAA,CAAAE,OAAA,mBAAAF,GAAA,CAAAE,OAAA,GAAAF,GAAA;EAAA;EAAA,MAIOG,cAAc,GAAAJ,sBAAA,CAAAD,` +
		`gBAAA;EAErB;AACA;AACA;EAFA,MAGqBM,IAAI,GAASD,cAAc,CAAAE,MAAA;IACxCC,QAAQ,WAAAC,UAAA,EAAS;MACvBV,UAAU,` +
		`CAACW,IAAI,CAAC,cAAc,CAAC;IAChC;EAAC;EAAA,OAHmBJ,IAAI;AAAA"}`;
	*/

	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			// We don't expect this test to read any files, so always throw an error here
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs,
		options: {
			readSourceMappingUrl: true,
		}
	});

	const expected = `/*!
 * \${copyright}
 */
"use strict";sap.ui.define(["sap/m/MessageBox","./BaseController"],function(e,t){"use strict";function n(e){return ` +
	`e&&e.__esModule&&typeof e.default!=="undefined"?e.default:e}const o=n(t);const s=o.extend(` +
	`"test.controller.Main",{sayHello:function t(){e.show("Hello World!")}});return s});
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	// Existing inline source map is moved into a separate file
	const expectedDbgContent = content.replace(/data:application\/json;charset=utf-8;base64,.+/, "test-dbg.controller.js.map\n");
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox",` +
		`"__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend",` +
		`"sayHello","_sayHello","show"],"sources":["test.controller.ts"],"mappings":";;;AAAA,aAAAA,IAAAC,GAAAC,OAAA,` +
		`iDAAAC,EAAAC,GAAA,sBAAAC,EAAAC,GAAA,OAAAA,KAAAC,mBAAAD,EAAAE,UAAA,YAAAF,EAAAE,QAAAF,CAAA,OAIOG,EAAcJ,EAAAD,` +
		`GAErB,MAGqBM,EAAaD,EAAcE,OAAA,wBACxCC,SAAQ,SAAAC,IACdV,EAAWW,KAAK,eACjB,IAAC,OAHmBJ,CAAI"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
	const expectedDbgSourceMap = `{"version":3,"file":"test-dbg.controller.js","names":["sap","ui","define",` +
		`"MessageBox","__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController",` +
		`"Main","extend","sayHello","_sayHello","show"],"sources":["test.controller.ts"],"mappings":"AAAA;AACA;` +
		`AACA;AAFA;;AAAAA,GAAA,CAAAC,EAAA,CAAAC,MAAA,qDAAAC,UAAA,EAAAC,gBAAA;EAAA;;EAAA,SAAAC,uBAAAC,GAAA;IAAA,` +
		`OAAAA,GAAA,IAAAA,GAAA,CAAAC,UAAA,WAAAD,GAAA,CAAAE,OAAA,mBAAAF,GAAA,CAAAE,OAAA,GAAAF,GAAA;EAAA;EAAA,MAIOG,` +
		`cAAc,GAAAJ,sBAAA,CAAAD,gBAAA;EAErB;AACA;AACA;EAFA,MAGqBM,IAAI,GAASD,cAAc,CAAAE,MAAA;IACxCC,QAAQ,WAAAC,UAAA,` +
		`EAAS;MACvBV,UAAU,CAACW,IAAI,CAAC,cAAc,CAAC;IAChC;EAAC;EAAA,OAHmBJ,IAAI;AAAA"}`;
	t.deepEqual(await dbgSourceMapResource.getString(), expectedDbgSourceMap,
		"Correct source map content for debug variant ");
});

test("Input source map: Provided in separate map file", async (t) => {
	const content = `/*!
 * \${copyright}
 */
"use strict";

sap.ui.define(["sap/m/MessageBox", "./BaseController"], function (MessageBox, __BaseController) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  /**
   * @namespace test.controller
   */
  const Main = BaseController.extend("test.controller.Main", {
    sayHello: function _sayHello() {
      MessageBox.show("Hello World!");
    }
  });
  return Main;
});

${SOURCE_MAPPING_URL}=test.controller.js.map
`;

	const inputSourceMapContent =
		`{"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox","__BaseController",` +
		`"_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend","sayHello",` +
		`"_sayHello","show"],"sources":["test.controller.ts"],"mappings":"AAAA;AACA;AACA;AAFA;;AAAAA,GAAA,CAAAC,` +
		`EAAA,CAAAC,MAAA,qDAAAC,UAAA,EAAAC,gBAAA;EAAA;;EAAA,SAAAC,uBAAAC,GAAA;IAAA,OAAAA,GAAA,IAAAA,GAAA,CAAAC,` +
		`UAAA,WAAAD,GAAA,CAAAE,OAAA,mBAAAF,GAAA,CAAAE,OAAA,GAAAF,GAAA;EAAA;EAAA,MAIOG,cAAc,GAAAJ,sBAAA,CAAAD,` +
		`gBAAA;EAErB;AACA;AACA;EAFA,MAGqBM,IAAI,GAASD,cAAc,CAAAE,MAAA;IACxCC,QAAQ,WAAAC,UAAA,EAAS;MACvBV,UAAU,` +
		`CAACW,IAAI,CAAC,cAAc,CAAC;IAChC;EAAC;EAAA,OAHmBJ,IAAI;AAAA"}`;

	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			switch (filePath) {
			case "/resources/test.controller.js.map":
				cb(null, inputSourceMapContent);
				return;
			}
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs,
		options: {
			readSourceMappingUrl: true,
		}
	});

	const expected = `/*!
 * \${copyright}
 */
"use strict";sap.ui.define(["sap/m/MessageBox","./BaseController"],function(e,t){"use strict";function n(e){return ` +
	`e&&e.__esModule&&typeof e.default!=="undefined"?e.default:e}const o=n(t);const s=o.extend(` +
	`"test.controller.Main",{sayHello:function t(){e.show("Hello World!")}});return s});
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	const expectedDbgContent = content.replace("test.controller.js.map", "test-dbg.controller.js.map");
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox",` +
		`"__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend",` +
		`"sayHello","_sayHello","show"],"sources":["test.controller.ts"],"mappings":";;;AAAA,aAAAA,IAAAC,GAAAC,OAAA,` +
		`iDAAAC,EAAAC,GAAA,sBAAAC,EAAAC,GAAA,OAAAA,KAAAC,mBAAAD,EAAAE,UAAA,YAAAF,EAAAE,QAAAF,CAAA,OAIOG,EAAcJ,EAAAD,` +
		`GAErB,MAGqBM,EAAaD,EAAcE,OAAA,wBACxCC,SAAQ,SAAAC,IACdV,EAAWW,KAAK,eACjB,IAAC,OAHmBJ,CAAI"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
	const expectedDbgSourceMap = `{"version":3,"file":"test-dbg.controller.js","names":["sap","ui","define",` +
		`"MessageBox","__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController",` +
		`"Main","extend","sayHello","_sayHello","show"],"sources":["test.controller.ts"],"mappings":"AAAA;AACA;` +
		`AACA;AAFA;;AAAAA,GAAA,CAAAC,EAAA,CAAAC,MAAA,qDAAAC,UAAA,EAAAC,gBAAA;EAAA;;EAAA,SAAAC,uBAAAC,GAAA;IAAA,` +
		`OAAAA,GAAA,IAAAA,GAAA,CAAAC,UAAA,WAAAD,GAAA,CAAAE,OAAA,mBAAAF,GAAA,CAAAE,OAAA,GAAAF,GAAA;EAAA;EAAA,MAIOG,` +
		`cAAc,GAAAJ,sBAAA,CAAAD,gBAAA;EAErB;AACA;AACA;EAFA,MAGqBM,IAAI,GAASD,cAAc,CAAAE,MAAA;IACxCC,QAAQ,WAAAC,UAAA,` +
		`EAAS;MACvBV,UAAU,CAACW,IAAI,CAAC,cAAc,CAAC;IAChC;EAAC;EAAA,OAHmBJ,IAAI;AAAA"}`;
	t.deepEqual(await dbgSourceMapResource.getString(), expectedDbgSourceMap,
		"Correct source map content for debug variant ");
});

test("Input source map: Provided inline with sources content", async (t) => {
	const content = `/*!
 * \${copyright}
 */
"use strict";

sap.ui.define(["sap/m/MessageBox", "./BaseController"], function (MessageBox, __BaseController) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  /**
   * @namespace test.controller
   */
  const Main = BaseController.extend("test.controller.Main", {
    sayHello: function _sayHello() {
      MessageBox.show("Hello World!");
    }
  });
  return Main;
});

${SOURCE_MAPPING_URL}=data:application/json;charset=utf-8;base64,` +
	`eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC5jb250cm9sbGVyLmpzIiwibmFtZXMiOlsic2FwIiwidWkiLCJkZWZpbmUiLCJNZXNzYWdlQm94I` +
	`iwiX19CYXNlQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIkJhc2VDb2` +
	`50cm9sbGVyIiwiTWFpbiIsImV4dGVuZCIsInNheUhlbGxvIiwiX3NheUhlbGxvIiwic2hvdyJdLCJzb3VyY2VzIjpbInRlc3QuY29udHJvbGx` +
	`lci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiFcbiAqICR7Y29weXJpZ2h0fVxuICovXG5pbXBvcnQgTWVzc2FnZUJveCBmcm9tIFwic2Fw` +
	`L20vTWVzc2FnZUJveFwiO1xuaW1wb3J0IEJhc2VDb250cm9sbGVyIGZyb20gXCIuL0Jhc2VDb250cm9sbGVyXCI7XG5cbi8qKlxuICogQG5hb` +
	`WVzcGFjZSBjb20ubWIudHMudGVzdGFwcC5jb250cm9sbGVyXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1haW4gZXh0ZW5kcyBCYXNlQ2` +
	`9udHJvbGxlciB7XG5cdHB1YmxpYyBzYXlIZWxsbygpOiB2b2lkIHtcblx0TWVzc2FnZUJveC5zaG93KFwiSGVsbG8gV29ybGQhXCIpO1xuXHR` +
	`9XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUZBOztBQUFBQSxHQUFBLENBQUFDLEVBQUEsQ0FBQUMsTUFBQSxxREFBQUMs` +
	`VUFBQSxFQUFBQyxnQkFBQTtFQUFBOztFQUFBLFNBQUFDLHVCQUFBQyxHQUFBO0lBQUEsT0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQ` +
	`UEsV0FBQUQsR0FBQSxDQUFBRSxPQUFBLG1CQUFBRixHQUFBLENBQUFFLE9BQUEsR0FBQUYsR0FBQTtFQUFBO0VBQUEsTUFJT0csY0FBYyxHQU` +
	`FBSixzQkFBQSxDQUFBRCxnQkFBQTtFQUVyQjtBQUNBO0FBQ0E7RUFGQSxNQUdxQk0sSUFBSSxHQUFTRCxjQUFjLENBQUFFLE1BQUE7SUFDeEN` +
	`DLFFBQVEsV0FBQUMsVUFBQSxFQUFTO01BQ3ZCVixVQUFVLENBQUNXLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDaEM7RUFBQztFQUFBLE9BSG1C` +
	`SixJQUFJO0FBQUEifQ==`;

	/* The above is a base64 encoded version of the following string
		(identical to one in the next input source map test below): */
	// eslint-disable-next-line
	// {"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox","__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend","sayHello","_sayHello","show"],"sources":["test.controller.ts"],"sourcesContent":["/*!\n * ${copyright}\n */\nimport MessageBox from \"sap/m/MessageBox\";\nimport BaseController from \"./BaseController\";\n\n/**\n * @namespace com.mb.ts.testapp.controller\n */\nexport default class Main extends BaseController {\n\tpublic sayHello(): void {\n\tMessageBox.show(\"Hello World!\");\n\t}\n}\n"],"mappings":"AAAA;AACA;AACA;AAFA;;AAAAA,GAAA,CAAAC,EAAA,CAAAC,MAAA,qDAAAC,UAAA,EAAAC,gBAAA;EAAA;;EAAA,SAAAC,uBAAAC,GAAA;IAAA,OAAAA,GAAA,IAAAA,GAAA,CAAAC,UAAA,WAAAD,GAAA,CAAAE,OAAA,mBAAAF,GAAA,CAAAE,OAAA,GAAAF,GAAA;EAAA;EAAA,MAIOG,cAAc,GAAAJ,sBAAA,CAAAD,gBAAA;EAErB;AACA;AACA;EAFA,MAGqBM,IAAI,GAASD,cAAc,CAAAE,MAAA;IACxCC,QAAQ,WAAAC,UAAA,EAAS;MACvBV,UAAU,CAACW,IAAI,CAAC,cAAc,CAAC;IAChC;EAAC;EAAA,OAHmBJ,IAAI;AAAA"}

	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			// We don't expect this test to read any files, so always throw an error here
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs,
		options: {
			readSourceMappingUrl: true,
		}
	});

	const expected = `/*!
 * \${copyright}
 */
"use strict";sap.ui.define(["sap/m/MessageBox","./BaseController"],function(e,t){"use strict";function n(e){return ` +
	`e&&e.__esModule&&typeof e.default!=="undefined"?e.default:e}const o=n(t);const s=o.extend(` +
	`"test.controller.Main",{sayHello:function t(){e.show("Hello World!")}});return s});
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	// Existing inline source map is moved into a separate file
	// Both source maps still contain the "sourcesContent" attribute
	const expectedDbgContent = content.replace(/data:application\/json;charset=utf-8;base64,.+/, "test-dbg.controller.js.map\n");
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox",` +
		`"__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend",` +
		`"sayHello","_sayHello","show"],"sources":["test.controller.ts"],"sourcesContent":["/*!\\n * \${copyright}` +
		`\\n */\\nimport MessageBox from \\"sap/m/MessageBox\\";\\nimport BaseController from \\"./BaseController\\";` +
		`\\n\\n/**\\n * @namespace com.mb.ts.testapp.controller\\n */\\nexport default class Main extends ` +
		`BaseController {\\n\\tpublic sayHello(): void {\\n\\tMessageBox.show(\\"Hello World!\\");\\n\\t}\\n}\\n"],` +
		`"mappings":";;;AAAA,aAAAA,IAAAC,GAAAC,OAAA,` +
		`iDAAAC,EAAAC,GAAA,sBAAAC,EAAAC,GAAA,OAAAA,KAAAC,mBAAAD,EAAAE,UAAA,YAAAF,EAAAE,QAAAF,CAAA,OAIOG,EAAcJ,EAAAD,` +
		`GAErB,MAGqBM,EAAaD,EAAcE,OAAA,wBACxCC,SAAQ,SAAAC,IACdV,EAAWW,KAAK,eACjB,IAAC,OAHmBJ,CAAI"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
	const expectedDbgSourceMap = `{"version":3,"file":"test-dbg.controller.js","names":["sap","ui","define",` +
		`"MessageBox","__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController",` +
		`"Main","extend","sayHello","_sayHello","show"],"sources":["test.controller.ts"],"sourcesContent":["/*!\\n` +
		` * \${copyright}\\n */\\nimport MessageBox from \\"sap/m/MessageBox\\";\\nimport BaseController from ` +
		`\\"./BaseController\\";\\n\\n/**\\n * @namespace com.mb.ts.testapp.controller\\n */\\nexport default class ` +
		`Main extends BaseController {\\n\\tpublic sayHello(): void {\\n\\tMessageBox.show(\\"Hello World!\\");` +
		`\\n\\t}\\n}\\n"],` +
		`"mappings":"AAAA;AACA;` +
		`AACA;AAFA;;AAAAA,GAAA,CAAAC,EAAA,CAAAC,MAAA,qDAAAC,UAAA,EAAAC,gBAAA;EAAA;;EAAA,SAAAC,uBAAAC,GAAA;IAAA,` +
		`OAAAA,GAAA,IAAAA,GAAA,CAAAC,UAAA,WAAAD,GAAA,CAAAE,OAAA,mBAAAF,GAAA,CAAAE,OAAA,GAAAF,GAAA;EAAA;EAAA,MAIOG,` +
		`cAAc,GAAAJ,sBAAA,CAAAD,gBAAA;EAErB;AACA;AACA;EAFA,MAGqBM,IAAI,GAASD,cAAc,CAAAE,MAAA;IACxCC,QAAQ,WAAAC,UAAA,` +
		`EAAS;MACvBV,UAAU,CAACW,IAAI,CAAC,cAAc,CAAC;IAChC;EAAC;EAAA,OAHmBJ,IAAI;AAAA"}`;
	t.deepEqual(await dbgSourceMapResource.getString(), expectedDbgSourceMap,
		"Correct source map content for debug variant ");
});

test("Input source map: Reference is ignored in default configuration", async (t) => {
	const content = `/*!
 * \${copyright}
 */
"use strict";

sap.ui.define(["sap/m/MessageBox", "./BaseController"], function (MessageBox, __BaseController) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  /**
   * @namespace test.controller
   */
  const Main = BaseController.extend("test.controller.Main", {
    sayHello: function _sayHello() {
      MessageBox.show("Hello World!");
    }
  });
  return Main;
});

${SOURCE_MAPPING_URL}=test.controller.js.map
`;

	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			// We don't expect this test to read any files, so always throw an error here
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs
	});

	const expected = `/*!
 * \${copyright}
 */
"use strict";sap.ui.define(["sap/m/MessageBox","./BaseController"],function(e,t){"use strict";function n(e){return ` +
	`e&&e.__esModule&&typeof e.default!=="undefined"?e.default:e}const o=n(t);const s=o.extend(` +
	`"test.controller.Main",{sayHello:function t(){e.show("Hello World!")}});return s});
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	const expectedDbgContent = content.replace(/\/\/#.*\s+$/, ""); // Remove sourceMappingURL reference
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox",` +
	`"__BaseController","_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend",` +
	`"sayHello","_sayHello","show"],"sources":["test-dbg.controller.js"],"mappings":";;;AAGA,aAEAA,IAAIC,GAAGC,OAAO,` +
	`CAAC,mBAAoB,oBAAqB,SAAUC,EAAYC,GAC5E,aAEA,SAASC,EAAuBC,GAC9B,OAAOA,GAAOA,EAAIC,mBAAqBD,EAAIE,UAAY,YAAcF,EAAIE,` +
	`QAAUF,CACrF,CACA,MAAMG,EAAiBJ,EAAuBD,GAI9C,MAAMM,EAAOD,EAAeE,OAAO,uBAAwB,CACzDC,SAAU,SAASC,IACjBV,EAAWW,KAAK,` +
	`eAClB,IAEF,OAAOJ,CACT"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
	t.is(dbgSourceMapResource, undefined,
		"No source map resource has been created for the debug variant resource");
});

test("Input source map: Inline source map is ignored in default configuration", async (t) => {
	const content = `console.log("Hello");
${SOURCE_MAPPING_URL}=data:application/json;charset=utf-8;base64,foo
`;

	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			// We don't expect this test to read any files, so always throw an error here
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs
	});

	const expected = `console.log("Hello");
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	const expectedDbgContent = content.replace(/\/\/#.*\s+$/, ""); // Remove sourceMappingURL reference
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	t.is(dbgSourceMapResource, undefined,
		"No source map resource has been created for the debug variant resource");
});

test("Input source map: Resource has been modified by previous tasks", async (t) => {
	const content = `"use strict";

/*!
 * (c) Copyright Test File
 * Demo Content Only
 */
console.log("Hello");
${SOURCE_MAPPING_URL}=Demo.view.js.map
`;

	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			// We don't expect this test to read any files, so always throw an error here
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/Demo.view.js",
		string: content,
		sourceMetadata: {
			contentModified: true // Flag content as modified
		}
	});
	const [{resource, dbgResource, sourceMapResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs,
		options: {
			readSourceMappingUrl: true
		}
	});

	const expected = `"use strict";
/*!
 * (c) Copyright Test File
 * Demo Content Only
 */console.log("Hello");
${SOURCE_MAPPING_URL}=Demo.view.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	const expectedDbgContent = content.replace(/\/\/#.*\s+$/, ""); // Remove sourceMappingURL reference
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"Demo.view.js","names":["console","log"],` +
	`"sources":["Demo-dbg.view.js"],"mappings":"AAAA;;;;GAMAA,QAAQC,IAAI"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
	t.is(dbgSourceMapResource, undefined,
		"No source map resource has been created for the debug variant resource");
});

test("Input source map: Non-standard name referenced", async (t) => {
	const content = `"use strict";

/*!
 * (c) Copyright Test File
 * Demo Content Only
 */
console.log("Hello");
${SOURCE_MAPPING_URL}=../different-name.map
`;
	const inputSourceMapContent =
		`{"version":3,"file":"Demo.view.js","names":["console","log"],"sources":["Demo.view.ts"],` +
		`"mappings":";;AAAA;AACA;AACA;AACA;AACCA,OAAO,CAACC,GAAG,CAAC,OAAO,CAAC"}`;

	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			switch (filePath) {
			case "/different-name.map":
				cb(null, inputSourceMapContent);
				return;
			}
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/Demo.view.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs,
		options: {
			readSourceMappingUrl: true
		}
	});

	const expected = `"use strict";
/*!
 * (c) Copyright Test File
 * Demo Content Only
 */console.log("Hello");
${SOURCE_MAPPING_URL}=Demo.view.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	const expectedDbgContent = content.replace("../different-name.map", "Demo-dbg.view.js.map");
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"Demo.view.js","names":["console","log"],` +
	`"sources":["Demo.view.ts"],"mappings":";;;;GAICA,QAAQC,IAAI"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
	t.is(await dbgSourceMapResource.getString(), inputSourceMapContent.replace("Demo.view.js", "Demo-dbg.view.js"),
		"Correct source map content for debug variant");
});

test("Input source map: HTTP URL is ignored", async (t) => {
	const content = `"use strict";

/*!
 * (c) Copyright Test File
 * Demo Content Only
 */
console.log("Hello");
${SOURCE_MAPPING_URL}=https://ui5.sap.com/resources/my/test/module.js.map
`;
	const fs = {
		readFile: sinon.stub().callsFake((filePath, cb) => {
			// We don't expect this test to read any files, so always throw an error here
			const err = new Error("ENOENT: no such file or directory, open " + filePath);
			err.code = "ENOENT";
			cb(err);
		})
	};

	const testResource = createResource({
		path: "/resources/Test.js",
		string: content
	});
	const [{resource, dbgResource, dbgSourceMapResource}] = await minifier({
		resources: [testResource],
		fs,
		options: {
			readSourceMappingUrl: true
		}
	});

	const expected = `"use strict";
/*!
 * (c) Copyright Test File
 * Demo Content Only
 */console.log("Hello");
${SOURCE_MAPPING_URL}=Test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	const expectedDbgContent = content.replace(/\/\/#.*\s+$/, ""); // Remove sourceMappingURL reference
	t.deepEqual(await dbgResource.getString(), expectedDbgContent, "Correct debug content");
	t.is(dbgSourceMapResource, undefined,
		"No source map resource has been created for the debug variant resource");
});

test("Different copyright", async (t) => {
	const content = `
/*
 * Copyright SAPUI5 Developers and other contributors
 */
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();
`;
	const testResource = createResource({
		path: "/test.view.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource}] = await minifier({
		resources: [testResource]
	});

	const expected = `/*
 * Copyright SAPUI5 Developers and other contributors
 */
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.view.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	t.deepEqual(await dbgResource.getString(), content, "Correct debug content");
	const expectedSourceMap =
		`{"version":3,"file":"test.view.js",` +
		`"names":["test","paramA","variableA","console","log"],"sources":["test-dbg.view.js"],` +
		`"mappings":";;;AAIA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
});

test("Should not detect '^ (c) ^' as copyright comment", async (t) => {
	const content = `// ^ (c) ^`;
	const testResource = createResource({
		path: "/test.view.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource],
		options: {
			addSourceMappingUrl: false
		}
	});

	t.is(await resource.getString(), "", "Comment should be removed");
});

test("minify raw module (@ui5-bundle-raw-include)", async (t) => {
	const content = `
//@ui5-bundle-raw-include sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource]
	});

	const expected = `//@ui5-bundle-raw-include sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("minify raw module (@ui5-bundle)", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource]
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("addSourceMappingUrl=false", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource],
		options: {
			addSourceMappingUrl: false
		}
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("addSourceMappingUrl=true", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource],
		options: {
			addSourceMappingUrl: true
		}
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("empty options object (addSourceMappingUrl defaults to true)", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource],
		options: {}
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("minification error", async (t) => {
	const content = `
this code can't be parsed!`;

	const testResource = createResource({
		path: "/test.js",
		string: content
	});
	const error = await t.throwsAsync(minifier({
		resources: [testResource]
	}));

	t.regex(error.message, /Minification failed with error/, "Error should contain expected message");
	t.regex(error.message, /test\.js/, "Error should contain filename");
	t.regex(error.message, /col/, "Error should contain col");
	t.regex(error.message, /pos/, "Error should contain pos");
	t.regex(error.message, /line/, "Error should contain line");
});

test("getSourceMapFromUrl: Base64", async (t) => {
	const {getSourceMapFromUrl} = __localFunctions__;
	const readFileStub = sinon.stub();
	const sourceMappingUrl = `data:application/json;charset=utf-8;base64,` +
	`eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC5jb250cm9sbGVyLmpzIiwibmFtZXMiOlsic2FwIiwidWkiLCJkZWZpbmUiLCJNZXNzYWdlQm94Ii` +
	`wiX19CYXNlQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIkJhc2VDb250` +
	`cm9sbGVyIiwiTWFpbiIsImV4dGVuZCIsInNheUhlbGxvIiwiX3NheUhlbGxvIiwic2hvdyJdLCJzb3VyY2VzIjpbInRlc3QuY29udHJvbGxlci` +
	`50cyJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBRkE7O0FBQUFBLEdBQUEsQ0FBQUMsRUFBQSxDQUFBQyxNQUFBLHFEQUFBQyxVQUFB` +
	`LEVBQUFDLGdCQUFBO0VBQUE7O0VBQUEsU0FBQUMsdUJBQUFDLEdBQUE7SUFBQSxPQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxXQU` +
	`FBRCxHQUFBLENBQUFFLE9BQUEsbUJBQUFGLEdBQUEsQ0FBQUUsT0FBQSxHQUFBRixHQUFBO0VBQUE7RUFBQSxNQUlPRyxjQUFjLEdBQUFKLHNC` +
	`QUFBLENBQUFELGdCQUFBO0VBRXJCO0FBQ0E7QUFDQTtFQUZBLE1BR3FCTSxJQUFJLEdBQVNELGNBQWMsQ0FBQUUsTUFBQTtJQUN4Q0MsUUFBUS` +
	`xXQUFBQyxVQUFBLEVBQVM7TUFDdkJWLFVBQVUsQ0FBQ1csSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUNoQztFQUFDO0VBQUEsT0FIbUJKLElBQUk7` +
	`QUFBQSJ9`;
	// The above is a base64 encoded version of the following string
	// (identical to one in the inline-input source map test somewhere above):
	const decodedSourceMap =
		`{"version":3,"file":"test.controller.js","names":["sap","ui","define","MessageBox","__BaseController",` +
		`"_interopRequireDefault","obj","__esModule","default","BaseController","Main","extend","sayHello",` +
		`"_sayHello","show"],"sources":["test.controller.ts"],"mappings":"AAAA;AACA;AACA;AAFA;;AAAAA,GAAA,CAAAC,` +
		`EAAA,CAAAC,MAAA,qDAAAC,UAAA,EAAAC,gBAAA;EAAA;;EAAA,SAAAC,uBAAAC,GAAA;IAAA,OAAAA,GAAA,IAAAA,GAAA,CAAAC,` +
		`UAAA,WAAAD,GAAA,CAAAE,OAAA,mBAAAF,GAAA,CAAAE,OAAA,GAAAF,GAAA;EAAA;EAAA,MAIOG,cAAc,GAAAJ,sBAAA,CAAAD,` +
		`gBAAA;EAErB;AACA;AACA;EAFA,MAGqBM,IAAI,GAASD,cAAc,CAAAE,MAAA;IACxCC,QAAQ,WAAAC,UAAA,EAAS;MACvBV,UAAU,` +
		`CAACW,IAAI,CAAC,cAAc,CAAC;IAChC;EAAC;EAAA,OAHmBJ,IAAI;AAAA"}`;

	const res = await getSourceMapFromUrl({
		sourceMappingUrl,
		resourcePath: "/some/module.js",
		readFile: readFileStub
	});

	t.is(res, decodedSourceMap, "Expected source map content");
	t.is(readFileStub.callCount, 0, "No files have been read");
});
test("getSourceMapFromUrl: Unexpected data: format", async (t) => {
	const {getSourceMapFromUrl} = __localFunctions__;
	const readFileStub = sinon.stub();
	const sourceMappingUrl = `data:something/json;charset=utf-8;base64,foo`;

	const res = await getSourceMapFromUrl({
		sourceMappingUrl,
		resourcePath: "/some/module.js",
		readFile: readFileStub
	});

	t.is(res, undefined, "No source map content returned");
	t.is(readFileStub.callCount, 0, "No files have been read");
});

test("getSourceMapFromUrl: File reference", async (t) => {
	const {getSourceMapFromUrl} = __localFunctions__;
	const readFileStub = sinon.stub().resolves(new Buffer("Source Map Content"));
	const sourceMappingUrl = `./other/file.map`;

	const res = await getSourceMapFromUrl({
		sourceMappingUrl,
		resourcePath: "/some/module.js",
		readFile: readFileStub
	});

	t.is(res, "Source Map Content", "Expected source map content");
	t.is(readFileStub.callCount, 1, "One file has been read");
	t.is(readFileStub.firstCall.firstArg, "/some/other/file.map", "Correct file has been read");
});

test("getSourceMapFromUrl: File reference not found", async (t) => {
	const {getSourceMapFromUrl} = __localFunctions__;
	const readFileStub = sinon.stub().rejects(new Error("Not found"));
	const sourceMappingUrl = `./other/file.map`;

	const res = await getSourceMapFromUrl({
		sourceMappingUrl,
		resourcePath: "/some/module.js",
		readFile: readFileStub
	});

	t.is(res, undefined, "No source map content returned"); // Error is suppressed
	t.is(readFileStub.callCount, 1, "One file has been read");
	t.is(readFileStub.firstCall.firstArg, "/some/other/file.map", "Correct file has been read");
});

test("getSourceMapFromUrl: HTTPS URL reference", async (t) => {
	const {getSourceMapFromUrl} = __localFunctions__;
	const readFileStub = sinon.stub().resolves(new Buffer("Source Map Content"));
	const sourceMappingUrl = `https://ui5.sap.com/resources/my/test/module.js.map`;

	const res = await getSourceMapFromUrl({
		sourceMappingUrl,
		resourcePath: "/some/module.js",
		readFile: readFileStub
	});

	t.is(res, undefined, "No source map content returned");
	t.is(readFileStub.callCount, 0, "No files has been read");
});

test("getSourceMapFromUrl: Absolute path reference", async (t) => {
	const {getSourceMapFromUrl} = __localFunctions__;
	const readFileStub = sinon.stub().resolves(new Buffer("Source Map Content"));
	const sourceMappingUrl = `/some/file.map`;

	const res = await getSourceMapFromUrl({
		sourceMappingUrl,
		resourcePath: "/some/module.js",
		readFile: readFileStub
	});

	t.is(res, undefined, "No source map content returned");
	t.is(readFileStub.callCount, 0, "No files has been read");
});

