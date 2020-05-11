const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const path = require("path");
const gracefulFs = require("graceful-fs");
const validator = require("../../lib/validation/validator");
const ValidationError = require("../../lib/validation/ValidationError");
const projectPreprocessor = require("../../lib/projectPreprocessor");
const applicationAPath = path.join(__dirname, "..", "fixtures", "application.a");
const applicationBPath = path.join(__dirname, "..", "fixtures", "application.b");
const applicationCPath = path.join(__dirname, "..", "fixtures", "application.c");
const libraryAPath = path.join(__dirname, "..", "fixtures", "collection", "library.a");
const libraryBPath = path.join(__dirname, "..", "fixtures", "collection", "library.b");
// const libraryCPath = path.join(__dirname, "..", "fixtures", "collection", "library.c");
const libraryDPath = path.join(__dirname, "..", "fixtures", "library.d");
const cycleDepsBasePath = path.join(__dirname, "..", "fixtures", "cyclic-deps", "node_modules");
const pathToInvalidModule = path.join(__dirname, "..", "fixtures", "invalidModule");

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test("Project with inline configuration", (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "1.0",
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
			dependencies: [],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "1.0",
			path: applicationAPath
		}, "Parsed correctly");
	});
});

test("Project with configPath", (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		configPath: path.join(applicationBPath, "ui5.yaml"), // B, not A - just to have something different
		dependencies: [],
		version: "1.0.0"
	};
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "application.b",
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
			dependencies: [],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "0.1",
			path: applicationAPath,
			configPath: path.join(applicationBPath, "ui5.yaml")
		}, "Parsed correctly");
	});
});

test("Project with ui5.yaml at default location", (t) => {
	const tree = {
		id: "application.a",
		version: "1.0.0",
		path: applicationAPath,
		dependencies: []
	};
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "application.a",
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
			dependencies: [],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "1.0",
			path: applicationAPath
		}, "Parsed correctly");
	});
});

test("Project with ui5.yaml at default location and some configuration", (t) => {
	const tree = {
		id: "application.c",
		version: "1.0.0",
		path: applicationCPath,
		dependencies: []
	};
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "application.c",
				namespace: "id1"
			},
			resources: {
				configuration: {
					propertiesFileSourceEncoding: "ISO-8859-1",
					paths: {
						webapp: "src"
					}
				},
				pathMappings: {
					"/": "src",
				}
			},
			dependencies: [],
			id: "application.c",
			kind: "project",
			version: "1.0.0",
			specVersion: "0.1",
			path: applicationCPath
		}, "Parsed correctly");
	});
});

test("Missing configuration for root project", async (t) => {
	const tree = {
		id: "application.a",
		path: "non-existent",
		dependencies: []
	};
	const exception = await t.throwsAsync(projectPreprocessor.processTree(tree));

	t.true(exception.message.includes("Failed to read configuration for project application.a"),
		"Error message should contain expected reason");
});

test("Missing id for root project", (t) => {
	const tree = {
		path: path.join(__dirname, "../fixtures/application.a"),
		dependencies: []
	};
	return t.throwsAsync(projectPreprocessor.processTree(tree),
		{message: "Encountered project with missing id (root project)"}, "Rejected with error");
});

test("No type configured for root project", (t) => {
	const tree = {
		id: "application.a",
		version: "1.0.0",
		specVersion: "0.1",
		path: path.join(__dirname, "../fixtures/application.a"),
		dependencies: [],
		metadata: {
			name: "application.a",
			namespace: "id1"
		}
	};
	return t.throwsAsync(projectPreprocessor.processTree(tree),
		{message: "No type configured for root project application.a"},
		"Rejected with error");
});

test("Missing dependencies", (t) => {
	const tree = ({
		id: "application.a",
		version: "1.0.0",
		path: applicationAPath,
		dependencies: []
	});
	return t.notThrowsAsync(projectPreprocessor.processTree(tree),
		"Gracefully accepted project with no dependency attribute");
});

test("Single non-root application-project", (t) => {
	const tree = ({
		id: "library.a",
		version: "1.0.0",
		path: libraryAPath,
		dependencies: [{
			id: "application.a",
			version: "1.0.0",
			path: applicationAPath,
			dependencies: []
		}]
	});
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree.id, "library.a", "Correct root project");
		t.deepEqual(parsedTree.dependencies.length, 1, "application-project dependency was not ignored");
		t.deepEqual(parsedTree.dependencies[0].id, "application.a", "application-project is on second level");
	});
});

test("Multiple non-root application-projects on same level", (t) => {
	const tree = ({
		id: "library.a",
		version: "1.0.0",
		path: libraryAPath,
		dependencies: [{
			id: "application.a",
			version: "1.0.0",
			path: applicationAPath,
			dependencies: []
		}, {
			id: "application.b",
			version: "1.0.0",
			path: applicationBPath,
			dependencies: []
		}]
	});
	return t.throwsAsync(projectPreprocessor.processTree(tree), {message:
		"Found at least two projects application.a and application.b of type application with the same distance to " +
		"the root project. Only one project of type application can be used. Failed to decide which one to ignore."},
	"Rejected with error");
});

test("Multiple non-root application-projects on different levels", (t) => {
	const tree = ({
		id: "library.a",
		version: "1.0.0",
		path: libraryAPath,
		dependencies: [{
			id: "application.a",
			version: "1.0.0",
			path: applicationAPath,
			dependencies: []
		}, {
			id: "library.b",
			version: "1.0.0",
			path: libraryBPath,
			dependencies: [{
				id: "application.b",
				version: "1.0.0",
				path: applicationBPath,
				dependencies: []
			}]
		}]
	});
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree.id, "library.a", "Correct root project");
		t.deepEqual(parsedTree.dependencies.length, 2, "No dependency of the first level got ignored");
		t.deepEqual(parsedTree.dependencies[0].id, "application.a", "First application-project did not get ignored");
		t.deepEqual(parsedTree.dependencies[1].dependencies.length, 0,
			"Second (deeper) application-project got ignored");
	});
});

