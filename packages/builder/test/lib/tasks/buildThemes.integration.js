const test = require("ava");

const ui5Builder = require("../../../");
const tasks = ui5Builder.builder.tasks;
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test("integration: simple", (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader, writer});
	const dependencies = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	const content =
`@deepSea: #123456;
.fluffyHammer {
  color: @deepSea;
  padding: 1px 2px 3px 4px;
}`;
	const cssExpected =
`.fluffyHammer{color:#123456;padding:1px 2px 3px 4px}
/* Inline theming parameters */
#sap-ui-theme-super\\.duper\\.looper{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const cssRtlExpected =
`.fluffyHammer{color:#123456;padding:1px 4px 3px 2px}
/* Inline theming parameters */
#sap-ui-theme-super\\.duper\\.looper{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const parametersExpected =
`{"deepSea":"#123456"}`;
	const lessPath = "/resources/super/duper/looper/themes/brightlight/library.source.less";
	const cssPath = "/resources/super/duper/looper/themes/brightlight/library.css";
	const cssRtlPath = "/resources/super/duper/looper/themes/brightlight/library-RTL.css";
	const parametersPath = "/resources/super/duper/looper/themes/brightlight/library-parameters.json";

	const resource = resourceFactory.createResource({
		path: lessPath,
		string: content
	});
	return reader.write(resource).then(() => {
		return tasks.buildThemes({
			workspace: duplexCollection,
			dependencies: dependencies,
			options: {
				inputPattern: "/resources/**/themes/**/library.source.less"
			}
		}).then(() => {
			return Promise.all([
				writer.byPath(cssPath),
				writer.byPath(cssRtlPath),
				writer.byPath(parametersPath)
			]);
		}).then(([cssResource, cssRtlResource, parametersResource]) => {
			t.truthy(cssResource, "CSS resource has been created");
			t.truthy(cssRtlResource, "CSS right-to-left resource has been created");
			t.truthy(parametersResource, "Parameters JSON resource has been created");

			return Promise.all([
				cssResource.getBuffer(),
				cssRtlResource.getBuffer(),
				parametersResource.getBuffer()
			]);
		}).then(([cssBuffer, cssRtlBuffer, parametersBuffer]) => {
			t.deepEqual(cssBuffer.toString(), cssExpected, "Correct CSS content");
			t.deepEqual(cssRtlBuffer.toString(), cssRtlExpected, "Correct CSS right-to-left content");
			t.deepEqual(parametersBuffer.toString(), parametersExpected, "Correct parameters JSON content");
		});
	});
});

test("integration: imports", (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader, writer});
	const dependencies = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const lessContent =
`@import "variables.less";
.fluffyHammer {
  color: @deepSea;
  padding: 1px 2px 3px 4px;
}`;
	const lessVariablesContent =
"@deepSea: #123456;";
	const cssExpected =
`.fluffyHammer{color:#123456;padding:1px 2px 3px 4px}
/* Inline theming parameters */
#sap-ui-theme-super\\.duper\\.looper{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const cssRtlExpected =
`.fluffyHammer{color:#123456;padding:1px 4px 3px 2px}
/* Inline theming parameters */
#sap-ui-theme-super\\.duper\\.looper{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const parametersExpected =
`{"deepSea":"#123456"}`;
	const lessPath = "/resources/super/duper/looper/themes/brightlight/library.source.less";
	const lessVariablesPath = "/resources/super/duper/looper/themes/brightlight/variables.less";
	const cssPath = "/resources/super/duper/looper/themes/brightlight/library.css";
	const cssRtlPath = "/resources/super/duper/looper/themes/brightlight/library-RTL.css";
	const parametersPath = "/resources/super/duper/looper/themes/brightlight/library-parameters.json";

	const lessResource = resourceFactory.createResource({
		path: lessPath,
		string: lessContent
	});

	const lessVariablesResource = resourceFactory.createResource({
		path: lessVariablesPath,
		string: lessVariablesContent
	});

	return Promise.all([lessResource, lessVariablesResource].map((resource) => {
		return reader.write(resource);
	})).then(() => {
		return tasks.buildThemes({
			workspace: duplexCollection,
			dependencies: dependencies,
			options: {
				inputPattern: "/resources/**/themes/**/library.source.less"
			}
		}).then(() => {
			return Promise.all([
				writer.byPath(cssPath),
				writer.byPath(cssRtlPath),
				writer.byPath(parametersPath)
			]);
		}).then(([cssResource, cssRtlResource, parametersResource]) => {
			t.truthy(cssResource, "CSS resource has been created");
			t.truthy(cssRtlResource, "CSS right-to-left resource has been created");
			t.truthy(parametersResource, "Parameters JSON resource has been created");

			return Promise.all([
				cssResource.getBuffer(),
				cssRtlResource.getBuffer(),
				parametersResource.getBuffer()
			]);
		}).then(([cssBuffer, cssRtlBuffer, parametersBuffer]) => {
			t.deepEqual(cssBuffer.toString(), cssExpected, "Correct CSS content");
			t.deepEqual(cssRtlBuffer.toString(), cssRtlExpected, "Correct CSS right-to-left content");
			t.deepEqual(parametersBuffer.toString(), parametersExpected, "Correct parameters JSON content");
		});
	});
});
