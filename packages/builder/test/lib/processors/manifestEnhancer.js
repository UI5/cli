import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.logWarnSpy = sinon.spy();
	t.context.logVerboseSpy = sinon.spy();
	t.context.logErrorSpy = sinon.spy();
	const loggerStub = {
		warn: t.context.logWarnSpy,
		verbose: t.context.logVerboseSpy,
		error: t.context.logErrorSpy
	};
	const manifestEnhancerImport = await esmock("../../../lib/processors/manifestEnhancer.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:processors:manifestEnhancer").returns(loggerStub)
		}
	});
	t.context.manifestEnhancer = manifestEnhancerImport.default;
	t.context.__internals__ = manifestEnhancerImport.__internals__;

	t.context.fs = {
		readdir: sinon.stub().callsArgWith(1, null, [])
	};

	t.context.createResource = (path, bNamespaced, input) => {
		return {
			getString: () => Promise.resolve(input),
			setString: sinon.stub(),
			getProject() {
				return {
					getNamespace() {
						const namespace = path.substring(0, path.lastIndexOf("/")).replace("/resources/", "");
						return bNamespaced ? namespace : "";
					}
				};
			},
			getPath() {
				return path;
			}
		};
	};
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});


// #######################################################
// Type: Application
// #######################################################

test("Application: No replacement (No properties files)", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;

	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: Missing sap.app/id", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;

	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"type": "application"
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1, "One verbose messages should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: sap.app/id is not defined. No supportedLocales can be generated");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.app/i18n (without templates, default bundle): " +
	"Adds supportedLocales based on available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"supportedLocales": ["de", "en"]
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.app/i18n (with templates, default bundle): " +
	"Adds supportedLocales based on available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"title": "{{title}}"
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"title": "{{title}}",
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"supportedLocales": ["de", "en"]
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.app/i18n (with templates, custom bundle): " +
	"Adds supportedLocales based on available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"title": "{{title}}",
			"i18n": "mybundle.properties"
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"title": "{{title}}",
			"i18n": {
				"bundleUrl": "mybundle.properties",
				"supportedLocales": ["de", "en"]
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app")
		.callsArgWith(1, null, ["mybundle_de.properties", "mybundle_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Adds supportedLocales based on available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "de"
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "de",
						"supportedLocales": ["de", "en"]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	// "i18n_fr.txt" was placed into the i18nModel folder but should not be analyzed by the processor
	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties", "i18n_fr.txt"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Adds supportedLocales based on available properties files (properties files on root level)",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18n"
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18n",
						"supportedLocales": ["de", "en"]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models (bundleUrl): " +
	"Adds supportedLocales based on available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "i18nModel/i18n.properties",
						"fallbackLocale": "de"
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "i18nModel/i18n.properties",
						"fallbackLocale": "de",
						"supportedLocales": ["de", "en"]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models (bundleUrl with ui5 protocol): " +
	"Adds supportedLocales based on available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "ui5://sap/ui/demo/app/i18nModel/i18n.properties",
						"fallbackLocale": "de"
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "ui5://sap/ui/demo/app/i18nModel/i18n.properties",
						"fallbackLocale": "de",
						"supportedLocales": ["de", "en"]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models (uri): " +
	"Adds supportedLocales with available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"uri": "i18nModel/i18n.properties"
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"uri": "i18nModel/i18n.properties",
					"settings": {
						"supportedLocales": ["de", "en"]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models (with terminologies and enhanceWith): " +
	"Adds supportedLocales based on available properties files",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "i18nModel/i18n.properties",
						"terminologies": {
							"oil": {
								"bundleUrl": "i18n/terminologies.oil.i18n.properties",
							},
							"retail": {
								"bundleUrl": "i18n/terminologies.retail.i18n.properties",
							}
						},
						"enhanceWith": [
							{
								"bundleUrl": "./enhancements/i18n/i18n.properties",
								"bundleUrlRelativeTo": "manifest",
								"terminologies": {
									"oil": {
										"bundleUrl": "./enhancements/i18n/terminologies.oil.i18n.properties",
									},
									"retail": {
										"bundleUrl": "./enhancements/i18n/terminologies.retail.i18n.properties",
										"bundleUrlRelativeTo": "manifest"
									}
								}
							},
							{
								"bundleUrl": "../some/path/to/i18n/i18n.properties",
								"bundleUrlRelativeTo": "manifest",
								"terminologies": {
									"oil": {
										"bundleUrl": "../some/path/to/terminologies.oil.i18n.properties",
									},
									"retail": {
										"bundleUrl": "../some/path/to/terminologies.retail.i18n.properties",
										"bundleUrlRelativeTo": "manifest"
									}
								}
							},
							{
								"bundleName": "appvar2.i18n.i18n.properties",
								"terminologies": {
									"oil": {
										"bundleName": "appvar2.i18n.terminologies.oil.i18n",
									},
									"retail": {
										"bundleName": "appvar2.i18n.terminologies.retail.i18n",
									}
								}
							}
						]
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "i18nModel/i18n.properties",
						"terminologies": {
							"oil": {
								"bundleUrl": "i18n/terminologies.oil.i18n.properties",
								"supportedLocales": ["", "de", "en", "fr"]
							},
							"retail": {
								"bundleUrl": "i18n/terminologies.retail.i18n.properties",
								"supportedLocales": ["en"]
							}
						},
						"enhanceWith": [
							{
								"bundleUrl": "./enhancements/i18n/i18n.properties",
								"bundleUrlRelativeTo": "manifest",
								"terminologies": {
									"oil": {
										"bundleUrl": "./enhancements/i18n/terminologies.oil.i18n.properties",
										"supportedLocales": ["", "en", "fr"]
									},
									"retail": {
										"bundleUrl": "./enhancements/i18n/terminologies.retail.i18n.properties",
										"bundleUrlRelativeTo": "manifest",
										"supportedLocales": ["de", "en"]
									}
								},
								"supportedLocales": ["de", "en", "es"]
							},
							{
								"bundleUrl": "../some/path/to/i18n/i18n.properties",
								"bundleUrlRelativeTo": "manifest",
								"terminologies": {
									"oil": {
										"bundleUrl": "../some/path/to/terminologies.oil.i18n.properties",
									},
									"retail": {
										"bundleUrl": "../some/path/to/terminologies.retail.i18n.properties",
										"bundleUrlRelativeTo": "manifest"
									}
								}
							},
							{
								"bundleName": "appvar2.i18n.i18n.properties",
								"terminologies": {
									"oil": {
										"bundleName": "appvar2.i18n.terminologies.oil.i18n",
									},
									"retail": {
										"bundleName": "appvar2.i18n.terminologies.retail.i18n",
									}
								}
							}
						],
						"supportedLocales": ["de", "en"]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, [
			"i18n_de.properties",
			"i18n_en.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, [
			"terminologies.oil.i18n.properties",
			"terminologies.oil.i18n_de.properties",
			"terminologies.oil.i18n_en.properties",
			"terminologies.oil.i18n_fr.properties",

			"terminologies.retail.i18n_en.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/enhancements/i18n")
		.callsArgWith(1, null, [
			"i18n_de.properties",
			"i18n_en.properties",
			"i18n_es.properties",

			"terminologies.oil.i18n.properties",
			"terminologies.oil.i18n_en.properties",
			"terminologies.oil.i18n_fr.properties",

			"terminologies.retail.i18n_de.properties",
			"terminologies.retail.i18n_en.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.is(t.context.logVerboseSpy.callCount, 6, "One verbose messages should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../some/path/to/i18n/i18n.properties' points to a " +
		"bundle outside of the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(1).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl " +
		"'../../../../appvar2/i18n/i18n/properties.properties' points to a bundle outside of " +
		"the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(2).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl " +
		"'../some/path/to/terminologies.oil.i18n.properties' points to a bundle outside of the " +
		"current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(3).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl " +
		"'../some/path/to/terminologies.retail.i18n.properties' points to a bundle outside of " +
		"the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(4).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl " +
		"'../../../../appvar2/i18n/terminologies/oil/i18n.properties' points to a bundle outside " +
		"of the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(5).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl " +
		"'../../../../appvar2/i18n/terminologies/retail/i18n.properties' points to a bundle " +
		"outside of the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Do not replace supportedLocales when supportedLocales are already defined",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"supportedLocales": ["en", "fr"],
						"fallbackLocale": "fr"
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Do not replace supportedLocales when supportedLocales are set to array with empty string",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"supportedLocales": [""],
						"fallbackLocale": ""
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Do not replace supportedLocales when an invalid bundle config is defined (missing bundleUrl or bundleName)",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel"
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Log error, no supportedLocales generation if fallbackLocale is not part of generation",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "fr"
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.is(t.context.logErrorSpy.callCount, 1, "1 error should be logged");
	t.is(t.context.logErrorSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: Generated supported locales ('de', 'en') for " +
		"bundle 'i18nModel/i18n.properties' not containing the defined fallback locale 'fr'. "+
		"Either provide a properties file for defined fallbackLocale or configure another available fallbackLocale",
		"Error message should be correct");
});

test("Application: sap.ui5/models: " +
	"Log warning, but generate locales if default fallbackLocale is not part of generation",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n"
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"supportedLocales": ["de", "fr"]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_fr.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.is(t.context.logWarnSpy.callCount, 1, "1 warning should be logged");
	t.is(t.context.logWarnSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: Generated supported locales ('de', 'fr') " +
		"for bundle 'i18nModel/i18n.properties' do not contain default fallback locale 'en'. " +
		"Either provide a properties file for 'en' or configure another available fallbackLocale",
		"1 warning should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"No warning when fallbackLocale is empty string and is part of supportedLocales",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": ""
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "",
						"supportedLocales": [""]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Error when fallbackLocale is empty string and is not part of supportedLocales",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": ""
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.is(t.context.logErrorSpy.callCount, 1, "One error should be logged");
	t.deepEqual(t.context.logErrorSpy.getCall(0).args, [
		"/resources/sap/ui/demo/app/manifest.json: Generated supported locales ('en') for " +
		"bundle 'i18nModel/i18n.properties' not containing the defined fallback locale ''. " +
		"Either provide a properties file for defined fallbackLocale or configure another available fallbackLocale"]);
});

test("Application: sap.ui5/models: Log verbose if manifest version is not defined at all", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18n.i18n"
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1, "1 verbose should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: _version is not defined. No supportedLocales can be generated");
	t.true(t.context.logWarnSpy.notCalled, "No warning should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
	t.is(fs.readdir.callCount, 0, "readdir should not be called because _version is not defined");
});

test("Application: sap.ui5/models: Log verbose if manifest version is below 1.21.0", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.20.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18n.i18n"
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1, "1 verbose should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: _version is lower than 1.21.0 " +
		"so no supportedLocales can be generated");
	t.true(t.context.logWarnSpy.notCalled, "No warning should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
	t.is(fs.readdir.callCount, 0, "readdir should not be called because _version is lower than 1.21.0");
});

test("Application: sap.ui5/models: " +
	"Do not generate supportedLocales when bundleUrl pointing to a location outside the current project",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "../../myapp2/i18n/i18n.properties"
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1, "1 verbose should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../../myapp2/i18n/i18n.properties' points to a bundle " +
		"outside of the current namespace " + "'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.true(t.context.logWarnSpy.notCalled, "No warning should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Do not generate supportedLocales when bundleUrl pointing to a location inside the current project",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "../i18n/i18n.properties",
						"fallbackLocale": "de"
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1, "1 verbose should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../i18n/i18n.properties' points to a bundle " +
		"outside of the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.true(t.context.logWarnSpy.notCalled, "No warning should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Do not replace supportedLocales when bundle is not part of the namespace",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "de"
					}
				},
				"i18n_reuse_lib": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.lib.i18n.i18n",
						"async": true
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "de",
						"supportedLocales": ["de", "en"]
					}
				},
				"i18n_reuse_lib": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.lib.i18n.i18n",
						"async": true
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.is(t.context.logVerboseSpy.callCount, 1);
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../lib/i18n/i18n.properties' points to a bundle " +
		"outside of the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.ui5/models: " +
	"Do not generate supportedLocales when bundle is not part of the namespace (bundleUrl with ui5 protocol)",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "de"
					}
				},
				"i18n_reuse_lib": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "ui5://sap/ui/demo/lib/i18n/i18n.properties",
						"async": true
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleName": "sap.ui.demo.app.i18nModel.i18n",
						"fallbackLocale": "de",
						"supportedLocales": ["de", "en"]
					}
				},
				"i18n_reuse_lib": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "ui5://sap/ui/demo/lib/i18n/i18n.properties",
						"async": true
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18nModel")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.is(t.context.logVerboseSpy.callCount, 1);
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl 'ui5://sap/ui/demo/lib/i18n/i18n.properties' points to a bundle " +
		"outside of the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: sap.app/i18n: " +
	"Adds supportedLocales for terminologies and enhanceWith bundles",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"terminologies": {
					"oil": {
						"bundleUrl": "i18n/terminologies.oil.i18n.properties",
					},
					"retail": {
						"bundleUrl": "i18n/terminologies.retail.i18n.properties",
					}
				},
				"enhanceWith": [
					{
						"bundleUrl": "./enhancements/i18n/i18n.properties",
						"bundleUrlRelativeTo": "manifest",
						"terminologies": {
							"oil": {
								"bundleUrl": "./enhancements/i18n/terminologies.oil.i18n.properties",
							},
							"retail": {
								"bundleUrl": "./enhancements/i18n/terminologies.retail.i18n.properties",
								"bundleUrlRelativeTo": "manifest"
							}
						}
					},
					{
						"bundleUrl": "../some/path/to/i18n/i18n.properties",
						"bundleUrlRelativeTo": "manifest",
						"terminologies": {
							"oil": {
								"bundleUrl": "../some/path/to/terminologies.oil.i18n.properties",
							},
							"retail": {
								"bundleUrl": "../some/path/to/terminologies.retail.i18n.properties",
								"bundleUrlRelativeTo": "manifest"
							}
						}
					},
					{
						"bundleName": "appvar2.i18n.i18n.properties",
						"terminologies": {
							"oil": {
								"bundleName": "appvar2.i18n.terminologies.oil.i18n",
							},
							"retail": {
								"bundleName": "appvar2.i18n.terminologies.retail.i18n",
							}
						}
					}
				]
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"terminologies": {
					"oil": {
						"bundleUrl": "i18n/terminologies.oil.i18n.properties",
						"supportedLocales": ["", "de", "en", "fr"]
					},
					"retail": {
						"bundleUrl": "i18n/terminologies.retail.i18n.properties",
						"supportedLocales": ["en"]
					}
				},
				"enhanceWith": [
					{
						"bundleUrl": "./enhancements/i18n/i18n.properties",
						"bundleUrlRelativeTo": "manifest",
						"terminologies": {
							"oil": {
								"bundleUrl": "./enhancements/i18n/terminologies.oil.i18n.properties",
								"supportedLocales": ["", "en", "fr"]
							},
							"retail": {
								"bundleUrl": "./enhancements/i18n/terminologies.retail.i18n.properties",
								"bundleUrlRelativeTo": "manifest",
								"supportedLocales": ["de", "en"]
							}
						},
						"supportedLocales": ["de", "en", "es"]
					},
					{
						"bundleUrl": "../some/path/to/i18n/i18n.properties",
						"bundleUrlRelativeTo": "manifest",
						"terminologies": {
							"oil": {
								"bundleUrl": "../some/path/to/terminologies.oil.i18n.properties",
							},
							"retail": {
								"bundleUrl": "../some/path/to/terminologies.retail.i18n.properties",
								"bundleUrlRelativeTo": "manifest"
							}
						}
					},
					{
						"bundleName": "appvar2.i18n.i18n.properties",
						"terminologies": {
							"oil": {
								"bundleName": "appvar2.i18n.terminologies.oil.i18n",
							},
							"retail": {
								"bundleName": "appvar2.i18n.terminologies.retail.i18n",
							}
						}
					}
				],
				"supportedLocales": ["de", "en"]
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, [
			"i18n_de.properties",
			"i18n_en.properties",

			"terminologies.oil.i18n.properties",
			"terminologies.oil.i18n_de.properties",
			"terminologies.oil.i18n_en.properties",
			"terminologies.oil.i18n_fr.properties",

			"terminologies.retail.i18n_en.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/enhancements/i18n")
		.callsArgWith(1, null, [
			"i18n_de.properties",
			"i18n_en.properties",
			"i18n_es.properties",

			"terminologies.oil.i18n.properties",
			"terminologies.oil.i18n_en.properties",
			"terminologies.oil.i18n_fr.properties",

			"terminologies.retail.i18n_de.properties",
			"terminologies.retail.i18n_en.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.is(t.context.logVerboseSpy.callCount, 6, "One verbose messages should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../some/path/to/i18n/i18n.properties' points to a " +
		"bundle outside of the current namespace 'sap.ui.demo.app', enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(1).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../../../../appvar2/i18n/i18n/properties.properties' " +
		"points to a bundle outside of the current namespace 'sap.ui.demo.app', " +
		"enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(2).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../some/path/to/terminologies.oil.i18n.properties' " +
		"points to a bundle outside of the current namespace 'sap.ui.demo.app', " +
		"enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(3).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl '../some/path/to/terminologies.retail.i18n.properties' " +
		"points to a bundle outside of the current namespace 'sap.ui.demo.app', " +
		"enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(4).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl " +
		"'../../../../appvar2/i18n/terminologies/oil/i18n.properties' " +
		"points to a bundle outside of the current namespace 'sap.ui.demo.app', " +
		"enhancement of 'supportedLocales' is skipped");
	t.is(t.context.logVerboseSpy.getCall(5).args[0],
		"/resources/sap/ui/demo/app/manifest.json: bundleUrl " +
		"'../../../../appvar2/i18n/terminologies/retail/i18n.properties' " +
		"points to a bundle outside of the current namespace 'sap.ui.demo.app', " +
		"enhancement of 'supportedLocales' is skipped");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Application: supportedLocales are not added for bundles with absolute url", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"i18n": "/resources/sap/ui/demo/app/i18n/i18n.properties"
		},
		"sap.ui5": {
			"models": {
				"i18n": {
					"type": "sap.ui.model.resource.ResourceModel",
					"settings": {
						"bundleUrl": "https://example.com/i18nModel/i18n.properties",
						"terminologies": {
							"oil": {
								"bundleUrl": "/i18n/terminologies.oil.i18n.properties",
							},
							"retail": {
								"bundleUrl": "/i18n/terminologies.retail.i18n.properties",
							}
						},
						"enhanceWith": [
							{
								"bundleUrl": "/enhancements/i18n/i18n.properties",
								"bundleUrlRelativeTo": "manifest",
								"terminologies": {
									"oil": {
										"bundleUrl": "/enhancements/i18n/terminologies.oil.i18n.properties",
									},
									"retail": {
										"bundleUrl": "/enhancements/i18n/terminologies.retail.i18n.properties",
										"bundleUrlRelativeTo": "manifest"
									}
								}
							},
							{
								"bundleUrl": "/some/path/to/i18n/i18n.properties",
								"bundleUrlRelativeTo": "manifest",
								"terminologies": {
									"oil": {
										"bundleUrl": "/some/path/to/terminologies.oil.i18n.properties",
									},
									"retail": {
										"bundleUrl": "/some/path/to/terminologies.retail.i18n.properties",
										"bundleUrlRelativeTo": "manifest"
									}
								}
							}
						]
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Resource is not changed, therefore not returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");

	t.is(fs.readdir.callCount, 0, "readdir should not be called for absolute bundle urls");
});

// #######################################################
// Type: Component
// #######################################################

// Currently we have no specific coding for components, should be treated the same way as type application

// #######################################################
// Type: Card
// #######################################################

// Currently we have no specific coding for cards, should be treated the same way as type application

// #######################################################
// Type: Library
// #######################################################

test("Library: No replacement at all", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: Missing sap.app section", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18n.properties"
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1, "One verbose messages should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/lib/manifest.json: sap.app/id is not defined. No supportedLocales can be generated");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: Missing sap.app/id", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;

	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18n.properties"
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1, "One verbose messages should be logged");
	t.is(t.context.logVerboseSpy.getCall(0).args[0],
		"/resources/sap/ui/demo/lib/manifest.json: sap.app/id is not defined. No supportedLocales can be generated");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.app/i18n (with templates, no bundle defined): " +
	"Does not add supportedLocales, as sap.app/i18n is not valid for libraries",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library",
			"title": "{{title}}"
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, ["i18n_de.properties", "i18n_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.app/i18n (with custom bundle): " +
	"Does not add supportedLocales, as sap.app/i18n is not valid for libraries",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library",
			"i18n": "mybundle.properties"
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input,
		(actual) => t.is(actual, "", "Correct file content should be set"));

	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, null, ["mybundle_de.properties", "mybundle_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Adds supportedLocales based on available properties files", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"fallbackLocale": "de"
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"fallbackLocale": "de",
					"supportedLocales": ["de", "en"]
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, ["messagebundlec_de.properties", "messagebundlec_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Adds supportedLocales based on available properties files (i18n=string)", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": "i18nc/messagebundlec.properties"
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"supportedLocales": ["de", "en"]
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, ["messagebundlec_de.properties", "messagebundlec_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: " +
	"Adds supportedLocales based on available properties files (i18n=true)",
async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": true
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "messagebundle.properties",
					"supportedLocales": ["de", "en"]
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib")
		.callsArgWith(1, null, ["messagebundle_de.properties", "messagebundle_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Do not generate supportedLocales with disabled i18n feature", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": false
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib")
		.callsArgWith(1, null, ["messagebundle_de.properties", "messagebundle_en.properties"]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Adds supportedLocales to terminologies", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties"
						}
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							"supportedLocales": ["", "de", "en"]
						}
					},
					"supportedLocales": ["", "de", "en"],
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports")
		.callsArgWith(1, null, [
			"messagebundle.sports_de.properties",
			"messagebundle.sports_en.properties",
			"messagebundle.sports.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Adds supportedLocales for terminologies not bundle level", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"supportedLocales": ["pt"],
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties"
						}
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"supportedLocales": ["pt"],
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							"supportedLocales": ["", "de", "en"]
						}
					}
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports")
		.callsArgWith(1, null, [
			"messagebundle.sports_de.properties",
			"messagebundle.sports_en.properties",
			"messagebundle.sports.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Adds supportedLocales (with deactivated terminologies)", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							"supportedLocales": ["pt"]
						}
					}
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							"supportedLocales": ["pt"]
						}
					},
					"supportedLocales": ["", "de", "en"],
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports")
		.callsArgWith(1, null, [
			"messagebundle.sports_de.properties",
			"messagebundle.sports_en.properties",
			"messagebundle.sports.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Adds supportedLocales (with enhanceWith)", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties"
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties"
						}
					]
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"supportedLocales": ["", "de", "en"]
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties",
							"supportedLocales": ["", "de", "en"]
						}
					],
					"supportedLocales": ["", "de", "en"],
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder1")
		.callsArgWith(1, null, [
			"messagebundlenc1_de.properties",
			"messagebundlenc1_en.properties",
			"messagebundlenc1.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder2")
		.callsArgWith(1, null, [
			"messagebundlenc2_de.properties",
			"messagebundlenc2_en.properties",
			"messagebundlenc2.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Adds supportedLocales (with enhanceWith and terminologies)", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties"
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties"
								}
							}
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer_el/messagebundle.elsoccer.properties"
								}
							}
						}
					]
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							"supportedLocales": ["", "de", "en"]
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties",
									"supportedLocales": ["", "de", "en"]
								}
							},
							"supportedLocales": ["", "de", "en"]
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer_el/messagebundle.elsoccer.properties",
									"supportedLocales": ["", "de", "en"]
								}
							},
							"supportedLocales": ["", "de", "en"]
						}
					],
					"supportedLocales": ["", "de", "en"],
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder1")
		.callsArgWith(1, null, [
			"messagebundlenc1_de.properties",
			"messagebundlenc1_en.properties",
			"messagebundlenc1.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder2")
		.callsArgWith(1, null, [
			"messagebundlenc2_de.properties",
			"messagebundlenc2_en.properties",
			"messagebundlenc2.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports")
		.callsArgWith(1, null, [
			"messagebundle.sports_de.properties",
			"messagebundle.sports_en.properties",
			"messagebundle.sports.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports_soccer")
		.callsArgWith(1, null, [
			"messagebundle.soccer_de.properties",
			"messagebundle.soccer_en.properties",
			"messagebundle.soccer.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports_soccer_el")
		.callsArgWith(1, null, [
			"messagebundle.elsoccer_de.properties",
			"messagebundle.elsoccer_en.properties",
			"messagebundle.elsoccer.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: Ignores fallbackLocale for terminologies", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							// Note: manifest.json schema does not allow "fallbackLocale" for terminologies
							// UI5 runtime and tooling should ignore this property
							"fallbackLocale": "es"
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties",
									// Note: manifest.json schema does not allow "fallbackLocale" for terminologies
									// UI5 runtime and tooling should ignore this property
									"fallbackLocale": "es"
								}
							}
						}
					]
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							// Note: manifest.json schema does not allow "fallbackLocale" for terminologies
							// UI5 runtime and tooling should ignore this property
							"fallbackLocale": "es",
							"supportedLocales": ["", "de", "en"]
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties",
									// Note: manifest.json schema does not allow "fallbackLocale" for terminologies
									// UI5 runtime and tooling should ignore this property
									"fallbackLocale": "es",
									"supportedLocales": ["", "de", "en"]
								}
							},
							"supportedLocales": ["", "de", "en"]
						}
					],
					"supportedLocales": ["", "de", "en"],
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder1")
		.callsArgWith(1, null, [
			"messagebundlenc1_de.properties",
			"messagebundlenc1_en.properties",
			"messagebundlenc1.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports")
		.callsArgWith(1, null, [
			"messagebundle.sports_de.properties",
			"messagebundle.sports_en.properties",
			"messagebundle.sports.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports_soccer")
		.callsArgWith(1, null, [
			"messagebundle.soccer_de.properties",
			"messagebundle.soccer_en.properties",
			"messagebundle.soccer.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");
});

test("Library: sap.ui5/library: " +
"Does not not add supportedLocales for enhanceWith when bundle has supportedLocales defined", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties"
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties"
								}
							}
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer_el/messagebundle.elsoccer.properties"
								}
							}
						}
					],
					"supportedLocales": ["en"]
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							"supportedLocales": ["", "de", "en"]
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties",
									"supportedLocales": ["", "de", "en"]
								}
							}
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer_el/messagebundle.elsoccer.properties",
									"supportedLocales": ["", "de", "en"]
								}
							}
						}
					],
					"supportedLocales": ["en"]
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder1")
		.callsArgWith(1, null, [
			"messagebundlenc1_de.properties",
			"messagebundlenc1_en.properties",
			"messagebundlenc1.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder2")
		.callsArgWith(1, null, [
			"messagebundlenc2_de.properties",
			"messagebundlenc2_en.properties",
			"messagebundlenc2.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports")
		.callsArgWith(1, null, [
			"messagebundle.sports_de.properties",
			"messagebundle.sports_en.properties",
			"messagebundle.sports.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports_soccer")
		.callsArgWith(1, null, [
			"messagebundle.soccer_de.properties",
			"messagebundle.soccer_en.properties",
			"messagebundle.soccer.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports_soccer_el")
		.callsArgWith(1, null, [
			"messagebundle.elsoccer_de.properties",
			"messagebundle.elsoccer_en.properties",
			"messagebundle.elsoccer.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");

	t.is(fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder1").callCount, 0,
		"folder should not be read as parent bundle defines supportedLocales");
	t.is(fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder2").callCount, 0,
		"folder should not be read as parent bundle defines supportedLocales");
	t.is(fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc").callCount, 0,
		"folder should not be read as bundle defines supportedLocales");
});

test("Library: sap.ui5/library: " +
"Does not not add supportedLocales for enhanceWith when bundle has invalid fallbackLocale defined", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties"
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties"
								}
							}
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer_el/messagebundle.elsoccer.properties"
								}
							}
						}
					],
					"fallbackLocale": "es"
				}
			}
		}
	}, null, 2);

	const expected = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.lib",
			"type": "library"
		},
		"sap.ui5": {
			"library": {
				"i18n": {
					"bundleUrl": "i18nc/messagebundlec.properties",
					"terminologies": {
						"sports": {
							"bundleUrl": "i18nc_sports/messagebundle.sports.properties",
							"supportedLocales": ["", "de", "en"]
						}
					},
					"enhanceWith": [
						{
							"bundleUrl": "myfolder1/messagebundlenc1.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer/messagebundle.soccer.properties",
									"supportedLocales": ["", "de", "en"]
								}
							},
							"supportedLocales": ["", "de", "en", "es"]
						},
						{
							"bundleUrl": "myfolder2/messagebundlenc2.properties",
							"terminologies": {
								"sports": {
									"bundleUrl": "i18nc_sports_soccer_el/messagebundle.elsoccer.properties",
									"supportedLocales": ["", "de", "en"]
								}
							}
						}
					],
					"fallbackLocale": "es",
					"supportedLocales": ["", "de", "en", "es"]
				}
			}
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/lib/manifest.json", true, input);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder1")
		.callsArgWith(1, null, [
			"messagebundlenc1_de.properties",
			"messagebundlenc1_en.properties",
			"messagebundlenc1_es.properties",
			"messagebundlenc1.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/myfolder2")
		.callsArgWith(1, null, [
			"messagebundlenc2_de.properties",
			"messagebundlenc2_en.properties",
			"messagebundlenc2.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports")
		.callsArgWith(1, null, [
			"messagebundle.sports_de.properties",
			"messagebundle.sports_en.properties",
			"messagebundle.sports.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports_soccer")
		.callsArgWith(1, null, [
			"messagebundle.soccer_de.properties",
			"messagebundle.soccer_en.properties",
			"messagebundle.soccer.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc_sports_soccer_el")
		.callsArgWith(1, null, [
			"messagebundle.elsoccer_de.properties",
			"messagebundle.elsoccer_en.properties",
			"messagebundle.elsoccer.properties"
		]);

	fs.readdir.withArgs("/resources/sap/ui/demo/lib/i18nc")
		.callsArgWith(1, null, [
			"messagebundlec_de.properties",
			"messagebundlec_en.properties",
			"messagebundlec_es.properties",
			"messagebundlec.properties"
		]);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(resource.setString.callCount, 1, "setString should be called once");
	t.deepEqual(resource.setString.getCall(0).args, [expected], "Correct file content should be set");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.is(t.context.logErrorSpy.callCount, 1, "One error should be logged");
	t.deepEqual(t.context.logErrorSpy.getCall(0).args, [
		"/resources/sap/ui/demo/lib/manifest.json: Generated supported locales ('', 'de', 'en') for bundle " +
		"'myfolder2/messagebundlenc2.properties' not containing the " +
		"defined fallback locale 'es'. Either provide a properties file for defined fallbackLocale " +
		"or configure another available fallbackLocale"]);
});

test("fs.readdir error handling", async (t) => {
	const {manifestEnhancer, fs, createResource} = t.context;
	const input = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application",
			"title": "{{title}}"
		}
	}, null, 2);

	const resource = createResource("/resources/sap/ui/demo/app/manifest.json", true, input);

	// NOTE: @ui5/fs fsInterface currently does not throw ENOENT errors but instead returns an empty array
	// However, this is not guaranteed and might change in the future.
	// In addition, the might be low-level use cases with a real "fs" that would throw ENOENT
	const error = new Error("ENOENT: no such file or directory, scandir '/resources/sap/ui/demo/app/i18n'");
	error.code = "ENOENT";
	fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n")
		.callsArgWith(1, error);

	const processedResources = await manifestEnhancer({
		resources: [resource],
		fs
	});

	t.deepEqual(processedResources, [], "Only enhanced resources are returned");

	t.is(resource.setString.callCount, 0, "setString should not be called");

	t.true(t.context.logVerboseSpy.notCalled, "No verbose messages should be logged");
	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
	t.true(t.context.logErrorSpy.notCalled, "No errors should be logged");

	t.is(fs.readdir.withArgs("/resources/sap/ui/demo/app/i18n").callCount, 1,
		"readdir has been called with expected path that causes a ENOENT error");
});