test("Root- and non-root application-projects", (t) => {
	const tree = ({
		id: "application.a",
		version: "1.0.0",
		path: applicationAPath,
		dependencies: [{
			id: "library.a",
			version: "1.0.0",
			path: libraryAPath,
			dependencies: [{
				id: "application.b",
				version: "1.0.0",
				path: applicationBPath,
				dependencies: []
			}]
		}]
	});
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree.id, "application.a", "Correct root project");
		t.deepEqual(parsedTree.dependencies[0].id, "library.a", "Correct library dependency");
		t.deepEqual(parsedTree.dependencies[0].dependencies[0], undefined,
			"Second application-project dependency was ignored");
	});
});

test("Ignores additional application-projects", (t) => {
	const tree = ({
		id: "application.a",
		version: "1.0.0",
		path: applicationAPath,
		dependencies: [{
			id: "application.b",
			version: "1.0.0",
			path: applicationBPath,
			dependencies: []
		}]
	});
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "application.a",
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
			dependencies: [],
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "1.0",
			path: applicationAPath
		}, "Parsed correctly");
	});
});

test("Inconsistent dependencies with same ID", (t) => {
	// The one closer to the root should win
	const tree = {
		id: "application.a",
		version: "1.0.0",
		specVersion: "0.1",
		path: applicationAPath,
		type: "application",
		metadata: {
			name: "application.a"
		},
		dependencies: [
			{
				id: "library.d",
				version: "1.0.0",
				specVersion: "0.1",
				path: libraryDPath,
				type: "library",
				metadata: {
					name: "library.d",
				},
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "ISO-8859-1",
						paths: {
							src: "main/src",
							test: "main/test"
						}
					}
				},
				dependencies: [
					{
						id: "library.a",
						version: "1.0.0",
						specVersion: "0.1",
						path: libraryBPath, // B, not A - inconsistency!
						type: "library",
						metadata: {
							name: "library.XY",
						},
						dependencies: []
					}
				]
			},
			{
				id: "library.a",
				version: "1.0.0",
				specVersion: "0.1",
				path: libraryAPath,
				type: "library",
				metadata: {
					name: "library.a",
				},
				dependencies: []
			}
		]
	};
	return projectPreprocessor.processTree(tree).then((parsedTree) => {
		t.deepEqual(parsedTree, {
			id: "application.a",
			kind: "project",
			version: "1.0.0",
			specVersion: "0.1",
			path: applicationAPath,
			_level: 0,
			_isRoot: true,
			type: "application",
			metadata: {
				name: "application.a",
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
					"/": "webapp"
				}
			},
			dependencies: [
				{
					id: "library.d",
					kind: "project",
					version: "1.0.0",
					specVersion: "0.1",
					path: libraryDPath,
					_level: 1,
					type: "library",
					metadata: {
						name: "library.d",
						namespace: "library/d",
						copyright: "Some fancy copyright",
					},
					resources: {
						configuration: {
							propertiesFileSourceEncoding: "ISO-8859-1",
							paths: {
								src: "main/src",
								test: "main/test"
							}
						},
						pathMappings: {
							"/resources/": "main/src",
							"/test-resources/": "main/test"
						}
					},
					dependencies: [
						{
							id: "library.a",
							kind: "project",
							version: "1.0.0",
							specVersion: "0.1",
							path: libraryAPath,
							_level: 1,
							type: "library",
							metadata: {
								name: "library.a",
								namespace: "library/a",
								copyright: "Some fancy copyright ${currentYear}",
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
						}
					]
				},
				{
					id: "library.a",
					kind: "project",
					version: "1.0.0",
					specVersion: "0.1",
					path: libraryAPath,
					_level: 1,
					type: "library",
					metadata: {
						name: "library.a",
						namespace: "library/a",
						copyright: "Some fancy copyright ${currentYear}",
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
				}
			]
		}, "Parsed correctly");
	});
});

test("Project tree A with inline configs", (t) => {
	return projectPreprocessor.processTree(treeAWithInlineConfigs).then((parsedTree) => {
		t.deepEqual(parsedTree, expectedTreeAWithInlineConfigs, "Parsed correctly");
	});
});

test("Project tree A with configPaths", (t) => {
	return projectPreprocessor.processTree(treeAWithConfigPaths).then((parsedTree) => {
		t.deepEqual(parsedTree, expectedTreeAWithConfigPaths, "Parsed correctly");
	});
});

test("Project tree A with default YAMLs", (t) => {
	return projectPreprocessor.processTree(treeAWithDefaultYamls).then((parsedTree) => {
		t.deepEqual(parsedTree, expectedTreeAWithDefaultYamls, "Parsed correctly");
	});
});

test("Project tree B with inline configs", (t) => {
	// Tree B depends on Library B which has a dependency to Library D
	return projectPreprocessor.processTree(treeBWithInlineConfigs).then((parsedTree) => {
		t.deepEqual(parsedTree, expectedTreeBWithInlineConfigs, "Parsed correctly");
	});
});

test("Project tree Cycle A with inline configs", (t) => {
	// Tree B depends on Library B which has a dependency to Library D
	return projectPreprocessor.processTree(treeApplicationCycleA).then((parsedTree) => {
		t.deepEqual(parsedTree, expectedTreeApplicationCycleA, "Parsed correctly");
	});
});

test("Project with nested invalid dependencies", (t) => {
	return projectPreprocessor.processTree(treeWithInvalidModules).then((parsedTree) => {
		t.deepEqual(parsedTree, expectedTreeWithInvalidModules);
	});
});

/* ========================= */
/* ======= Test data ======= */

