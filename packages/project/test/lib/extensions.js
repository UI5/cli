const {test} = require("ava");
const path = require("path");
const projectPreprocessor = require("../..").projectPreprocessor;
const applicationAPath = path.join(__dirname, "..", "fixtures", "application.a");
const legacyLibraryAPath = path.join(__dirname, "..", "fixtures", "legacy.library.a");

test("Projects with extension dependency inline configuration", (t) => {
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
			configurations: {
				"legacy.library.a": {
					specVersion: "0.1",
					type: "library",
					metadata: {
						name: "legacy.library.a",
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

test("Projects with extension dependency inline configuration", (t) => {
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
