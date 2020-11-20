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

function getExpectedResults({compress, library, cssVariables}) {
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

	if (cssVariables) {
		result.cssVariablesSource =
`@someColor: #000000;

:root {
--someColor: @someColor;
}
`;
		result.cssVariables =
`:root {
  --someColor: #000000;
}

/* Inline theming parameters */
#sap-ui-theme-sap\\.ui\\.foo{background-image:url('data:text/plain;utf-8,%7B%22someColor%22%3A%22%23000000%22%7D')}
`;
		result.cssSkeleton =
`.someClass {
  color: var(--someColor);
  padding: 1px 2px 3px 4px;
}
`;
		result.cssSkeletonRtl =
`.someClass {
  color: var(--someColor);
  padding: 1px 4px 3px 2px;
}
`;
	}

	return result;
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

	t.is(cssResource.getPath(), "/resources/sap/ui/foo/themes/base/library.css", "CSS resource path should be correct");
	t.is(cssRtlResource.getPath(), "/resources/sap/ui/foo/themes/base/library-RTL.css",
		"Right-to-left CSS resource path should be correct");
	t.is(jsonResource.getPath(), "/resources/sap/ui/foo/themes/base/library-parameters.json",
		"JSON resource path should be correct");
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

test("Processor: Builds a less file (cssVariables = true)", async (t) => {
	const {resource, memoryAdapter} = prepareResources();

	const [
		cssResource,
		cssRtlResource,
		jsonResource,
		cssVariablesSourceResource,
		cssVariablesResource,
		cssSkeletonResource,
		cssSkeletonRtlResource
	] = await themeBuilderProcessor({
		resources: [resource],
		fs: fsInterface(memoryAdapter),
		options: {
			cssVariables: true
		}
	});

	const expected = getExpectedResults({cssVariables: true});
	t.is(await cssResource.getString(), expected.css, "CSS should be correct");
	t.is(await cssRtlResource.getString(), expected.cssRtl, "Right-to-left CSS should be correct");
	t.is(await jsonResource.getString(), expected.json, "JSON should be correct");
	t.is(await cssVariablesSourceResource.getString(), expected.cssVariablesSource,
		"CSS Variables source should be correct");
	t.is(await cssVariablesResource.getString(), expected.cssVariables,
		"CSS Variables should be correct");
	t.is(await cssSkeletonResource.getString(), expected.cssSkeleton,
		"Skeleton CSS should be correct");
	t.is(await cssSkeletonRtlResource.getString(), expected.cssSkeletonRtl,
		"Right-to-left skeleton CSS should be correct");

	t.is(cssResource.getPath(), "/resources/sap/ui/foo/themes/base/library.css",
		"CSS resource path should be correct");
	t.is(cssRtlResource.getPath(), "/resources/sap/ui/foo/themes/base/library-RTL.css",
		"Right-to-left CSS resource path should be correct");
	t.is(jsonResource.getPath(), "/resources/sap/ui/foo/themes/base/library-parameters.json",
		"JSON resource path should be correct");
	t.is(cssVariablesSourceResource.getPath(), "/resources/sap/ui/foo/themes/base/css_variables.source.less",
		"CSS Variables source path should be correct");
	t.is(cssVariablesResource.getPath(), "/resources/sap/ui/foo/themes/base/css_variables.css",
		"CSS Variables resource path should be correct");
	t.is(cssSkeletonResource.getPath(), "/resources/sap/ui/foo/themes/base/library_skeleton.css",
		"Skeleton CSS resource path should be correct");
	t.is(cssSkeletonRtlResource.getPath(), "/resources/sap/ui/foo/themes/base/library_skeleton-RTL.css",
		"Right-to-left skeleton CSS resource path should be correct");
});