/* === Invalid Modules */
const treeWithInvalidModules = {
	id: "application.a",
	path: applicationAPath,
	dependencies: [
		// A
		{
			id: "library.a",
			path: libraryAPath,
			dependencies: [
				{
					// C - invalid - should be missing in preprocessed tree
					id: "module.c",
					dependencies: [],
					path: pathToInvalidModule,
					version: "1.0.0"
				},
				{
					// D - invalid - should be missing in preprocessed tree
					id: "module.d",
					dependencies: [],
					path: pathToInvalidModule,
					version: "1.0.0"
				}
			],
			version: "1.0.0",
			specVersion: "1.0",
			type: "library",
			metadata: {name: "library.a"}
		},
		// B
		{
			id: "library.b",
			path: libraryBPath,
			dependencies: [
				{
					// C - invalid - should be missing in preprocessed tree
					id: "module.c",
					dependencies: [],
					path: pathToInvalidModule,
					version: "1.0.0"
				},
				{
					// D - invalid - should be missing in preprocessed tree
					id: "module.d",
					dependencies: [],
					path: pathToInvalidModule,
					version: "1.0.0"
				}
			],
			version: "1.0.0",
			specVersion: "1.0",
			type: "library",
			metadata: {name: "library.b"}
		}
	],
	version: "1.0.0",
	specVersion: "1.0",
	type: "application",
	metadata: {
		name: "application.a"
	}
};

const expectedTreeWithInvalidModules = {
	"id": "application.a",
	"path": applicationAPath,
	"dependencies": [{
		"id": "library.a",
		"path": libraryAPath,
		"dependencies": [],
		"version": "1.0.0",
		"specVersion": "1.0",
		"type": "library",
		"metadata": {
			"name": "library.a",
			"namespace": "library/a",
			"copyright": "Some fancy copyright ${currentYear}"
		},
		"kind": "project",
		"_level": 1,
		"resources": {
			"configuration": {
				"propertiesFileSourceEncoding": "ISO-8859-1",
				"paths": {
					"src": "src",
					"test": "test"
				}
			},
			"pathMappings": {
				"/resources/": "src",
				"/test-resources/": "test"
			}
		}
	}, {
		"id": "library.b",
		"path": libraryBPath,
		"dependencies": [],
		"version": "1.0.0",
		"specVersion": "1.0",
		"type": "library",
		"metadata": {
			"name": "library.b",
			"namespace": "library/b",
			"copyright": "Some fancy copyright ${currentYear}"
		},
		"kind": "project",
		"_level": 1,
		"resources": {
			"configuration": {
				"propertiesFileSourceEncoding": "ISO-8859-1",
				"paths": {
					"src": "src",
					"test": "test"
				}
			},
			"pathMappings": {
				"/resources/": "src",
				"/test-resources/": "test"
			}
		}
	}],
	"version": "1.0.0",
	"specVersion": "1.0",
	"type": "application",
	"metadata": {
		"name": "application.a",
		"namespace": "id1"
	},
	"_level": 0,
	"_isRoot": true,
	"kind": "project",
	"resources": {
		"configuration": {
			"propertiesFileSourceEncoding": "ISO-8859-1",
			"paths": {
				"webapp": "webapp"
			}
		},
		"pathMappings": {
			"/": "webapp"
		}
	}
};

/* === Tree A === */
const treeAWithInlineConfigs = {
	id: "application.a",
	version: "1.0.0",
	specVersion: "1.0",
	path: applicationAPath,
	type: "application",
	metadata: {
		name: "application.a",
	},
	dependencies: [
		{
			id: "library.d",
			version: "1.0.0",
			specVersion: "0.1",
			path: libraryDPath,
			type: "library",
			metadata: {
				name: "library.d",
			},
			resources: {
				configuration: {
					propertiesFileSourceEncoding: "ISO-8859-1",
					paths: {
						src: "main/src",
						test: "main/test"
					}
				}
			},
			dependencies: [
				{
					id: "library.a",
					version: "1.0.0",
					specVersion: "0.1",
					path: libraryAPath,
					type: "library",
					metadata: {
						name: "library.a",
					},
					dependencies: []
				}
			]
		},
		{
			id: "library.a",
			version: "1.0.0",
			specVersion: "0.1",
			path: libraryAPath,
			type: "library",
			metadata: {
				name: "library.a"
			},
			dependencies: []
		}
	]
};

const treeAWithConfigPaths = {
	id: "application.a",
	version: "1.0.0",
	path: applicationAPath,
	configPath: path.join(applicationAPath, "ui5.yaml"),
	dependencies: [
		{
			id: "library.d",
			version: "1.0.0",
			path: libraryDPath,
			configPath: path.join(libraryDPath, "ui5.yaml"),
			dependencies: [
				{
					id: "library.a",
					version: "1.0.0",
					path: libraryAPath,
					configPath: path.join(libraryAPath, "ui5.yaml"),
					dependencies: []
				}
			]
		},
		{
			id: "library.a",
			version: "1.0.0",
			path: libraryAPath,
			configPath: path.join(libraryAPath, "ui5.yaml"),
			dependencies: []
		}
	]
};

const treeAWithDefaultYamls = {
	id: "application.a",
	version: "1.0.0",
	path: applicationAPath,
	dependencies: [
		{
			id: "library.d",
			version: "1.0.0",
			path: libraryDPath,
			dependencies: [
				{
					id: "library.a",
					version: "1.0.0",
					path: libraryAPath,
					dependencies: []
				}
			]
		},
		{
			id: "library.a",
			version: "1.0.0",
			path: libraryAPath,
			dependencies: []
		}
	]
};

