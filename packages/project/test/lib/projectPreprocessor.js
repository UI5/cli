const {test} = require("ava");
const path = require("path");
const projectPreprocessor = require("../..").projectPreprocessor;
const applicationAPath = path.join(__dirname, "..", "fixtures", "application.a");
const applicationBPath = path.join(__dirname, "..", "fixtures", "application.b");
const applicationCPath = path.join(__dirname, "..", "fixtures", "application.c");
const libraryAPath = path.join(__dirname, "..", "fixtures", "collection", "library.a");
const libraryBPath = path.join(__dirname, "..", "fixtures", "collection", "library.b");
// const libraryCPath = path.join(__dirname, "..", "fixtures", "collection", "library.c");
const libraryDPath = path.join(__dirname, "..", "fixtures", "library.d");
const cycleDepsBasePath = path.join(__dirname, "..", "fixtures", "cyclic-deps", "node_modules");
const pathToInvalidModule = path.join(__dirname, "..", "fixtures", "invalidModule");

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
			type: "application",
			metadata: {
				name: "application.b"
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
			type: "application",
			metadata: {
				name: "application.a"
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
			type: "application",
			metadata: {
				name: "application.c",
				namespace: "id1"
			},
			resources: {
				configuration: {
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

test("Missing configuration for root project", (t) => {
	const tree = {
		id: "application.a",
		path: "non-existent",
		dependencies: []
	};
	return t.throws(projectPreprocessor.processTree(tree),
		"No specification version defined for root project application.a",
		"Rejected with error");
});

test("Missing id for root project", (t) => {
	const tree = {
		path: path.join(__dirname, "../fixtures/application.a"),
		dependencies: []
	};
	return t.throws(projectPreprocessor.processTree(tree),
		"Encountered project with missing id (root project)", "Rejected with error");
});

test("No type configured for root project", (t) => {
	const tree = {
		id: "application.a",
		version: "1.0.0",
		specVersion: "0.1",
		path: path.join(__dirname, "../fixtures/application.a"),
		dependencies: [],
		metadata: {
			name: "application.a"
		}
	};
	return t.throws(projectPreprocessor.processTree(tree),
		"No type configured for root project application.a",
		"Rejected with error");
});

test("Missing dependencies", (t) => {
	const tree = ({
		id: "application.a",
		version: "1.0.0",
		path: applicationAPath,
		dependencies: []
	});
	return t.notThrows(projectPreprocessor.processTree(tree),
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
	return t.throws(projectPreprocessor.processTree(tree),
		"Found at least two projects application.a and application.b of type application with the same distance to " +
			"the root project. Only one project of type application can be used. Failed to decide which one to ignore.",
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
			type: "application",
			metadata: {
				name: "application.a"
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
			type: "application",
			metadata: {
				name: "application.a"
			},
			resources: {
				configuration: {
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
						copyright: "Some fancy copyright",
					},
					resources: {
						configuration: {
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
								copyright: "Some fancy copyright ${currentYear}",
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
						copyright: "Some fancy copyright ${currentYear}",
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

test("Project tree B with inline configs", (t) => {
	// Tree B depends on Library B which has a dependency to Library D
	return projectPreprocessor.processTree(treeApplicationCycleA).then((parsedTree) => {
		t.deepEqual(parsedTree, expectedTreeApplicationCycleA, "Parsed correctly");
	});
});

test("Project with nested invalid dependencies", (t) => {
	return projectPreprocessor.processTree(treeWithInvalidModules).then((parsedTree) => {
		t.deepEqual(expectedTreeWithInvalidModules, parsedTree);
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
			"copyright": "Some fancy copyright ${currentYear}"
		},
		"kind": "project",
		"_level": 1,
		"resources": {
			"configuration": {
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
			"copyright": "Some fancy copyright ${currentYear}"
		},
		"kind": "project",
		"_level": 1,
		"resources": {
			"configuration": {
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
		"name": "application.a"
	},
	"_level": 0,
	"kind": "project",
	"resources": {
		"configuration": {
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
	"type": "application",
	"metadata": {
		"name": "application.a",
	},
	"resources": {
		"configuration": {
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
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
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
						"copyright": "Some fancy copyright ${currentYear}",
					},
					"resources": {
						"configuration": {
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
				"copyright": "Some fancy copyright ${currentYear}",
			},
			"resources": {
				"configuration": {
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
	"type": "application",
	"metadata": {
		"name": "application.a",
	},
	"resources": {
		"configuration": {
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
				"copyright": "Some fancy copyright",
			},
			"resources": {
				"configuration": {
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
						"copyright": "Some fancy copyright ${currentYear}",
					},
					"resources": {
						"configuration": {
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
				"copyright": "Some fancy copyright ${currentYear}",
			},
			"resources": {
				"configuration": {
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
	"type": "application",
	"metadata": {
		"name": "application.b",
		"namespace": "id1"
	},
	"resources": {
		"configuration": {
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
				"copyright": "Some fancy copyright ${currentYear}",
			},
			"resources": {
				"configuration": {
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
						"copyright": "Some fancy copyright"
					},
					"resources": {
						"configuration": {
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
								"copyright": "Some fancy copyright ${currentYear}",
							},
							"resources": {
								"configuration": {
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
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
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
						"copyright": "Some fancy copyright ${currentYear}"
					},
					"resources": {
						"configuration": {
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
		"name": "application.cycle.a"
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
								"name": "component.cycle.a"
							},
							"dependencies": [],
							"deduped": true
						}
					],
					"kind": "project",
					"_level": 2,
					"resources": {
						"configuration": {
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
								"name": "component.cycle.a"
							},
							"dependencies": [],
							"deduped": true
						}
					],
					"kind": "project",
					"_level": 2,
					"resources": {
						"configuration": {
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
						"name": "application.cycle.a"
					},
					"dependencies": [],
					"deduped": true
				}
			],
			"kind": "project",
			"_level": 1,
			"resources": {
				"configuration": {
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
	"kind": "project",
	"resources": {
		"configuration": {
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
	return t.throws(projectPreprocessor.processTree(tree)).then((error) => {
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
	return t.throws(projectPreprocessor.processTree(tree)).then((error) => {
		t.is(error.message, "\"version\" is missing for project " + tree.id);
	});
});

test("specVersion: Missing version", (t) => {
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
	return t.throws(projectPreprocessor.processTree(tree),
		"No specification version defined for root project application.a",
		"Rejected with error");
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
	await t.throws(projectPreprocessor.processTree(tree),
		"Unsupported specification version 0.9 defined for project application.a. " +
		"See https://github.com/SAP/ui5-project/blob/master/docs/Configuration.md#specification-versions",
		"Rejected with error");
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
