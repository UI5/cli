const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const logger = require("@ui5/logger");
const {SemVer: Version} = require("semver");

const libraryContent = `<?xml version="1.0" encoding="UTF-8" ?>
<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
	<name>library.e</name>
	<vendor>SAP SE</vendor>
	<copyright>my copyright</copyright>
	<version>1.0.0</version>
	<documentation>Library E</documentation>

	<dependencies>
	    <dependency>
	      <libraryName>sap.ui.core</libraryName>
	    </dependency>
	</dependencies>

	<appData>
		<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
			<i18n>i18n/i18n.properties</i18n>
		</manifest>
	</appData>
</library>`;

const libraryContentSpecialChars = `<?xml version="1.0" encoding="UTF-8" ?>
<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
	<name>library.e</name>
	<vendor>SAP SE</vendor>
	<copyright>my copyright</copyright>
	<version>1.0.0</version>
	<documentation>Library E</documentation>

	<dependencies>
	    <dependency>
	      <libraryName>sap.ui.core</libraryName>
	    </dependency>
	</dependencies>

	<appData>
		<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
			<i18n>i18n(.*)./i18n(.*).properties</i18n>
		</manifest>
	</appData>
</library>`;

const expectedManifestContentObject = () => {
	return {
		"_version": "1.21.0",
		"sap.app": {
			"id": "library.e",
			"type": "library",
			"embeds": [],
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"supportedLocales": [
					"",
					"de",
					"en"
				]
			},
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "Library E",
			"description": "Library E",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {
					"sap.ui.core": {}
				}
			},
			"library": {
				"i18n": false
			}
		}
	};
};

const expectedManifestContent = JSON.stringify(expectedManifestContentObject(), null, 2);
const expectedManifestContentSpecialCharsObject = expectedManifestContentObject();
expectedManifestContentSpecialCharsObject["sap.app"]["i18n"]["bundleUrl"] = "i18n(.*)./i18n(.*).properties";
const expectedManifestContentSpecialChars = JSON.stringify(expectedManifestContentSpecialCharsObject, null, 2);