const expectedTreeAWithInlineConfigs = {
	"id": "application.a",
	"kind": "project",
	"version": "1.0.0",
	"specVersion": "1.0",
	"path": applicationAPath,
	"_level": 0,
	"_isRoot": true,
	"type": "application",
	"metadata": {
		"name": "application.a",
		"namespace": "id1"
	},
	"resources": {
		"configuration": {
			"propertiesFileSourceEncoding": "ISO-8859-1",
			"paths": {
				"webapp": "webapp"
			}
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"dependencies": [
		{
			"id": "library.d",
			"kind": "project",
			"version": "1.0.0",
			"specVersion": "0.1",
			"path": libraryDPath,
			"_level": 1,
			"type": "library",
			"metadata": {
				"name": "library.d",
				"namespace": "library/d",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "ISO-8859-1",
					"paths": {
						"src": "main/src",
						"test": "main/test"
					}
				},
				"pathMappings": {
					"/resources/": "main/src",
					"/test-resources/": "main/test"
				}
			},
			"dependencies": [
				{
					"id": "library.a",
					"kind": "project",
					"version": "1.0.0",
					"specVersion": "0.1",
					"path": libraryAPath,
					"_level": 1,
					"type": "library",
					"metadata": {
						"name": "library.a",
						"namespace": "library/a",
						"copyright": "Some fancy copyright ${currentYear}",
					},
					"resources": {
						"configuration": {
							"propertiesFileSourceEncoding": "ISO-8859-1",
							"paths": {
								"src": "src",
								"test": "test"
							}
						},
						"pathMappings": {
							"/resources/": "src",
							"/test-resources/": "test"
						}
					},
					"dependencies": []
				}
			]
		},
		{
			"id": "library.a",
			"kind": "project",
			"version": "1.0.0",
			"specVersion": "0.1",
			"path": libraryAPath,
			"_level": 1,
			"type": "library",
			"metadata": {
				"name": "library.a",
				"namespace": "library/a",
				"copyright": "Some fancy copyright ${currentYear}",
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "ISO-8859-1",
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			},
			"dependencies": []
		}
	]
};
const expectedTreeAWithDefaultYamls = expectedTreeAWithInlineConfigs;

// This is expectedTreeAWithInlineConfigs with added configPath attributes
const expectedTreeAWithConfigPaths = {
	"id": "application.a",
	"kind": "project",
	"version": "1.0.0",
	"specVersion": "1.0",
	"path": applicationAPath,
	"configPath": path.join(applicationAPath, "ui5.yaml"),
	"_level": 0,
	"_isRoot": true,
	"type": "application",
	"metadata": {
		"name": "application.a",
		"namespace": "id1"
	},
	"resources": {
		"configuration": {
			"propertiesFileSourceEncoding": "ISO-8859-1",
			"paths": {
				"webapp": "webapp"
			}
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"dependencies": [
		{
			"id": "library.d",
			"kind": "project",
			"version": "1.0.0",
			"specVersion": "0.1",
			"path": libraryDPath,
			"configPath": path.join(libraryDPath, "ui5.yaml"),
			"_level": 1,
			"type": "library",
			"metadata": {
				"name": "library.d",
				"namespace": "library/d",
				"copyright": "Some fancy copyright",
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "ISO-8859-1",
					"paths": {
						"src": "main/src",
						"test": "main/test"
					}
				},
				"pathMappings": {
					"/resources/": "main/src",
					"/test-resources/": "main/test"
				}
			},
			"dependencies": [
				{
					"id": "library.a",
					"kind": "project",
					"version": "1.0.0",
					"specVersion": "0.1",
					"path": libraryAPath,
					"configPath": path.join(libraryAPath, "ui5.yaml"),
					"_level": 1,
					"type": "library",
					"metadata": {
						"name": "library.a",
						"namespace": "library/a",
						"copyright": "Some fancy copyright ${currentYear}",
					},
					"resources": {
						"configuration": {
							"propertiesFileSourceEncoding": "ISO-8859-1",
							"paths": {
								"src": "src",
								"test": "test"
							}
						},
						"pathMappings": {
							"/resources/": "src",
							"/test-resources/": "test"
						}
					},
					"dependencies": []
				}
			]
		},
		{
			"id": "library.a",
			"kind": "project",
			"version": "1.0.0",
			"specVersion": "0.1",
			"path": libraryAPath,
			"configPath": path.join(libraryAPath, "ui5.yaml"),
			"_level": 1,
			"type": "library",
			"metadata": {
				"name": "library.a",
				"namespace": "library/a",
				"copyright": "Some fancy copyright ${currentYear}",
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "ISO-8859-1",
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			},
			"dependencies": []
		}
	]
};

/* === Tree B === */
const treeBWithInlineConfigs = {
	id: "application.b",
	version: "1.0.0",
	specVersion: "0.1",
	path: applicationBPath,
	type: "application",
	metadata: {
		name: "application.b"
	},
	dependencies: [
		{
			id: "library.b",
			version: "1.0.0",
			specVersion: "0.1",
			path: libraryBPath,
			type: "library",
			metadata: {
				name: "library.b",
			},
			dependencies: [
				{
					id: "library.d",
					version: "1.0.0",
					specVersion: "0.1",
					path: libraryDPath,
					type: "library",
					metadata: {
						name: "library.d",
					},
					resources: {
						configuration: {
							propertiesFileSourceEncoding: "ISO-8859-1",
							paths: {
								src: "main/src",
								test: "main/test"
							}
						}
					},
					dependencies: [
						{
							id: "library.a",
							version: "1.0.0",
							specVersion: "0.1",
							path: libraryAPath,
							type: "library",
							metadata: {
								name: "library.a"
							},
							dependencies: []
						}
					]
				}
			]
		},
		{
			id: "library.d",
			version: "1.0.0",
			specVersion: "0.1",
			path: libraryDPath,
			type: "library",
			metadata: {
				name: "library.d",
			},
			resources: {
				configuration: {
					propertiesFileSourceEncoding: "ISO-8859-1",
					paths: {
						src: "main/src",
						test: "main/test"
					}
				}
			},
			dependencies: [
				{
					id: "library.a",
					version: "1.0.0",
					specVersion: "0.1",
					path: libraryAPath,
					type: "library",
					metadata: {
						name: "library.a"
					},
					dependencies: []
				}
			]
		}
	]
};

const expectedTreeBWithInlineConfigs = {
	"id": "application.b",
	"kind": "project",
	"version": "1.0.0",
	"specVersion": "0.1",
	"path": applicationBPath,
	"_level": 0,
	"_isRoot": true,
	"type": "application",
	"metadata": {
		"name": "application.b",
		"namespace": "id1"
	},
	"resources": {
		"configuration": {
			"propertiesFileSourceEncoding": "ISO-8859-1",
			"paths": {
				"webapp": "webapp"
			}
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"dependencies": [
		{
			"id": "library.b",
			"kind": "project",
			"version": "1.0.0",
			"specVersion": "0.1",
			"path": libraryBPath,
			"_level": 1,
			"type": "library",
			"metadata": {
				"name": "library.b",
				"namespace": "library/b",
				"copyright": "Some fancy copyright ${currentYear}",
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "ISO-8859-1",
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			},
			"dependencies": [
				{
					"id": "library.d",
					"kind": "project",
					"version": "1.0.0",
					"specVersion": "0.1",
					"path": libraryDPath,
					"_level": 1,
					"type": "library",
					"metadata": {
						"name": "library.d",
						"namespace": "library/d",
						"copyright": "Some fancy copyright"
					},
					"resources": {
						"configuration": {
							"propertiesFileSourceEncoding": "ISO-8859-1",
							"paths": {
								"src": "main/src",
								"test": "main/test"
							}
						},
						"pathMappings": {
							"/resources/": "main/src",
							"/test-resources/": "main/test"
						}
					},
					"dependencies": [
						{
							"id": "library.a",
							"kind": "project",
							"version": "1.0.0",
							"specVersion": "0.1",
							"path": libraryAPath,
							"_level": 2,
							"type": "library",
							"metadata": {
								"name": "library.a",
								"namespace": "library/a",
								"copyright": "Some fancy copyright ${currentYear}",
							},
							"resources": {
								"configuration": {
									"propertiesFileSourceEncoding": "ISO-8859-1",
									"paths": {
										"src": "src",
										"test": "test"
									}
								},
								"pathMappings": {
									"/resources/": "src",
									"/test-resources/": "test"
								}
							},
							"dependencies": []
						}
					]
				}
			]
		},
		{
			"id": "library.d",
			"kind": "project",
			"version": "1.0.0",
			"specVersion": "0.1",
			"path": libraryDPath,
			"_level": 1,
			"type": "library",
			"metadata": {
				"name": "library.d",
				"namespace": "library/d",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "ISO-8859-1",
					"paths": {
						"src": "main/src",
						"test": "main/test"
					}
				},
				"pathMappings": {
					"/resources/": "main/src",
					"/test-resources/": "main/test"
				}
			},
			"dependencies": [
				{
					"id": "library.a",
					"kind": "project",
					"version": "1.0.0",
					"specVersion": "0.1",
					"path": libraryAPath,
					"_level": 2,
					"type": "library",
					"metadata": {
						"name": "library.a",
						"namespace": "library/a",
						"copyright": "Some fancy copyright ${currentYear}"
					},
					"resources": {
						"configuration": {
							"propertiesFileSourceEncoding": "ISO-8859-1",
							"paths": {
								"src": "src",
								"test": "test"
							}
						},
						"pathMappings": {
							"/resources/": "src",
							"/test-resources/": "test"
						}
					},
					"dependencies": []
				}
			]
		}
	]
};

const treeApplicationCycleA = {
	id: "application.cycle.a",
	version: "1.0.0",
	specVersion: "0.1",
	path: path.join(cycleDepsBasePath, "application.cycle.a"),
	type: "application",
	metadata: {
		name: "application.cycle.a",
	},
	dependencies: [
		{
			id: "component.cycle.a",
			version: "1.0.0",
			specVersion: "0.1",
			path: path.join(cycleDepsBasePath, "component.cycle.a"),
			type: "library",
			metadata: {
				name: "component.cycle.a",
			},
			dependencies: [
				{
					id: "library.cycle.a",
					version: "1.0.0",
					specVersion: "0.1",
					path: path.join(cycleDepsBasePath, "library.cycle.a"),
					type: "library",
					metadata: {
						name: "library.cycle.a",
					},
					dependencies: [
						{
							id: "component.cycle.a",
							version: "1.0.0",
							specVersion: "0.1",
							path: path.join(cycleDepsBasePath, "component.cycle.a"),
							type: "library",
							metadata: {
								name: "component.cycle.a",
							},
							dependencies: [],
							deduped: true
						}
					]
				},
				{
					id: "library.cycle.b",
					version: "1.0.0",
					specVersion: "0.1",
					path: path.join(cycleDepsBasePath, "library.cycle.b"),
					type: "library",
					metadata: {
						name: "library.cycle.b",
					},
					dependencies: [
						{
							id: "component.cycle.a",
							version: "1.0.0",
							specVersion: "0.1",
							path: path.join(cycleDepsBasePath, "component.cycle.a"),
							type: "library",
							metadata: {
								name: "component.cycle.a",
							},
							dependencies: [],
							deduped: true
						}
					]
				},
				{
					id: "application.cycle.a",
					version: "1.0.0",
					specVersion: "0.1",
					path: path.join(cycleDepsBasePath, "application.cycle.a"),
					type: "application",
					metadata: {
						name: "application.cycle.a",
					},
					dependencies: [],
					deduped: true
				}
			]
		}
	]
};

const expectedTreeApplicationCycleA = {
	"id": "application.cycle.a",
	"version": "1.0.0",
	"specVersion": "0.1",
	"path": path.join(cycleDepsBasePath, "application.cycle.a"),
	"type": "application",
	"metadata": {
		"name": "application.cycle.a",
		"namespace": "id1"
	},
	"dependencies": [
		{
			"id": "component.cycle.a",
			"version": "1.0.0",
			"specVersion": "0.1",
			"path": path.join(cycleDepsBasePath, "component.cycle.a"),
			"type": "library",
			"metadata": {
				"name": "component.cycle.a",
				"namespace": "component/cycle/a",
				"copyright": "${copyright}"
			},
			"dependencies": [
				{
					"id": "library.cycle.a",
					"version": "1.0.0",
					"specVersion": "0.1",
					"path": path.join(cycleDepsBasePath, "library.cycle.a"),
					"type": "library",
					"metadata": {
						"name": "library.cycle.a",
						"namespace": "cycle/a",
						"copyright": "${copyright}"
					},
					"dependencies": [
						{
							"id": "component.cycle.a",
							"version": "1.0.0",
							"specVersion": "0.1",
							"path": path.join(cycleDepsBasePath, "component.cycle.a"),
							"type": "library",
							"metadata": {
								"name": "component.cycle.a",
							},
							"dependencies": [],
							"deduped": true
						}
					],
					"kind": "project",
					"_level": 2,
					"resources": {
						"configuration": {
							"propertiesFileSourceEncoding": "ISO-8859-1",
							"paths": {
								"src": "src",
								"test": "test"
							}
						},
						"pathMappings": {
							"/resources/": "src",
							"/test-resources/": "test"
						}
					}
				},
				{
					"id": "library.cycle.b",
					"version": "1.0.0",
					"specVersion": "0.1",
					"path": path.join(cycleDepsBasePath, "library.cycle.b"),
					"type": "library",
					"metadata": {
						"name": "library.cycle.b",
						"namespace": "cycle/b",
						"copyright": "${copyright}"
					},
					"dependencies": [
						{
							"id": "component.cycle.a",
							"version": "1.0.0",
							"specVersion": "0.1",
							"path": path.join(cycleDepsBasePath, "component.cycle.a"),
							"type": "library",
							"metadata": {
								"name": "component.cycle.a",
							},
							"dependencies": [],
							"deduped": true
						}
					],
					"kind": "project",
					"_level": 2,
					"resources": {
						"configuration": {
							"propertiesFileSourceEncoding": "ISO-8859-1",
							"paths": {
								"src": "src",
								"test": "test"
							}
						},
						"pathMappings": {
							"/resources/": "src",
							"/test-resources/": "test"
						}
					}
				},
				{
					"id": "application.cycle.a",
					"version": "1.0.0",
					"specVersion": "0.1",
					"path": path.join(cycleDepsBasePath, "application.cycle.a"),
					"type": "application",
					"metadata": {
						"name": "application.cycle.a",
					},
					"dependencies": [],
					"deduped": true
				}
			],
			"kind": "project",
			"_level": 1,
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "ISO-8859-1",
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		}
	],
	"_level": 0,
	"_isRoot": true,
	"kind": "project",
	"resources": {
		"configuration": {
			"propertiesFileSourceEncoding": "ISO-8859-1",
			"paths": {
				"webapp": "webapp"
			}
		},
		"pathMappings": {
			"/": "webapp"
		}
	}
};

/* ======= /Test data ======= */
/* ========================= */

test("Application version in package.json data is missing", (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	return t.throwsAsync(projectPreprocessor.processTree(tree)).then((error) => {
		t.is(error.message, "\"version\" is missing for project " + tree.id);
	});
});

test("Library version in package.json data is missing", (t) => {
	const tree = {
		id: "library.d",
		path: libraryDPath,
		dependencies: [],
		type: "library",
		metadata: {
			name: "library.d"
		}
	};
	return t.throwsAsync(projectPreprocessor.processTree(tree)).then((error) => {
		t.is(error.message, "\"version\" is missing for project " + tree.id);
	});
});

test("specVersion: Missing version", async (t) => {
	const tree = {
		id: "application.a",
		path: "non-existent",
		dependencies: [],
		version: "1.0.0",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const exception = await t.throwsAsync(projectPreprocessor.processTree(tree));

	t.true(exception.message.includes("Failed to read configuration for project application.a"),
		"Error message should contain expected reason");
});

test("specVersion: Project with invalid version", async (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "0.9",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const validationError = await t.throwsAsync(projectPreprocessor.processTree(tree), {
		instanceOf: ValidationError
	});

	t.is(validationError.errors.length, 1, "ValidationError should have one error object");
	t.is(validationError.errors[0].dataPath, "/specVersion", "Error should be for the specVersion");
});

test("specVersion: Project with valid version 0.1", async (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const res = await projectPreprocessor.processTree(tree);
	t.deepEqual(res.specVersion, "0.1", "Correct spec version");
});

test("specVersion: Project with valid version 1.0", async (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "1.0",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const res = await projectPreprocessor.processTree(tree);
	t.deepEqual(res.specVersion, "1.0", "Correct spec version");
});

test("specVersion: Project with valid version 1.1", async (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "1.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const res = await projectPreprocessor.processTree(tree);
	t.deepEqual(res.specVersion, "1.1", "Correct spec version");
});

test("specVersion: Project with valid version 2.0", async (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.0",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const res = await projectPreprocessor.processTree(tree);
	t.deepEqual(res.specVersion, "2.0", "Correct spec version");
});

test("specVersion: Project with valid version 2.1", async (t) => {
	const tree = {
		id: "application.a",
		path: applicationAPath,
		dependencies: [],
		version: "1.0.0",
		specVersion: "2.1",
		type: "application",
		metadata: {
			name: "xy"
		}
	};
	const res = await projectPreprocessor.processTree(tree);
	t.deepEqual(res.specVersion, "2.1", "Correct spec version");
});

test("isBeingProcessed: Is not being processed", (t) => {
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	preprocessor.processedProjects = {};

	const project = {
		id: "some.id",
		_level: 1337
	};
	const parent = {
		dependencies: [project]
	};
	const res = preprocessor.isBeingProcessed(parent, project);
	t.deepEqual(res, false, "Project is not processed");
	t.deepEqual(parent.dependencies.length, 1, "Parent still has one dependency");
});

test("isBeingProcessed: Is being processed", (t) => {
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const alreadyProcessedProject = {
		project: {
			id: "some.id",
			_level: 42
		},
		parents: []
	};
	preprocessor.processedProjects = {
		"some.id": alreadyProcessedProject
	};

	const project = {
		id: "some.id",
		_level: 1337
	};
	const parent = {
		dependencies: [project]
	};
	const res = preprocessor.isBeingProcessed(parent, project);
	t.deepEqual(res, true, "Project is already processed");
	t.deepEqual(parent.dependencies.length, 1, "parent still has one dependency");
	t.deepEqual(parent.dependencies[0]._level, 42, "Parent dependency got replaced with already processed project");
	t.deepEqual(alreadyProcessedProject.parents.length, 1, "Already processed project now has one parent");
	t.is(alreadyProcessedProject.parents[0], parent, "Parent got added as parent of already processed project");
});

test("isBeingProcessed: Processed project is ignored", (t) => {
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const alreadyProcessedProject = {
		project: {
			id: "some.id",
			_level: 42
		},
		parents: [],
		ignored: true
	};
	preprocessor.processedProjects = {
		"some.id": alreadyProcessedProject
	};

	const project = {
		id: "some.id",
		_level: 1337
	};
	const parent = {
		dependencies: [project]
	};
	const res = preprocessor.isBeingProcessed(parent, project);
	t.deepEqual(res, true, "Project is already processed");
	t.deepEqual(parent.dependencies.length, 0, "Project got removed from parent dependencies");
	t.deepEqual(alreadyProcessedProject.parents.length, 0, "Already processed project still has no parents");
});

test("isBeingProcessed: Processed project is ignored but already removed from parent", (t) => {
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const alreadyProcessedProject = {
		project: {
			id: "some.id",
			_level: 42
		},
		parents: [],
		ignored: true
	};
	preprocessor.processedProjects = {
		"some.id": alreadyProcessedProject
	};

	const project = {
		id: "some.id",
		_level: 1337
	};
	const otherProject = {
		id: "some.other.id"
	};
	const parent = {
		dependencies: [otherProject]
	};
	const res = preprocessor.isBeingProcessed(parent, project);
	t.deepEqual(res, true, "Project is already processed");
	t.deepEqual(parent.dependencies.length, 1, "Parent still has one dependency");
	t.deepEqual(parent.dependencies[0].id, "some.other.id",
		"Parent dependency to another project has not been removed");
	t.deepEqual(alreadyProcessedProject.parents.length, 0, "Already processed project still has no parents");
});

test("isBeingProcessed: Deduped project is being ignored", (t) => {
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	preprocessor.processedProjects = {};

	const project = {
		deduped: true
	};
	const parent = {};

	const res = preprocessor.isBeingProcessed(parent, project);
	t.deepEqual(res, true, "Project is being ignored");
});


test.serial("applyType", async (t) => {
	const formatStub = sinon.stub();
	const getTypeStub = sinon.stub(require("@ui5/builder").types.typeRepository, "getType")
		.returns({
			format: formatStub
		});

	const project = {
		type: "pony",
		metadata: {}
	};

	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});
	await preprocessor.applyType(project);

	t.is(getTypeStub.callCount, 1, "getType got called once");
	t.deepEqual(getTypeStub.getCall(0).args[0], "pony", "getType got called with correct type");

	t.is(formatStub.callCount, 1, "format got called once");
	t.is(formatStub.getCall(0).args[0], project, "format got called with correct project");
});

test.serial("checkProjectMetadata: Warning logged for deprecated dependencies", async (t) => {
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("pony");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	const logWarnSpy = sinon.spy(loggerInstance, "warn");

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");

	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const project1 = {
		_level: 0,
		_isRoot: true,
		metadata: {
			name: "root.project",
			deprecated: true
		}
	};

	// no warning should be logged for root level project
	await preprocessor.checkProjectMetadata(null, project1);

	const project2 = {
		_level: 1,
		metadata: {
			name: "my.project",
			deprecated: true
		}
	};

	// one warning should be logged for deprecated dependency
	await preprocessor.checkProjectMetadata(project1, project2);

	t.is(logWarnSpy.callCount, 1, "One warning got logged");
	t.deepEqual(logWarnSpy.getCall(0).args[0],
		"Dependency my.project is deprecated and should not be used for new projects!",
		"Logged expected warning message");
});

test.serial("checkProjectMetadata: No warning logged for nested deprecated libraries", async (t) => {
	sinon.stub(require("@ui5/builder").types.typeRepository, "getType")
		.returns({format: () => {}});

	// Spying logger of processors/bootstrapHtmlTransformer
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("pony");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	const logWarnSpy = sinon.spy(loggerInstance, "warn");

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");

	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const project1 = {
		_level: 1,
		metadata: {
			name: "some.project",
			deprecated: true
		}
	};

	// no warning should be logged for nested project
	await preprocessor.checkProjectMetadata(null, project1);

	const project2 = {
		_level: 2,
		metadata: {
			name: "my.project",
			deprecated: true
		}
	};
	await preprocessor.checkProjectMetadata(project1, project2);

	t.is(logWarnSpy.callCount, 0, "No warning got logged");
});

test.serial("checkProjectMetadata: Warning logged for SAP internal dependencies", async (t) => {
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("pony");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	const logWarnSpy = sinon.spy(loggerInstance, "warn");

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");

	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const project1 = {
		_level: 0,
		_isRoot: true,
		metadata: {
			name: "root.project",
			sapInternal: true
		}
	};

	// no warning should be logged for root level project
	await preprocessor.checkProjectMetadata(null, project1);

	const project2 = {
		_level: 1,
		metadata: {
			name: "my.project",
			sapInternal: true
		}
	};

	// one warning should be logged for internal dependency
	await preprocessor.checkProjectMetadata(project1, project2);

	t.is(logWarnSpy.callCount, 1, "One warning got logged");
	t.deepEqual(logWarnSpy.getCall(0).args[0],
		`Dependency my.project is restricted for use by SAP internal projects only! ` +
		`If the project root.project is an SAP internal project, add the attribute ` +
		`"allowSapInternal: true" to its metadata configuration`,
		"Logged expected warning message");
});

test.serial("checkProjectMetadata: No warning logged for allowed SAP internal libraries", async (t) => {
	sinon.stub(require("@ui5/builder").types.typeRepository, "getType")
		.returns({format: () => {}});

	// Spying logger of processors/bootstrapHtmlTransformer
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("pony");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	const logWarnSpy = sinon.spy(loggerInstance, "warn");

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");

	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const project1 = {
		_level: 0,
		_isRoot: true,
		metadata: {
			name: "root.project",
			allowSapInternal: true // parent project (=root) allows sap internal project use
		}
	};

	const project2 = {
		_level: 1,
		metadata: {
			name: "my.project",
			sapInternal: true
		}
	};

	await preprocessor.checkProjectMetadata(project1, project2);

	t.is(logWarnSpy.callCount, 0, "No warning got logged");
});

test.serial("checkProjectMetadata: No warning logged for nested SAP internal libraries", async (t) => {
	sinon.stub(require("@ui5/builder").types.typeRepository, "getType")
		.returns({format: () => {}});

	// Spying logger of processors/bootstrapHtmlTransformer
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("pony");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	const logWarnSpy = sinon.spy(loggerInstance, "warn");

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");

	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const project1 = {
		_level: 1,
		metadata: {
			name: "some.project",
			allowSapInternal: true // this flag doesn't matter for deeply nested internal dependency
		}
	};

	const project2 = {
		_level: 2,
		metadata: {
			name: "my.project",
			sapInternal: true
		}
	};

	await preprocessor.checkProjectMetadata(project1, project2);

	t.is(logWarnSpy.callCount, 0, "No warning got logged");
});


test.serial("readConfigFile: No exception for valid config", async (t) => {
	const configPath = path.join("/application", "ui5.yaml");
	const ui5yaml = `
---
specVersion: "2.0"
type: application
metadata:
  name: application.a
`;

	const validateSpy = sinon.spy(validator, "validate");

	sinon.stub(gracefulFs, "readFile")
		.callsFake((path) => {
			throw new Error("readFileStub called with unexpected path: " + path);
		})
		.withArgs(configPath).yieldsAsync(null, ui5yaml);

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	await t.notThrowsAsync(async () => {
		await preprocessor.readConfigFile({path: "/application", id: "id"});
	});

	t.is(validateSpy.callCount, 1, "validate should be called once");
	t.deepEqual(validateSpy.getCall(0).args, [{
		config: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			}
		},
		project: {
			id: "id",
		},
		yaml: {
			documentIndex: 0,
			path: configPath,
			source: ui5yaml
		},

	}],
	"validate should be called with expected args");
});

