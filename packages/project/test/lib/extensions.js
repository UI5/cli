const test = require("ava");
const path = require("path");
const sinon = require("sinon");
const ValidationError = require("../../lib/validation/ValidationError");
const projectPreprocessor = require("../..").projectPreprocessor;
const Preprocessor = require("../..").projectPreprocessor._ProjectPreprocessor;
const applicationAPath = path.join(__dirname, "..", "fixtures", "application.a");
const legacyLibraryAPath = path.join(__dirname, "..", "fixtures", "legacy.library.a");
const legacyLibraryBPath = path.join(__dirname, "..", "fixtures", "legacy.library.b");
const legacyCollectionAPath = path.join(__dirname, "..", "fixtures", "legacy.collection.a");
const legacyCollectionLibraryX = path.join(__dirname, "..", "fixtures", "legacy.collection.a",
	"src", "legacy.library.x");
const legacyCollectionLibraryY = path.join(__dirname, "..", "fixtures", "legacy.collection.a",
	"src", "legacy.library.y");

test.afterEach.always((t) => {
	sinon.restore();
});

test("Project with project-shim extension with dependency configuration", (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "extension.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "shims.a"
			},
			shims: {
				configurations: {
					"legacy.library.a": {
						specVersion: "0.1",
						type: "library",
						metadata: {
							name: "legacy.library.a",
						}
					}
				}
			}
		}, {
			id: "legacy.library.a",
			version: "1.0.0",
			path: legacyLibraryAPath,
			dependencies: []
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};

	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "xy",
				namespace: "id1"
			},
			resources: {
				configuration: {
					propertiesFileSourceEncoding: "ISO-8859-1",
					paths: {
						webapp: "webapp"
					}
				},
				pathMappings: {
					"/": "webapp",
				}
			},
			dependencies: [{
				id: "legacy.library.a",
				kind: "project",
				version: "1.0.0",
				specVersion: "0.1",
				path: legacyLibraryAPath,
				_level: 1,
				type: "library",
				metadata: {
					name: "legacy.library.a",
					copyright: "${copyright}",
					namespace: "legacy/library/a",
				},
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "ISO-8859-1",
						paths: {
							src: "src",
							test: "test"
						}
					},
					pathMappings: {
						"/resources/": "src",
						"/test-resources/": "test"
					}
				},
				dependencies: []
			}],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "0.1",
			path: applicationAPath
		}, "Parsed correctly");
	});
});

test("Project with project-shim extension with invalid dependency configuration", async (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "extension.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "shims.a"
			},
			shims: {
				configurations: {
					"legacy.library.a": {
						specVersion: "2.0",
						type: "library"
					}
				}
			}
		}, {
			id: "legacy.library.a",
			version: "1.0.0",
			path: legacyLibraryAPath,
			dependencies: []
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};

	const validationError = await t.throwsAsync(projectPreprocessor.processTree(tree), {
		instanceOf: ValidationError
	});
	t.true(validationError.message.includes("Configuration must have required property 'metadata'"),
		"ValidationError should contain error about missing metadata configuration");
});

test("Project with project-shim extension with dependency declaration and configuration", (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "extension.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "shims.a"
			},
			shims: {
				configurations: {
					"legacy.library.a": {
						specVersion: "0.1",
						type: "library",
						metadata: {
							name: "legacy.library.a",
						}
					},
					"legacy.library.b": {
						specVersion: "0.1",
						type: "library",
						metadata: {
							name: "legacy.library.b",
						}
					}
				},
				dependencies: {
					"legacy.library.a": [
						"legacy.library.b"
					]
				}
			}
		}, {
			id: "legacy.library.a",
			version: "1.0.0",
			path: legacyLibraryAPath,
			dependencies: []
		}, {
			id: "legacy.library.b",
			version: "1.0.0",
			path: legacyLibraryBPath,
			dependencies: []
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	// application.a and legacy.library.a will both have a dependency to legacy.library.b
	//	(one because it's the actual dependency and one because it's a shimmed dependency)
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "xy",
				namespace: "id1"
			},
			resources: {
				configuration: {
					propertiesFileSourceEncoding: "ISO-8859-1",
					paths: {
						webapp: "webapp"
					}
				},
				pathMappings: {
					"/": "webapp",
				}
			},
			dependencies: [{
				id: "legacy.library.a",
				kind: "project",
				version: "1.0.0",
				specVersion: "0.1",
				path: legacyLibraryAPath,
				_level: 1,
				type: "library",
				metadata: {
					name: "legacy.library.a",
					copyright: "${copyright}",
					namespace: "legacy/library/a",
				},
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "ISO-8859-1",
						paths: {
							src: "src",
							test: "test"
						}
					},
					pathMappings: {
						"/resources/": "src",
						"/test-resources/": "test"
					}
				},
				dependencies: [{
					id: "legacy.library.b",
					kind: "project",
					version: "1.0.0",
					specVersion: "0.1",
					path: legacyLibraryBPath,
					_level: 1,
					type: "library",
					metadata: {
						name: "legacy.library.b",
						copyright: "${copyright}",
						namespace: "legacy/library/b",
					},
					resources: {
						configuration: {
							propertiesFileSourceEncoding: "ISO-8859-1",
							paths: {
								src: "src",
								test: "test"
							}
						},
						pathMappings: {
							"/resources/": "src",
							"/test-resources/": "test"
						}
					},
					dependencies: []
				}]
			}, {
				id: "legacy.library.b",
				kind: "project",
				version: "1.0.0",
				specVersion: "0.1",
				path: legacyLibraryBPath,
				_level: 1,
				type: "library",
				metadata: {
					name: "legacy.library.b",
					copyright: "${copyright}",
					namespace: "legacy/library/b",
				},
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "ISO-8859-1",
						paths: {
							src: "src",
							test: "test"
						}
					},
					pathMappings: {
						"/resources/": "src",
						"/test-resources/": "test"
					}
				},
				dependencies: []
			}],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "0.1",
			path: applicationAPath
		}, "Parsed correctly");
	});
});