test.beforeEach((t) => {
	t.context.verboseLogStub = sinon.stub();
	t.context.errorLogStub = sinon.stub();
	sinon.stub(logger, "getLogger").returns({
		verbose: t.context.verboseLogStub,
		error: t.context.errorLogStub
	});
	t.context.getProjectVersion = sinon.stub();
	t.context.manifestCreator = mock.reRequire("../../../lib/processors/manifestCreator");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("default manifest creation", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return libraryContent;
		}
	};
	const resources = ["", "_en", "_de"].map((lang) => {
		return {
			getPath: () => {
				return `${prefix}i18n/i18n${lang}.properties`;
			}
		};
	});

	const result = await manifestCreator({libraryResource, resources, getProjectVersion, options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation (multi-line documentation)", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>library.e</name>
				<vendor>SAP SE</vendor>
				<copyright>my copyright</copyright>
				<version>1.0.0</version>
				<documentation>Library E
    uses a multi-line documentation text.</documentation>

				<dependencies>
					<dependency>
					  <libraryName>sap.ui.core</libraryName>
					</dependency>
				</dependencies>

				<appData>
					<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
						<i18n>i18n/i18n.properties</i18n>
					</manifest>
				</appData>

			</library>`;
		}
	};
	const resources = ["", "_en", "_de"].map((lang) => {
		return {
			getPath: () => {
				return `${prefix}i18n/i18n${lang}.properties`;
			}
		};
	});

	const expectedManifestContentObjectMultilineDocumentation = expectedManifestContentObject();
	expectedManifestContentObjectMultilineDocumentation["sap.app"].title =
		`Library E uses a multi-line documentation text.`;
	expectedManifestContentObjectMultilineDocumentation["sap.app"].description =
		`Library E
    uses a multi-line documentation text.`;

	const expectedManifestContentMultilineDocumentation =
		JSON.stringify(expectedManifestContentObjectMultilineDocumentation, null, 2);

	const result = await manifestCreator({libraryResource, resources, getProjectVersion, options: {}});
	t.is(await result.getString(), expectedManifestContentMultilineDocumentation, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation i18n empty string", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
				<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
					<name>library.e</name>
					<vendor>SAP SE</vendor>
					<copyright>my copyright</copyright>
					<version>1.0.0</version>
					<documentation>Library E</documentation>

					<dependencies>
					    <dependency>
					      <libraryName>sap.ui.core</libraryName>
					    </dependency>
					</dependencies>

					<appData>
						<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
							<i18n></i18n>
						</manifest>
					</appData>
				</library>`;
		}
	};

	const expectedManifestContentObjectModified = expectedManifestContentObject();
	expectedManifestContentObjectModified["sap.app"]["i18n"] = "";
	const expectedManifestContent = JSON.stringify(expectedManifestContentObjectModified, null, 2);
	const result = await manifestCreator({libraryResource, resources: [], getProjectVersion, options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation with invalid version", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
				<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
					<name>library.e</name>
					<vendor>SAP SE</vendor>
					<version>@version@</version>
					<documentation>Library E</documentation>

					<dependencies>
					    <dependency>
					      <libraryName>sap.ui.core</libraryName>
					    </dependency>
					</dependencies>

				</library>`;
		}
	};

	getProjectVersion.withArgs("library.e").returns("1.2.3");

	const expectedManifestContentObjectModified = expectedManifestContentObject();
	expectedManifestContentObjectModified["sap.app"]["i18n"] = undefined;
	expectedManifestContentObjectModified["sap.app"]["applicationVersion"]["version"] = "1.2.3";
	const expectedManifestContent = JSON.stringify(expectedManifestContentObjectModified, null, 2);
	const result = await manifestCreator({libraryResource, resources: [], getProjectVersion, options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation with sourceTemplate and thirdparty", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
				<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
					<name>library.e</name>
					<vendor>SAP SE</vendor>
					<version>@version@</version>
					<documentation>Library E</documentation>

					<dependencies>
					    <dependency>
					      <libraryName>sap.ui.core</libraryName>
					    </dependency>
					    <dependency>
					      <libraryName>my.lib</libraryName>
					    </dependency>
					</dependencies>

					<appData>
						<manifest xmlns="http://www.sap.com/ui5/buildext/manifest">
							<sourceTemplate>
								<id>myid</id>
								<version>1.2.3</version>
							</sourceTemplate>
						</manifest>
						<thirdparty xmlns="http://www.sap.com/ui5/buildext/thirdparty">
							<lib name="jquery-3" displayName="jQuery 3" version="3.5.1" homepage="https://jquery.com"></lib>
							<lib name="jquery-2" displayName="jQuery 2" version="2.2.3" homepage="https://jquery.com"></lib>
						</thirdparty>
					</appData>

				</library>`;
		}
	};

	getProjectVersion.withArgs("library.e").returns("1.2.3");
	getProjectVersion.withArgs("my.lib").returns("4.5.6");

	const expectedManifestContentObjectModified = expectedManifestContentObject();
	expectedManifestContentObjectModified["sap.app"]["i18n"] = undefined;
	expectedManifestContentObjectModified["sap.app"]["applicationVersion"]["version"] = "1.2.3";
	expectedManifestContentObjectModified["sap.app"]["sourceTemplate"]= {
		id: "myid",
		version: "1.2.3"
	};
	expectedManifestContentObjectModified["sap.app"]["openSourceComponents"]= [{
		"name": "jquery-3",
		"packagedWithMySelf": true,
		"version": "3.5.1"
	}, {
		"name": "jquery-2",
		"packagedWithMySelf": true,
		"version": "2.2.3"
	}];
	expectedManifestContentObjectModified["sap.ui5"]["dependencies"]["libs"]["my.lib"] = {
		"minVersion": "4.5.6"
	};
	const expectedManifestContent = JSON.stringify(expectedManifestContentObjectModified, null, 2);
	const result = await manifestCreator({libraryResource, resources: [], getProjectVersion, options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation no project versions", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
				<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
					<name>library.e</name>
					<vendor>SAP SE</vendor>
					<documentation>Library E</documentation>

					<dependencies>
					    <dependency>
					      <libraryName>sap.ui.core</libraryName>
					    </dependency>
					    <dependency>
					      <libraryName>my.lib</libraryName>
					    </dependency>
					</dependencies>

				</library>`;
		}
	};

	const expectedManifestContentObjectModified = expectedManifestContentObject();
	expectedManifestContentObjectModified["sap.app"]["i18n"] = undefined;
	expectedManifestContentObjectModified["sap.app"]["applicationVersion"] = {};
	expectedManifestContentObjectModified["sap.ui5"]["dependencies"]["libs"]["my.lib"] = {};
	const expectedManifestContent = JSON.stringify(expectedManifestContentObjectModified, null, 2);
	const result = await manifestCreator({libraryResource, resources: [], getProjectVersion, options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("manifest creation omitMinVersions=true", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "library.e",
			"type": "library",
			"embeds": [],
			"applicationVersion": {},
			"title": "Library E",
			"description": "Library E",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"minUI5Version": "",
				"libs": {
					"my.lib": {
						"minVersion": ""
					}
				}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/ui/mine/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
				<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
					<name>library.e</name>
					<vendor>SAP SE</vendor>
					<documentation>Library E</documentation>
					<dependencies>
					    <dependency>
					      <libraryName>my.lib</libraryName>
					    </dependency>
					</dependencies>
				</library>`;
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [],
		getProjectVersion,
		options: {
			omitMinVersions: true
		}
	});

	t.is(await result.getString(), expectedManifestContent, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation with special characters", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return libraryContentSpecialChars;
		}
	};
	const resources = ["", "_en", "_de"].map((lang) => {
		return {
			getPath: () => {
				return `${prefix}i18n(.*)./i18n(.*)${lang}.properties`;
			}
		};
	});

	// additional non-i18n resource
	resources.push({
		getPath: () => {
			return `${prefix}model/data.json`;
		}
	});

	const result = await manifestCreator({libraryResource, resources, getProjectVersion, options: {}});
	t.is(await result.getString(), expectedManifestContentSpecialChars, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation with special characters small app descriptor version", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return libraryContent;
		}
	};
	const resources = ["", "_en", "_de"].map((lang) => {
		return {
			getPath: () => {
				return `${prefix}i18n/i18n${lang}.properties`;
			}
		};
	});

	const options = {descriptorVersion: new Version("1.9.0")};
	const result = await manifestCreator({libraryResource, resources, getProjectVersion, options});
	const expectedManifestContentSmallVersion = expectedManifestContentObject();
	expectedManifestContentSmallVersion["_version"] = "1.9.0";
	expectedManifestContentSmallVersion["sap.app"]["i18n"] = "i18n/i18n.properties";
	const expectedManifestContentSmallVersionString = JSON.stringify(expectedManifestContentSmallVersion, null, 2);
	t.is(await result.getString(), expectedManifestContentSmallVersionString, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("default manifest creation with special characters very small app descriptor version", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;
	const prefix = "/resources/sap/ui/mine/";
	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return libraryContent;
		}
	};

	const options = {descriptorVersion: new Version("1.1.0")};
	const result = await manifestCreator({libraryResource, resources: [], getProjectVersion, options});
	const expectedManifestContentSmallVersion = expectedManifestContentObject();
	expectedManifestContentSmallVersion["_version"] = "1.1.0";
	expectedManifestContentSmallVersion["sap.app"]["_version"] = "1.2.0";
	expectedManifestContentSmallVersion["sap.ui"]["_version"] = "1.1.0";
	expectedManifestContentSmallVersion["sap.ui5"]["_version"] = "1.1.0";
	expectedManifestContentSmallVersion["sap.app"]["i18n"] = "i18n/i18n.properties";
	const sResult = await result.getString();
	t.deepEqual(JSON.parse(sResult), expectedManifestContentSmallVersion, "Correct result returned");
	t.is(errorLogStub.callCount, 0);
});