test("ManifestEnhancer#run: multiple parallel executions are not supported", async (t) => {
	const {fs} = t.context;
	const {ManifestEnhancer} = t.context.__internals__;

	const manifest = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app"
		}
	});
	const filePath = "/manifest.json";

	const manifestEnhancer = new ManifestEnhancer(manifest, filePath, fs);

	manifestEnhancer.run();
	await t.throwsAsync(manifestEnhancer.run(), {
		message: "ManifestEnhancer#run can only be invoked once per instance"
	});
});

test("manifestEnhancer#getSupportedLocales", async (t) => {
	const {fs} = t.context;
	const {ManifestEnhancer} = t.context.__internals__;

	const manifest = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app"
		}
	});
	const filePath = "/manifest.json";

	const manifestEnhancer = new ManifestEnhancer(manifest, filePath, fs);

	fs.readdir.withArgs("/i18n")
		.callsArgWith(1, null, [
			"i18n.properties",
			"i18n_en.properties"
		]);

	t.deepEqual(await manifestEnhancer.getSupportedLocales("./i18n/i18n.properties"), ["", "en"]);
	t.deepEqual(await manifestEnhancer.getSupportedLocales("i18n/../i18n/i18n.properties"), ["", "en"]);
	t.deepEqual(await manifestEnhancer.getSupportedLocales("ui5://sap/ui/demo/app/i18n/i18n.properties"), ["", "en"]);

	// Path traversal to root and then into application namespace
	// This works, but is not recommended at all! It also likely fails at runtime
	t.deepEqual(await manifestEnhancer.getSupportedLocales(
		"../../../../../../../../../../../../resources/sap/ui/demo/app/i18n/i18n.properties"
	), ["", "en"]);

	t.is(fs.readdir.callCount, 4);
});

