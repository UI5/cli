const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const logger = require("@ui5/logger");

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
</library>`;

const expectedManifestContent = `{
  "_version": "1.9.0",
  "sap.app": {
    "id": "library.e",
    "type": "library",
    "embeds": [],
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
}`;

test.beforeEach((t) => {
	t.context.verboseLogStub = sinon.stub();
	t.context.errorLogStub = sinon.stub();
	sinon.stub(logger, "getLogger").returns({
		verbose: t.context.verboseLogStub,
		error: t.context.errorLogStub
	});
	t.context.manifestCreator = mock.reRequire("../../../lib/processors/manifestCreator");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("default manifest creation", async (t) => {
	const {manifestCreator, errorLogStub} = t.context;

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/ui/mine/.library";
		},
		getString: async () => {
			return libraryContent;
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
		}
	};

	t.is(errorLogStub.callCount, 0);

	const result = await manifestCreator({libraryResource, resources: [], options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");
});

test.serial("manifest creation for sap/apf", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const libraryResource = {
		getPath: () => {
			return "/resources/sap/apf/.library";
		},
		getString: async () => {
			return libraryContent;
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/apf/Component.js";
		}
	};

	const result = await manifestCreator({libraryResource, resources: [componentResource], options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.is(verboseLogStub.callCount, 9);
	t.is(verboseLogStub.getCall(1).args[0],
		"Package %s contains both '*.library' and 'Component.js'. " +
		"This is a known issue but can't be solved due to backward compatibility.");
	t.is(verboseLogStub.getCall(1).args[1], "/resources/sap/apf");
});

test.serial("manifest creation for sap/ui/core", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			metadata: {
				name: "sap.ui.core"
			}
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/ui/core/Component.js";
		}
	};

	const result = await manifestCreator({libraryResource, resources: [componentResource], options: {}});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.is(verboseLogStub.callCount, 8);
	t.is(verboseLogStub.getCall(1).args[0],
		"  sap.app/id taken from .library: '%s'");
	t.is(verboseLogStub.getCall(1).args[1], "sap.ui.core");
});

test.serial("manifest creation with .library / Component.js at same namespace", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
		}
	};

	const componentResource = {
		getPath: () => {
			return "/resources/sap/lib1/Component.js";
		}
	};

	const result = await manifestCreator({libraryResource, resources: [componentResource], options: {}});
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
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  component's 'sap.app/embeddedBy' property points to library, list it as 'embedded'"
	]);
});

test.serial("manifest creation with embedded component (Missing 'embeddedBy')", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  component doesn't declare 'sap.app/embeddedBy', don't list it as 'embedded'"
	]);
});

test.serial("manifest creation with embedded component ('embeddedBy' doesn't point to library)", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  component's 'sap.app/embeddedBy' points to '%s', don't list it as 'embedded'",
		"/resources/sap/lib1/foo/"
	]);
});

test.serial("manifest creation with embedded component ('embeddedBy' absolute path)", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 0);

	t.true(verboseLogStub.callCount >= 2, "There should be at least 2 verbose log calls");
	t.deepEqual(verboseLogStub.getCall(0).args, [
		"checking component at %s", "/resources/sap/lib1/component1"
	]);
	t.deepEqual(verboseLogStub.getCall(1).args, [
		"  component's 'sap.app/embeddedBy' points to '%s', don't list it as 'embedded'",
		"/"
	]);
});

test.serial("manifest creation with embedded component ('embeddedBy' empty string)", async (t) => {
	const {manifestCreator, errorLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 1);
	t.deepEqual(errorLogStub.getCall(0).args, [
		"  component's property 'sap.app/embeddedBy' has an empty string value (which is invalid), " +
		"it won't be listed as 'embedded'"
	]);
});

test.serial("manifest creation with embedded component ('embeddedBy' object)", async (t) => {
	const {manifestCreator, errorLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 1);
	t.deepEqual(errorLogStub.getCall(0).args, [
		"  component's property 'sap.app/embeddedBy' is of type '%s' (expected 'string'), " +
		"it won't be listed as 'embedded'",
		"object"
	]);
});

test.serial("manifest creation with embedded component (no manifest.json)", async (t) => {
	const {manifestCreator, errorLogStub, verboseLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
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
	const {manifestCreator, errorLogStub} = t.context;

	const expectedManifestContent = JSON.stringify({
		"_version": "1.9.0",
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
		},
		_project: {
			dependencies: [{
				metadata: {
					name: "sap.ui.core"
				}
			}]
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
		]
	});
	t.is(await result.getString(), expectedManifestContent, "Correct result returned");

	t.is(errorLogStub.callCount, 1);
	t.is(errorLogStub.getCall(0).args.length, 3);
	t.deepEqual(errorLogStub.getCall(0).args.slice(0, 2), [
		"  component '%s': failed to read the component's manifest.json, " +
		"it won't be listed as 'embedded'.\n" +
		"Error details: %s",
		"/resources/sap/lib1/component1"
	]);
	t.true(errorLogStub.getCall(0).args[2].startsWith("SyntaxError: Unexpected token"));
});