test.serial("manifest creation with themes", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const prefix = "/resources/sap/ui/test/";

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.ui.test",
			"type": "library",
			"embeds": [],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.ui.test",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": [
				"base", "sap_foo"
			]
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return prefix + ".library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.ui.test</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const resources = [];
	["base", "sap_foo"].forEach((name) => {
		resources.push({
			getPath: () => {
				return `${prefix}themes/${name}/some.less`;
			}
		});
		resources.push({
			getPath: () => {
				return `${prefix}themes/${name}/library.source.less`;
			}
		});
	});
	resources.push({
		getPath: () => {
			return `${prefix}js/lib/themes/invalid/some.css`;
		}
	});

	const result = await manifestCreator({
		libraryResource,
		resources,
		getProjectVersion,
		options: {}
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);
	t.is(verboseLogStub.callCount, 7);
	t.deepEqual(verboseLogStub.getCall(4).args, [
		"  sap.ui/supportedThemes determined from resources: '%s'",
		["base", "sap_foo"]
	]);
});

test.serial("manifest creation for sap/apf", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const prefix = "/resources/sap/apf/";

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/apf/.library";
		},
		getString: async () => {
			return libraryContent;
		}
	};

	const componentResource = {
		getPath: () => {
			return prefix + "Component.js";
		}
	};
	const resources = ["", "_en", "_de"].map((lang) => {
		return {
			getPath: () => {
				return `${prefix}i18n/i18n${lang}.properties`;
			}
		};
	});
	resources.push(componentResource);
	const result = await manifestCreator({
		libraryResource,
		resources,
		getProjectVersion,
		options: {}
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.is(verboseLogStub.callCount, 10);
	t.is(verboseLogStub.getCall(0).args[0], "sap.app/i18n taken from .library appData: '%s'");
	t.is(verboseLogStub.getCall(1).args[0],
		"checking component at %s");
	t.is(verboseLogStub.getCall(1).args[1], "/resources/sap/apf");
	t.is(verboseLogStub.getCall(2).args[0],
		"Package %s contains both '*.library' and 'Component.js'. " +
		"This is a known issue but can't be solved due to backward compatibility.");
	t.is(verboseLogStub.getCall(2).args[1], "/resources/sap/apf");
});