test("manifestEnhancer#getSupportedLocales (absolute / invalid URLs)", async (t) => {
	const {fs} = t.context;
	const {ManifestEnhancer} = t.context.__internals__;

	const manifest = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app"
		}
	});
	const filePath = "/manifest.json";

	const manifestEnhancer = new ManifestEnhancer(manifest, filePath, fs);

	// Server-absolute URLs
	t.deepEqual(await manifestEnhancer.getSupportedLocales("/i18n/i18n.properties"), []);
	t.deepEqual(await manifestEnhancer.getSupportedLocales("/../i18n/i18n.properties"), []);

	// Server-absolute URL within application namespace
	t.deepEqual(await manifestEnhancer.getSupportedLocales("/resources/sap/ui/demo/app/i18n/i18n.properties"), []);

	// Absolute URLs
	t.deepEqual(await manifestEnhancer.getSupportedLocales("http://example.com/i18n.properties"), []);
	t.deepEqual(await manifestEnhancer.getSupportedLocales("https://example.com/i18n.properties"), []);
	t.deepEqual(await manifestEnhancer.getSupportedLocales("ftp://example.com/i18n.properties"), []);
	t.deepEqual(await manifestEnhancer.getSupportedLocales("sftp:i18n.properties"), []);
	t.deepEqual(await manifestEnhancer.getSupportedLocales("file://i18n.properties"), []);

	// Path traversal to root
	t.deepEqual(await manifestEnhancer.getSupportedLocales("../../../../../../../../../../../../i18n.properties"), []);

	// Relative ui5-protocol URL
	t.deepEqual(await manifestEnhancer.getSupportedLocales("ui5:i18n.properties"), []);

	t.is(fs.readdir.callCount, 0, "readdir should not be called for any absolute / invalid URL");
});