test("Project with project-shim extension with collection", (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "extension.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "shims.a"
			},
			shims: {
				configurations: {
					"legacy.library.x": {
						specVersion: "0.1",
						type: "library",
						metadata: {
							name: "legacy.library.x",
						}
					},
					"legacy.library.y": {
						specVersion: "0.1",
						type: "library",
						metadata: {
							name: "legacy.library.y",
						}
					}
				},
				dependencies: {
					"application.a": [
						"legacy.library.x",
						"legacy.library.y"
					],
					"legacy.library.x": [
						"legacy.library.y"
					]
				},
				collections: {
					"legacy.collection.a": {
						modules: {
							"legacy.library.x": "src/legacy.library.x",
							"legacy.library.y": "src/legacy.library.y"
						}
					}
				}
			}
		}, {
			id: "legacy.collection.a",
			version: "1.0.0",
			path: legacyCollectionAPath,
			dependencies: []
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};

	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "xy",
				namespace: "id1"
			},
			resources: {
				configuration: {
					propertiesFileSourceEncoding: "ISO-8859-1",
					paths: {
						webapp: "webapp"
					}
				},
				pathMappings: {
					"/": "webapp",
				}
			},
			dependencies: [{
				id: "legacy.library.x",
				kind: "project",
				version: "1.0.0",
				specVersion: "0.1",
				path: legacyCollectionLibraryX,
				_level: 1,
				type: "library",
				metadata: {
					name: "legacy.library.x",
					copyright: "${copyright}",
					namespace: "legacy/library/x",
				},
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "ISO-8859-1",
						paths: {
							src: "src",
							test: "test"
						}
					},
					pathMappings: {
						"/resources/": "src",
						"/test-resources/": "test"
					}
				},
				dependencies: [{
					id: "legacy.library.y",
					kind: "project",
					version: "1.0.0",
					specVersion: "0.1",
					path: legacyCollectionLibraryY,
					_level: 1,
					type: "library",
					metadata: {
						name: "legacy.library.y",
						copyright: "${copyright}",
						namespace: "legacy/library/y",
					},
					resources: {
						configuration: {
							propertiesFileSourceEncoding: "ISO-8859-1",
							paths: {
								src: "src",
								test: "test"
							}
						},
						pathMappings: {
							"/resources/": "src",
							"/test-resources/": "test"
						}
					},
					dependencies: []
				}]
			}, {
				id: "legacy.library.y",
				kind: "project",
				version: "1.0.0",
				specVersion: "0.1",
				path: legacyCollectionLibraryY,
				_level: 1,
				type: "library",
				metadata: {
					name: "legacy.library.y",
					copyright: "${copyright}",
					namespace: "legacy/library/y",
				},
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "ISO-8859-1",
						paths: {
							src: "src",
							test: "test"
						}
					},
					pathMappings: {
						"/resources/": "src",
						"/test-resources/": "test"
					}
				},
				dependencies: []
			}],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "0.1",
			path: applicationAPath
		}, "Parsed correctly");
	});
});