test.serial("manifest creation for sap/ui/core", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.ui.core",
			"type": "library",
			"embeds": [],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.ui.core",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/ui/core/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.ui.core</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/ui/core/Component.js";
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [componentResource],
		getProjectVersion,
		options: {}
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.is(verboseLogStub.callCount, 8);
	t.is(verboseLogStub.getCall(1).args[0],
		"  sap.app/id taken from .library: '%s'");
	t.is(verboseLogStub.getCall(1).args[1], "sap.ui.core");
});

test.serial("manifest creation with .library / Component.js at same namespace", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/Component.js";
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [componentResource],
		getProjectVersion,
		options: {}
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 1);
	t.deepEqual(errorLogStub.getCall(0).args, [
		"Package %s contains both '*.library' and 'Component.js'. " +
		"This is not supported by manifests, therefore the component won't be " +
		"listed in the library's manifest.",
		"/resources/sap/lib1"
	]);

	t.is(verboseLogStub.callCount, 8);
	t.is(verboseLogStub.getCall(1).args[0],
		"  sap.app/id taken from .library: '%s'");
	t.is(verboseLogStub.getCall(1).args[1], "sap.lib1");
});

test.serial("manifest creation with embedded component", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [
				"component1"
			],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};
	const componentManifestResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/manifest.json";
		},
		getString: async () => {
			return JSON.stringify({
				"sap.app": {
					"embeddedBy": "../"
				}
			});
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource,
			componentManifestResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  sap.app/id taken from .library: '%s'", "sap.lib1"
	]);
});