test.serial("readConfigFile: Exception for invalid config", async (t) => {
	const configPath = path.join("/application", "ui5.yaml");
	const ui5yaml = `
---
specVersion: "2.0"
type: application
metadata:
  name: application.a
---
specVersion: "2.0"
kind: extension
type: task
metadata:
  name: my-task
---
specVersion: "2.0"
kind: extension
type: server-middleware
metadata:
  name: my-middleware
`;

	const validateSpy = sinon.spy(validator, "validate");

	sinon.stub(gracefulFs, "readFile")
		.callsFake((path) => {
			throw new Error("readFileStub called with unexpected path: " + path);
		})
		.withArgs(configPath).yieldsAsync(null, ui5yaml);

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const validationError = await t.throwsAsync(async () => {
		await preprocessor.readConfigFile({path: "/application", id: "id"});
	}, {
		instanceOf: ValidationError,
		name: "ValidationError"
	});

	t.is(validationError.yaml.documentIndex, 1, "Error of first invalid document should be thrown");

	t.is(validateSpy.callCount, 3, "validate should be called 3 times");
	t.deepEqual(validateSpy.getCall(0).args, [{
		config: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			}
		},
		project: {
			id: "id",
		},
		yaml: {
			documentIndex: 0,
			path: configPath,
			source: ui5yaml,
		},
	}],
	"validate should be called first time with expected args");
	t.deepEqual(validateSpy.getCall(1).args, [{
		config: {
			specVersion: "2.0",
			kind: "extension",
			type: "task",
			metadata: {
				name: "my-task"
			}
		},
		project: {
			id: "id",
		},
		yaml: {
			documentIndex: 1,
			path: configPath,
			source: ui5yaml,
		},
	}],
	"validate should be called second time with expected args");
	t.deepEqual(validateSpy.getCall(2).args, [{
		config: {
			specVersion: "2.0",
			kind: "extension",
			type: "server-middleware",
			metadata: {
				name: "my-middleware"
			}
		},
		project: {
			id: "id",
		},
		yaml: {
			documentIndex: 2,
			path: configPath,
			source: ui5yaml,
		},
	}],
	"validate should be called third time with expected args");
});