test("manifestEnhancer#getSupportedLocales (error handling)", async (t) => {
	const {fs} = t.context;
	const {ManifestEnhancer} = t.context.__internals__;

	const manifest = JSON.stringify({
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app"
		}
	});
	const filePath = "/manifest.json";

	const manifestEnhancer = new ManifestEnhancer(manifest, filePath, fs);

	// NOTE: @ui5/fs fsInterface currently does not throw ENOENT errors but instead returns an empty array
	// However, this is not guaranteed and might change in the future.
	// In addition, the might be low-level use cases with a real "fs" that would throw ENOENT
	const error = new Error("ENOENT: no such file or directory, scandir '/i18n'");
	error.code = "ENOENT";
	fs.readdir.withArgs("/i18n")
		.callsArgWith(1, error);

	const unexpectedError = new Error("Unexpected error");
	fs.readdir.withArgs("/i18n-unexpected-error")
		.callsArgWith(1, unexpectedError);

	// Error handling ENOENT
	t.deepEqual(await manifestEnhancer.getSupportedLocales("i18n/i18n.properties"), []);

	// Unexpected errors should be thrown
	await t.throwsAsync(manifestEnhancer.getSupportedLocales("i18n-unexpected-error/i18n.properties"), {
		is: unexpectedError
	});

	t.is(fs.readdir.callCount, 2, "readdir should be called once");
});

