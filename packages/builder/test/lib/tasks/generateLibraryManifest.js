const test = require("ava");

const generateLibraryManifest = require("../../../lib/tasks/generateLibraryManifest");
const path = require("path");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;

function createWorkspace() {
	return resourceFactory.createAdapter({
		virBasePath: "/",
		project: {
			metadata: {
				name: "test.lib"
			},
			version: "2.0.0",
			dependencies: [
				{
					metadata: {
						name: "sap.ui.core"
					},
					version: "1.0.0"
				}
			]
		}
	});
}

function createDependencies() {
	return resourceFactory.createAdapter({
		fsBasePath: path.join(__dirname, "..", "..", "fixtures", "sap.ui.core-evo", "main", "src"),
		virBasePath: "/resources"
	});
}

async function assertCreatedManifest(t, oExpectedManifest) {
	const {workspace, dependencies, resources} = t.context;

	await Promise.all(resources.map((resource) => workspace.write(resource)));

	await generateLibraryManifest({
		workspace,
		dependencies,
		options: {
			projectName: "Test Lib"
		}
	});

	const resource = await workspace.byPath("/resources/test/lib/manifest.json");
	if (!resource) {
		t.fail("Could not find /resources/test/lib/manifest.json in target");
		return;
	}

	const buffer = await resource.getBuffer();
	t.deepEqual(JSON.parse(buffer), oExpectedManifest, "Correct content");
}

test("integration: Library without i18n bundle file", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

			</library>
		`,
		project: t.context.workspace._project
	}));

	await assertCreatedManifest(t, {
		"_version": "1.21.0",
		"sap.app": {
			applicationVersion: {
				version: "2.0.0",
			},
			description: "Test Lib",
			embeds: [],
			id: "test.lib",
			offline: true,
			resources: "resources.json",
			title: "Test Lib",
			type: "library",
		},
		"sap.ui": {
			supportedThemes: [],
			technology: "UI5",
		},
		"sap.ui5": {
			dependencies: {
				libs: {},
				minUI5Version: "1.0",
			},
			library: {
				i18n: false,
			}
		},
	});
});

test("integration: Library with i18n bundle file (messagebundle.properties)", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/messagebundle.properties",
		string: "KEY=VALUE",
		project: t.context.workspace._project
	}));
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

			</library>
		`,
		project: t.context.workspace._project
	}));

	await assertCreatedManifest(t, {
		"_version": "1.21.0",
		"sap.app": {
			applicationVersion: {
				version: "2.0.0",
			},
			description: "Test Lib",
			embeds: [],
			id: "test.lib",
			offline: true,
			resources: "resources.json",
			title: "Test Lib",
			type: "library",
		},
		"sap.ui": {
			supportedThemes: [],
			technology: "UI5",
		},
		"sap.ui5": {
			dependencies: {
				libs: {},
				minUI5Version: "1.0",
			},
			library: {
				i18n: {
					bundleUrl: "messagebundle.properties",
					supportedLocales: [""]
				}
			}
		},
	});
});

test("integration: Library with i18n=true declared in .library", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

				<appData>
					<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
						<sap.ui5>
							<library>
								<i18n>true</i18n>
							</library>
						</sap.ui5>
					</manifest>
				</appData>

			</library>
		`,
		project: t.context.workspace._project
	}));
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/messagebundle.properties",
		project: t.context.workspace._project
	}));

	await assertCreatedManifest(t, {
		"_version": "1.21.0",
		"sap.app": {
			applicationVersion: {
				version: "2.0.0",
			},
			description: "Test Lib",
			embeds: [],
			id: "test.lib",
			offline: true,
			resources: "resources.json",
			title: "Test Lib",
			type: "library",
		},
		"sap.ui": {
			supportedThemes: [],
			technology: "UI5",
		},
		"sap.ui5": {
			dependencies: {
				libs: {},
				minUI5Version: "1.0",
			},
			library: {
				i18n: {
					bundleUrl: "messagebundle.properties",
					supportedLocales: [""]
				}
			}
		},
	});
});

test("integration: Library with i18n=false declared in .library", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

				<appData>
					<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
						<sap.ui5>
							<library>
								<i18n>false</i18n>
							</library>
						</sap.ui5>
					</manifest>
				</appData>

			</library>
		`,
		project: t.context.workspace._project
	}));

	await assertCreatedManifest(t, {
		"_version": "1.21.0",
		"sap.app": {
			applicationVersion: {
				version: "2.0.0",
			},
			description: "Test Lib",
			embeds: [],
			id: "test.lib",
			offline: true,
			resources: "resources.json",
			title: "Test Lib",
			type: "library",
		},
		"sap.ui": {
			supportedThemes: [],
			technology: "UI5",
		},
		"sap.ui5": {
			dependencies: {
				libs: {},
				minUI5Version: "1.0",
			},
			library: {
				i18n: false
			}
		},
	});
});

test("integration: Library with i18n=foo.properties declared in .library", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

				<appData>
					<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
						<sap.ui5>
							<library>
								<i18n>foo.properties</i18n>
							</library>
						</sap.ui5>
					</manifest>
				</appData>

			</library>
		`,
		project: t.context.workspace._project
	}));

	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/foo.properties",
		project: t.context.workspace._project
	}));
	await assertCreatedManifest(t, {
		"_version": "1.21.0",
		"sap.app": {
			applicationVersion: {
				version: "2.0.0",
			},
			description: "Test Lib",
			embeds: [],
			id: "test.lib",
			offline: true,
			resources: "resources.json",
			title: "Test Lib",
			type: "library",
		},
		"sap.ui": {
			supportedThemes: [],
			technology: "UI5",
		},
		"sap.ui5": {
			dependencies: {
				libs: {},
				minUI5Version: "1.0",
			},
			library: {
				i18n: {
					bundleUrl: "foo.properties",
					supportedLocales: [""]
				}
			}
		},
	});
});

test("integration: Library with css=true declared in .library", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

				<appData>
					<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
						<sap.ui5>
							<library>
								<css>true</css>
							</library>
						</sap.ui5>
					</manifest>
				</appData>

			</library>
		`,
		project: t.context.workspace._project
	}));

	await assertCreatedManifest(t, {
		"_version": "1.21.0",
		"sap.app": {
			applicationVersion: {
				version: "2.0.0",
			},
			description: "Test Lib",
			embeds: [],
			id: "test.lib",
			offline: true,
			resources: "resources.json",
			title: "Test Lib",
			type: "library",
		},
		"sap.ui": {
			supportedThemes: [],
			technology: "UI5",
		},
		"sap.ui5": {
			dependencies: {
				libs: {},
				minUI5Version: "1.0",
			},
			library: {
				i18n: false
			}
		},
	});
});

test("integration: Library with css=false declared in .library", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

				<appData>
					<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
						<sap.ui5>
							<library>
								<css>false</css>
							</library>
						</sap.ui5>
					</manifest>
				</appData>

			</library>
		`,
		project: t.context.workspace._project
	}));

	await assertCreatedManifest(t, {
		"_version": "1.21.0",
		"sap.app": {
			applicationVersion: {
				version: "2.0.0",
			},
			description: "Test Lib",
			embeds: [],
			id: "test.lib",
			offline: true,
			resources: "resources.json",
			title: "Test Lib",
			type: "library",
		},
		"sap.ui": {
			supportedThemes: [],
			technology: "UI5",
		},
		"sap.ui5": {
			dependencies: {
				libs: {},
				minUI5Version: "1.0",
			},
			library: {
				i18n: false,
				css: false
			}
		},
	});
});
