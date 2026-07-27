import test from "ava";
import {createAdapter, createResource} from "@ui5/fs/resourceFactory";
import fsInterface from "@ui5/fs/fsInterface";

import themeBuilderProcessor from "../../../lib/processors/themeBuilder.js";
import {ThemeBuilder} from "../../../lib/processors/themeBuilder.js";

async function prepareResources({library} = {}) {
	const input =
`@someColor: black;
.someClass {
	color: @someColor;
	padding: 1px 2px 3px 4px;
}`;

	const memoryAdapter = createAdapter({
		virBasePath: "/"
	});

	let lessFilePath;
	if (library === false) {
		lessFilePath = "/resources/foo.less";
	} else {
		lessFilePath = "/resources/sap/ui/foo/themes/base/library.source.less";
	}

	const resource = createResource({
		path: lessFilePath,
		string: input
	});

	await memoryAdapter.write(resource);

	return {
		resource,
		memoryAdapter
	};
}

function getExpectedResults({compress, library}) {
	const result = {};
	if (compress) {
		result.css =
`.someClass{color:#000;padding:1px 2px 3px 4px}`;

		result.cssRtl =
`.someClass{color:#000;padding:1px 4px 3px 2px}`;
		result.json = `{"someColor":"#000"}`;
	} else {
		result.css =
`.someClass {
  color: #000000;
  padding: 1px 2px 3px 4px;
}
`;

		result.cssRtl =
`.someClass {
  color: #000000;
  padding: 1px 4px 3px 2px;
}
`;

		result.json =
`{
	"someColor": "#000000"
}`;
	}

	if (library !== false) {
		result.css +=
`
/* Inline theming parameters */
#sap-ui-theme-sap\\.ui\\.foo{background-image:url('data:text/plain;utf-8,%7B%22someColor%22%3A%22%23` +
`${compress ? "000" : "000000"}%22%7D')}
`;
		result.cssRtl +=
`
/* Inline theming parameters */
#sap-ui-theme-sap\\.ui\\.foo{background-image:url('data:text/plain;utf-8,%7B%22someColor%22%3A%22%23` +
`${compress ? "000" : "000000"}%22%7D')}
`;
	}

	return result;
}

test("Processor: Builds a less file (default options)", async (t) => {
	const {resource, memoryAdapter} = await prepareResources();

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilderProcessor({
		resources: [resource],
		fs: fsInterface(memoryAdapter)
	});

	const expected = getExpectedResults({compress: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");

	t.is(cssResource.getPath(), "/resources/sap/ui/foo/themes/base/library.css", "CSS resource path should be correct");
	t.is(cssRtlResource.getPath(), "/resources/sap/ui/foo/themes/base/library-RTL.css",
		"Right-to-left CSS resource path should be correct");
	t.is(jsonResource.getPath(), "/resources/sap/ui/foo/themes/base/library-parameters.json",
		"JSON resource path should be correct");
});

test("Processor: Builds a less file (compress = true)", async (t) => {
	const {resource, memoryAdapter} = await prepareResources();

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilderProcessor({
		resources: [resource],
		fs: fsInterface(memoryAdapter),
		options: {
			compress: true
		}
	});

	const expected = getExpectedResults({compress: true});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("Processor: Builds a less file (compress = false)", async (t) => {
	const {resource, memoryAdapter} = await prepareResources();

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilderProcessor({
		resources: [resource],
		fs: fsInterface(memoryAdapter),
		options: {
			compress: false
		}
	});

	const expected = getExpectedResults({compress: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("Processor: Builds a less file (no library)", async (t) => {
	const {resource, memoryAdapter} = await prepareResources({library: false});

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilderProcessor({
		resources: [resource],
		fs: fsInterface(memoryAdapter),
		options: {
			compress: false
		}
	});

	const expected = getExpectedResults({compress: false, library: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("ThemeBuilder: Builds a less file", async (t) => {
	const {resource, memoryAdapter} = await prepareResources();

	const themeBuilder = new ThemeBuilder({fs: fsInterface(memoryAdapter)});

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilder.build([resource]);

	const expected = getExpectedResults({compress: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("ThemeBuilder: Builds a less file (compress = true)", async (t) => {
	const {resource, memoryAdapter} = await prepareResources();

	const themeBuilder = new ThemeBuilder({fs: fsInterface(memoryAdapter)});

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilder.build([resource], {
		compress: true
	});

	const expected = getExpectedResults({compress: true});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("ThemeBuilder: Builds a less file (compress = false)", async (t) => {
	const {resource, memoryAdapter} = await prepareResources();

	const themeBuilder = new ThemeBuilder({fs: fsInterface(memoryAdapter)});

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilder.build([resource], {
		compress: false
	});

	const expected = getExpectedResults({compress: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("ThemeBuilder: Builds a less file (no library)", async (t) => {
	const {resource, memoryAdapter} = await prepareResources({library: false});

	const themeBuilder = new ThemeBuilder({fs: fsInterface(memoryAdapter)});

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilder.build([resource], {
		compress: false
	});

	const expected = getExpectedResults({compress: false, library: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});
