import test from "ava";
import buildThemes from "../../../lib/tasks/buildThemes.js";
import {createAdapter, createResource} from "@ui5/fs/resourceFactory";
import DuplexCollection from "@ui5/fs/DuplexCollection";

test("integration: simple", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const writer = createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader, writer});
	const dependencies = createAdapter({
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
#sap-ui-theme-super\\.duper\\.looper` +
`{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const cssRtlExpected =
`.fluffyHammer{color:#123456;padding:1px 4px 3px 2px}
/* Inline theming parameters */
#sap-ui-theme-super\\.duper\\.looper` +
`{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const parametersExpected =
`{"deepSea":"#123456"}`;
	const lessPath = "/resources/super/duper/looper/themes/brightlight/library.source.less";
	const cssPath = "/resources/super/duper/looper/themes/brightlight/library.css";
	const cssRtlPath = "/resources/super/duper/looper/themes/brightlight/library-RTL.css";
	const parametersPath = "/resources/super/duper/looper/themes/brightlight/library-parameters.json";

	const resource = createResource({
		path: lessPath,
		string: content
	});
	await reader.write(resource);
	await buildThemes({
		workspace: duplexCollection,
		dependencies: dependencies,
		options: {
			inputPattern: "/resources/super/duper/looper/themes/**/library.source.less"
		}
	});

	const [cssResource, cssRtlResource, parametersResource] = await Promise.all([
		writer.byPath(cssPath),
		writer.byPath(cssRtlPath),
		writer.byPath(parametersPath)
	]);

	t.truthy(cssResource, "CSS resource has been created");
	t.truthy(cssRtlResource, "CSS right-to-left resource has been created");
	t.truthy(parametersResource, "Parameters JSON resource has been created");

	const [cssBuffer, cssRtlBuffer, parametersBuffer] = await Promise.all([
		cssResource.getBuffer(),
		cssRtlResource.getBuffer(),
		parametersResource.getBuffer()
	]);

	t.deepEqual(cssBuffer.toString(), cssExpected, "Correct CSS content");
	t.deepEqual(cssRtlBuffer.toString(), cssRtlExpected, "Correct CSS right-to-left content");
	t.deepEqual(parametersBuffer.toString(), parametersExpected, "Correct parameters JSON content");
});
test("integration: imports", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const writer = createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader, writer});
	const dependencies = createAdapter({
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
#sap-ui-theme-super\\.duper\\.looper` +
`{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const cssRtlExpected =
`.fluffyHammer{color:#123456;padding:1px 4px 3px 2px}
/* Inline theming parameters */
#sap-ui-theme-super\\.duper\\.looper` +
`{background-image:url('data:text/plain;utf-8,%7B%22deepSea%22%3A%22%23123456%22%7D')}
`;
	const parametersExpected =
`{"deepSea":"#123456"}`;
	const lessPath = "/resources/super/duper/looper/themes/brightlight/library.source.less";
	const lessVariablesPath = "/resources/super/duper/looper/themes/brightlight/variables.less";
	const cssPath = "/resources/super/duper/looper/themes/brightlight/library.css";
	const cssRtlPath = "/resources/super/duper/looper/themes/brightlight/library-RTL.css";
	const parametersPath = "/resources/super/duper/looper/themes/brightlight/library-parameters.json";

	const lessResource = createResource({
		path: lessPath,
		string: lessContent
	});

	const lessVariablesResource = createResource({
		path: lessVariablesPath,
		string: lessVariablesContent
	});

	await Promise.all([lessResource, lessVariablesResource].map((resource) => {
		return reader.write(resource);
	}));

	await buildThemes({
		workspace: duplexCollection,
		dependencies: dependencies,
		options: {
			inputPattern: "/resources/super/duper/looper/themes/**/library.source.less"
		}
	});

	const [cssResource, cssRtlResource, parametersResource] = await Promise.all([
		writer.byPath(cssPath),
		writer.byPath(cssRtlPath),
		writer.byPath(parametersPath)
	]);

	t.truthy(cssResource, "CSS resource has been created");
	t.truthy(cssRtlResource, "CSS right-to-left resource has been created");
	t.truthy(parametersResource, "Parameters JSON resource has been created");

	const [cssBuffer, cssRtlBuffer, parametersBuffer] = await Promise.all([
		cssResource.getBuffer(),
		cssRtlResource.getBuffer(),
		parametersResource.getBuffer()
	]);

	t.deepEqual(cssBuffer.toString(), cssExpected, "Correct CSS content");
	t.deepEqual(cssRtlBuffer.toString(), cssRtlExpected, "Correct CSS right-to-left content");
	t.deepEqual(parametersBuffer.toString(), parametersExpected, "Correct parameters JSON content");
});
