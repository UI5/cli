const {test} = require("ava");
const path = require("path");
const projectPreprocessor = require("../..").projectPreprocessor;
const applicationAPath = path.join(__dirname, "..", "fixtures", "application.a");
const legacyLibraryAPath = path.join(__dirname, "..", "fixtures", "legacy.library.a");
const legacyLibraryBPath = path.join(__dirname, "..", "fixtures", "legacy.library.b");
const legacyCollectionAPath = path.join(__dirname, "..", "fixtures", "legacy.collection.a");
const legacyCollectionLibraryX = path.join(__dirname, "..", "fixtures", "legacy.collection.a",
	"src", "legacy.library.x");
const legacyCollectionLibraryY = path.join(__dirname, "..", "fixtures", "legacy.collection.a",
	"src", "legacy.library.y");

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
			type: "application",
			metadata: {
				name: "xy",
			},
			resources: {
				configuration: {
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
				},
				resources: {
					configuration: {
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
			type: "application",
			metadata: {
				name: "xy",
			},
			resources: {
				configuration: {
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
				},
				resources: {
					configuration: {
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
					},
					resources: {
						configuration: {
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
				},
				resources: {
					configuration: {
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
			type: "application",
			metadata: {
				name: "xy",
			},
			resources: {
				configuration: {
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
				},
				resources: {
					configuration: {
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
					},
					resources: {
						configuration: {
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
				},
				resources: {
					configuration: {
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
	return t.throws(projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			type: "z",
			metadata: {
				name: "xy",
			},
			resources: {
				configuration: {
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
	}), "Unknown extension type 'project-type' for extension.a", "Rejected with error");
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
	return t.throws(projectPreprocessor.processTree(tree),
		"Unknown extension type 'phony-pony' for extension.a", "Rejected with error");
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

test("Project with task extension dependency - task module not found", async (t) => {
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
	const error = await t.throws(projectPreprocessor.processTree(tree));
	t.regex(error.message, /^Cannot find module.*/, "Rejected with error");
});