test("Project with project-type extension dependency inline configuration", (t) => {
	// "project-type" extension handling not yet implemented => test currently checks for error
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "extension.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "project-type",
			metadata: {
				name: "z"
			}
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "z",
		metadata: {
			name: "xy"
		}
	};
	return t.throwsAsync(projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "z",
			metadata: {
				name: "xy",
			},
			resources: {
				configuration: {
					propertiesFileSourceEncoding: "ISO-8859-1",
					paths: {
						root: ""
					}
				},
				pathMappings: {
					"/": "",
				}
			},
			dependencies: [],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "0.1",
			path: applicationAPath
		}, "Parsed correctly");
	}), {message: "Unknown extension type 'project-type' for extension.a"}, "Rejected with error");
});

test("Project with unknown extension dependency inline configuration", (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "extension.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "phony-pony",
			metadata: {
				name: "pinky.pie"
			}
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	return t.throwsAsync(projectPreprocessor.processTree(tree),
		{message: "Unknown extension type 'phony-pony' for extension.a"}, "Rejected with error");
});

test("Project with task extension dependency", (t) => {
	// "project-type" extension handling not yet implemented => test currently checks for error
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "ext.task.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "task",
			metadata: {
				name: "task.a"
			},
			task: {
				path: "task.a.js"
			}
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree.dependencies.length, 0, "Application project has no dependencies");
		const taskRepository = require("@ui5/builder").tasks.taskRepository;
		t.truthy(taskRepository.getTask("task.a"), "task.a has been added to the task repository");
	});
});

test("Project with task extension dependency - does not throw for invalid task path", async (t) => {
	// "project-type" extension handling not yet implemented => test currently checks for error
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "ext.task.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "task",
			metadata: {
				name: "task.b"
			},
			task: {
				path: "task.not.existing.js"
			}
		}],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	await t.notThrowsAsync(projectPreprocessor.processTree(tree));
});


test("Project with middleware extension dependency", (t) => {
	// "project-type" extension handling not yet implemented => test currently checks for error
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "ext.middleware.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "server-middleware",
			metadata: {
				name: "middleware.a"
			},
			middleware: {
				path: "middleware.a.js"
			}
		}],
		version: "1.0.0",
		specVersion: "1.0",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree.dependencies.length, 0, "Application project has no dependencies");
		const {middlewareRepository} = require("@ui5/server");
		t.truthy(middlewareRepository.getMiddleware("middleware.a"),
			"middleware.a has been added to the middleware repository");
	});
});

test("Project with middleware extension dependency - middleware is missing configuration", async (t) => {
	// "project-type" extension handling not yet implemented => test currently checks for error
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [{
			id: "ext.middleware.a",
			path: applicationAPath,
			dependencies: [],
			version: "1.0.0",
			specVersion: "0.1",
			kind: "extension",
			type: "server-middleware",
			metadata: {
				name: "middleware.a"
			}
		}],
		version: "1.0.0",
		specVersion: "1.0",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const error = await t.throwsAsync(projectPreprocessor.processTree(tree));
	t.deepEqual(error.message, `Middleware extension ext.middleware.a is missing 'middleware' configuration`,
		"Rejected with error");
});

test("specVersion: Missing version", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	await t.throwsAsync(preprocessor.applyExtension(extension),
		{message: "No specification version defined for extension shims.a"},
		"Rejected with error");
});

test("specVersion: Extension with invalid version", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "0.9",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	await t.throwsAsync(preprocessor.applyExtension(extension), {message:
		"Unsupported specification version 0.9 defined for extension shims.a. " +
		"Your UI5 CLI installation might be outdated. For details see " +
		"https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions"},
	"Rejected with error");
});

test("specVersion: Extension with valid version 0.1", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "0.1",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "0.1", "Correct spec version");
});

test("specVersion: Extension with valid version 1.0", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "1.0",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "1.0", "Correct spec version");
});

test("specVersion: Extension with valid version 1.1", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "1.1",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "1.1", "Correct spec version");
});

test("specVersion: Extension with valid version 2.0", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.0",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "2.0", "Correct spec version");
});

test("specVersion: Extension with valid version 2.1", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.1",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "2.1", "Correct spec version");
});

test("specVersion: Extension with valid version 2.2", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.2",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "2.2", "Correct spec version");
});

test("specVersion: Extension with valid version 2.3", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.3",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "2.3", "Correct spec version");
});

test("specVersion: Extension with valid version 2.4", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.4",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "2.4", "Correct spec version");
});

test("specVersion: Extension with valid version 2.5", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.5",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "2.5", "Correct spec version");
});

test("specVersion: Extension with valid version 2.6", async (t) => {
	const extension = {
		id: "extension.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.6",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "shims.a"
		},
		shims: {}
	};
	const preprocessor = new Preprocessor({});
	const handleShimStub = sinon.stub(preprocessor, "handleShim");
	await preprocessor.applyExtension(extension);
	t.deepEqual(handleShimStub.getCall(0).args[0].specVersion, "2.6", "Correct spec version");
});