test("getRelativeBundleUrlFromName", (t) => {
	const {getRelativeBundleUrlFromName} = t.context.__internals__;

	const bundleUrl = getRelativeBundleUrlFromName("sap.ui.demo.app.i18n.i18n", "sap.ui.demo.app");
	t.is(bundleUrl, "i18n/i18n.properties");
});

test("normalizeBundleUrl", (t) => {
	const {normalizeBundleUrl} = t.context.__internals__;

	t.is(
		normalizeBundleUrl("./i18n/i18n.properties", "sap.ui.demo.app"),
		"i18n/i18n.properties"
	);
	t.is(
		normalizeBundleUrl("i18n/i18n.properties", "sap.ui.demo.app"),
		"i18n/i18n.properties"
	);
	t.is(
		normalizeBundleUrl("./i18n/../i18n/i18n.properties", "sap.ui.demo.app"),
		"i18n/i18n.properties"
	);
	t.is(
		normalizeBundleUrl("./i18n/../../other/namespace/i18n.properties", "sap.ui.demo.app"),
		"../other/namespace/i18n.properties"
	);
});

test("resolveUI5Url", (t) => {
	const {resolveUI5Url} = t.context.__internals__;

	t.is(
		resolveUI5Url("ui5://sap/ui/demo/app/i18n/i18n.properties", "sap.ui.demo.app"),
		"/resources/sap/ui/demo/app/i18n/i18n.properties"
	);
});