test.serial("manifest creation with embedded component (Missing 'embeddedBy')", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [
				"component1"
			],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};
	const componentManifestResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/manifest.json";
		},
		getString: async () => {
			return JSON.stringify({});
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource,
			componentManifestResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  sap.app/id taken from .library: '%s'", "sap.lib1"
	]);
});

test.serial("manifest creation with embedded component ('embeddedBy' doesn't point to library)", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [
				"component1"
			],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};
	const componentManifestResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/manifest.json";
		},
		getString: async () => {
			return JSON.stringify({
				"sap.app": {
					"embeddedBy": "../foo/"
				}
			});
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource,
			componentManifestResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  sap.app/id taken from .library: '%s'", "sap.lib1"
	]);
});

test.serial("manifest creation with embedded component ('embeddedBy' absolute path)", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [
				"component1"
			],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};
	const componentManifestResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/manifest.json";
		},
		getString: async () => {
			return JSON.stringify({
				"sap.app": {
					"embeddedBy": "/"
				}
			});
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource,
			componentManifestResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  sap.app/id taken from .library: '%s'", "sap.lib1"
	]);
});

test.serial("manifest creation with embedded component ('embeddedBy' empty string)", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [
				"component1"
			],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};
	const componentManifestResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/manifest.json";
		},
		getString: async () => {
			return JSON.stringify({
				"sap.app": {
					"embeddedBy": ""
				}
			});
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource,
			componentManifestResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);
});

test.serial("manifest creation with embedded component ('embeddedBy' object)", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [
				"component1"
			],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};
	const componentManifestResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/manifest.json";
		},
		getString: async () => {
			return JSON.stringify({
				"sap.app": {
					"embeddedBy": {
						"foo": "bar"
					}
				}
			});
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource,
			componentManifestResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);
});

test.serial("manifest creation with embedded component (no manifest.json)", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s",
		"/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  component has no accompanying manifest.json, don't list it as 'embedded'"
	]);
});

test.serial("manifest creation with embedded component (invalid manifest.json)", async (t) => {
	const {manifestCreator, errorLogStub, getProjectVersion} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.21.0",
		"sap.app": {
			"id": "sap.lib1",
			"type": "library",
			"embeds": [
				"component1"
			],
			"applicationVersion": {
				"version": "1.0.0"
			},
			"title": "sap.lib1",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui": {
			"technology": "UI5",
			"supportedThemes": []
		},
		"sap.ui5": {
			"dependencies": {
				"libs": {}
			},
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>sap.lib1</name>
				<version>1.0.0</version>
			</library>`;
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/Component.js";
		}
	};
	const componentManifestResource = {
		getPath: () => {
			return "/resources/sap/lib1/component1/manifest.json";
		},
		getString: async () => {
			return "{invalid}";
		}
	};

	const result = await manifestCreator({
		libraryResource,
		resources: [
			componentResource,
			componentManifestResource
		],
		getProjectVersion
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);
});

test.serial("manifest creation for invalid .library content", async (t) => {
	const {manifestCreator} = t.context;

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/lib1/.library";
		},
		getString: async () => {
			return `<?xml version="1.0" encoding="UTF-8" ?>
			<<>`;
		}
	};

	const error = await t.throwsAsync(manifestCreator({
		libraryResource,
		resources: []
	}));
	t.deepEqual(error.message, `Unencoded <
Line: 1
Column: 5
Char: <`, "error message for unencoded <");
});
