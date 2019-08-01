const test = require("ava");

const resourceFactory = require("@ui5/fs").resourceFactory;
const fsInterface = require("@ui5/fs").fsInterface;

const themeBuilderProcessor = require("../../../lib/processors/themeBuilder");
const ThemeBuilder = require("../../../lib/processors/themeBuilder").ThemeBuilder;

function prepareResources({library} = {}) {
	const input =
`@someColor: black;
.someClass {
	color: @someColor;
	padding: 1px 2px 3px 4px;
}`;

	const memoryAdapter = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	let lessFilePath;
	if (library === false) {
		lessFilePath = "/resources/foo.less";
	} else {
		lessFilePath = "/resources/sap/ui/foo/themes/base/library.source.less";
	}

	const resource = resourceFactory.createResource({
		path: lessFilePath,
		string: input
	});

	memoryAdapter.write(resource);

	return {
		resource,
		memoryAdapter
	};
}

function getExpectedResults({compress, library}) {
	let css; let cssRtl; let json;
	if (compress) {
		css =
`.someClass{color:#000;padding:1px 2px 3px 4px}`;

		cssRtl =
`.someClass{color:#000;padding:1px 4px 3px 2px}`;
		json = `{"someColor":"#000"}`;
	} else {
		css =
`.someClass {
  color: #000000;
  padding: 1px 2px 3px 4px;
}
`;

		cssRtl =
`.someClass {
  color: #000000;
  padding: 1px 4px 3px 2px;
}
`;

		json =
`{
	"someColor": "#000000"
}`;
	}

	if (library !== false) {
		css +=
`
/* Inline theming parameters */
#sap-ui-theme-sap\\.ui\\.foo{background-image:url('data:text/plain;utf-8,%7B%22someColor%22%3A%22%23${compress ? "000" : "000000"}%22%7D')}
`;
		cssRtl +=
`
/* Inline theming parameters */
#sap-ui-theme-sap\\.ui\\.foo{background-image:url('data:text/plain;utf-8,%7B%22someColor%22%3A%22%23${compress ? "000" : "000000"}%22%7D')}
`;
	}

	return {css, cssRtl, json};
}

test("Processor: Builds a less file (default options)", async (t) => {
	const {resource, memoryAdapter} = prepareResources();

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilderProcessor({
		resources: [resource],
		fs: fsInterface(memoryAdapter)
	});

	const expected = getExpectedResults({compress: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("Processor: Builds a less file (compress = true)", async (t) => {
	const {resource, memoryAdapter} = prepareResources();

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
	const {resource, memoryAdapter} = prepareResources();

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
	const {resource, memoryAdapter} = prepareResources({library: false});

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
	const {resource, memoryAdapter} = prepareResources();

	const themeBuilder = new ThemeBuilder({fs: fsInterface(memoryAdapter)});

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilder.build([resource]);

	const expected = getExpectedResults({compress: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});

test("ThemeBuilder: Builds a less file (compress = true)", async (t) => {
	const {resource, memoryAdapter} = prepareResources();

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
	const {resource, memoryAdapter} = prepareResources();

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
	const {resource, memoryAdapter} = prepareResources({library: false});

	const themeBuilder = new ThemeBuilder({fs: fsInterface(memoryAdapter)});

	const [cssResource, cssRtlResource, jsonResource] = await themeBuilder.build([resource], {
		compress: false
	});

	const expected = getExpectedResults({compress: false, library: false});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
});