test.serial("readConfigFile: Exception for invalid YAML file", async (t) => {
	const configPath = path.join("/application", "ui5.yaml");
	const ui5yaml = `
--
specVersion: "2.0"
foo: bar
metadata:
  name: application.a
`;

	const validateSpy = sinon.spy(validator, "validate");

	sinon.stub(gracefulFs, "readFile")
		.callsFake((path) => {
			throw new Error("readFileStub called with unexpected path: " + path);
		})
		.withArgs(configPath).yieldsAsync(null, ui5yaml);

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const error = await t.throwsAsync(async () => {
		await preprocessor.readConfigFile({path: "/application", id: "my-project"});
	});

	t.true(error.message.includes("Failed to parse configuration for project my-project"),
		"Error message should contain information about parsing error");

	t.is(validateSpy.callCount, 0, "validate should not be called");
});

test.serial("readConfigFile: Empty YAML", async (t) => {
	const configPath = path.join("/application", "ui5.yaml");
	const ui5yaml = "";

	const validateSpy = sinon.spy(validator, "validate");

	sinon.stub(gracefulFs, "readFile")
		.callsFake((path) => {
			throw new Error("readFileStub called with unexpected path: " + path);
		})
		.withArgs(configPath).yieldsAsync(null, ui5yaml);

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	const configs = await preprocessor.readConfigFile({path: "/application", id: "my-project"});

	t.deepEqual(configs, [], "Empty YAML should result in empty array");
	t.is(validateSpy.callCount, 0, "validate should not be called");
});

test.serial("loadProjectConfiguration: Runs validation if specVersion already exists (error)", async (t) => {
	const config = {
		specVersion: "2.0",
		foo: "bar",
		metadata: {
			name: "application.a"
		},

		id: "id",
		version: "1.0.0",
		path: "path",
		dependencies: []
	};

	const validateSpy = sinon.spy(validator, "validate");

	// Re-require tested module
	const projectPreprocessor = mock.reRequire("../../lib/projectPreprocessor");
	const preprocessor = new projectPreprocessor._ProjectPreprocessor({});

	await t.throwsAsync(async () => {
		await preprocessor.loadProjectConfiguration(config);
	}, {
		instanceOf: ValidationError,
		name: "ValidationError"
	});

	t.is(validateSpy.callCount, 1, "validate should be called once");
	t.deepEqual(validateSpy.getCall(0).args, [{
		config: {
			specVersion: "2.0",
			foo: "bar",
			metadata: {
				name: "application.a"
			}
		},
		project: {
			id: "id"
		}
	}],
	"validate should be called with expected args");
});
