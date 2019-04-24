const {test} = require("ava");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const assert = chai.assert;

const ui5Builder = require("../../../");
const builder = ui5Builder.builder;
const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const applicationGPath = path.join(__dirname, "..", "..", "fixtures", "application.g");
const applicationHPath = path.join(__dirname, "..", "..", "fixtures", "application.h");
const applicationIPath = path.join(__dirname, "..", "..", "fixtures", "application.i");
const libraryDPath = path.join(__dirname, "..", "..", "fixtures", "library.d");
const libraryEPath = path.join(__dirname, "..", "..", "fixtures", "library.e");
const libraryHPath = path.join(__dirname, "..", "..", "fixtures", "library.h");
const libraryIPath = path.join(__dirname, "..", "..", "fixtures", "library.i");
const libraryJPath = path.join(__dirname, "..", "..", "fixtures", "library.j");
const libraryCore = path.join(__dirname, "..", "..", "fixtures", "sap.ui.core-evo");
const themeJPath = path.join(__dirname, "..", "..", "fixtures", "theme.j");

const recursive = require("recursive-readdir");

const newLineRegexp = /\r?\n|\r/g;

const findFiles = (folder) => {
	return new Promise((resolve, reject) => {
		recursive(folder, (err, files) => {
			if (err) {
				reject(err);
			} else {
				resolve(files);
			}
		});
	});
};

function cloneProjectTree(tree) {
	const clone = JSON.parse(JSON.stringify(tree));

	function increaseDepth(node) {
		node._level++;
		if (Array.isArray(node.dependencies)) {
			node.dependencies.forEach(increaseDepth);
		}
	}

	increaseDepth(clone);
	return clone;
}

async function checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath) {
	for (let i = 0; i < expectedFiles.length; i++) {
		const expectedFile = expectedFiles[i];
		const relativeFile = path.relative(expectedPath, expectedFile);
		const destFile = path.join(destPath, relativeFile);
		const currentFileContentPromise = readFile(destFile, "utf8");
		const expectedFileContentPromise = readFile(expectedFile, "utf8");
		const assertContents = ([currentContent, expectedContent]) => {
			if (expectedFile.endsWith("sap-ui-cachebuster-info.json")) {
				currentContent = JSON.parse(currentContent.replace(/(:\s+)(\d+)/g, ": 0"));
				expectedContent = JSON.parse(expectedContent.replace(/(:\s+)(\d+)/g, ": 0"));
				assert.deepEqual(currentContent, expectedContent);
			} else {
				assert.equal(currentContent.replace(newLineRegexp, "\n"), expectedContent.replace(newLineRegexp, "\n"));
			}
		};
		await Promise.all([currentFileContentPromise, expectedFileContentPromise]).then(assertContents);
	}
}

test("Build application.a", (t) => {
	const destPath = "./test/tmp/build/application.a/dest";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest");

	return builder.build({
		tree: applicationATree,
		destPath,
		excludedTasks: ["generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a [dev mode]", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-dev";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-dev");

	return builder.build({
		tree: applicationATree,
		destPath,
		dev: true
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.g", (t) => {
	const destPath = "./test/tmp/build/application.g/dest";
	const expectedPath = path.join("test", "expected", "build", "application.g", "dest");

	return builder.build({
		tree: applicationGTree,
		destPath,
		excludedTasks: ["generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.g with component preload paths", (t) => {
	const destPath = "./test/tmp/build/application.g/dest2";
	const expectedPath = path.join("test", "expected", "build", "application.g", "dest");

	return builder.build({
		tree: applicationGTreeComponentPreloadPaths,
		destPath,
		excludedTasks: ["generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.h", (t) => {
	const destPath = "./test/tmp/build/application.h/dest";
	const expectedPath = path.join("test", "expected", "build", "application.h", "dest");

	return builder.build({
		tree: applicationHTree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.i", (t) => {
	const destPath = "./test/tmp/build/application.i/dest";
	const expectedPath = path.join("test", "expected", "build", "application.i", "dest");

	return builder.build({
		tree: applicationITree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.d with copyright from .library file", (t) => {
	const destPath = "./test/tmp/build/library.d/dest";
	const expectedPath = path.join("test", "expected", "build", "library.d", "dest");

	return builder.build({
		tree: libraryDTree,
		destPath,
		excludedTasks: ["generateLibraryPreload"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.e with copyright from settings of ui5.yaml", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.e", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.e", "dest");

	return builder.build({
		tree: libraryETree,
		destPath,
		excludedTasks: ["generateLibraryPreload"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.h with custom bundles and component-preloads", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.h", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.h", "dest");

	return builder.build({
		tree: libraryHTree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateLibraryPreload"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.i with manifest info taken from .library and library.js", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.i", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.i", "dest");

	return builder.build({
		tree: libraryITree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateLibraryPreload", "uglify"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.j with JSDoc build only", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.j", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.j", "dest");

	return builder.build({
		tree: libraryJTree,
		destPath,
		includedTasks: ["generateJsdoc"],
		excludedTasks: ["*"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build theme.j even without an library", (t) => {
	const destPath = "./test/tmp/build/theme.j/dest";
	const expectedPath = "./test/expected/build/theme.j/dest";
	return builder.build({
		tree: themeJTree,
		destPath
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		expectedFiles.forEach((expectedFile) => {
			const relativeFile = path.relative(expectedPath, expectedFile);
			const destFile = path.join(destPath, relativeFile);
			assert.fileEqual(destFile, expectedFile);
			t.pass();
		});
	});
});

const applicationATree = {
	"id": "application.a",
	"version": "1.0.0",
	"path": applicationAPath,
	"dependencies": [
		{
			"id": "library.d",
			"version": "1.0.0",
			"path": path.join(applicationAPath, "node_modules", "library.d"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
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
			}
		},
		{
			"id": "library.a",
			"version": "1.0.0",
			"path": path.join(applicationAPath, "node_modules", "collection", "library.a"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.a",
				"copyright": "${copyright}"
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
			}
		},
		{
			"id": "library.b",
			"version": "1.0.0",
			"path": path.join(applicationAPath, "node_modules", "collection", "library.b"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.b",
				"copyright": "${copyright}"
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
			}
		},
		{
			"id": "library.c",
			"version": "1.0.0",
			"path": path.join(applicationAPath, "node_modules", "collection", "library.c"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.c",
				"copyright": "${copyright}"
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
			}
		}
	],
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.a"
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
	}
};

const applicationGTree = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.g",
		"namespace": "application/g",
		"copyright": "Some fancy copyright"
	},
	"dependencies": [],
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
	"builder": {
		"componentPreload": {
			"namespaces": [
				"application/g",
				"application/g/subcomponentA",
				"application/g/subcomponentB"
			]
		}
	}
};

const applicationGTreeComponentPreloadPaths = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.g",
		"namespace": "application/g",
		"copyright": "Some fancy copyright"
	},
	"dependencies": [],
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
	"builder": {
		"componentPreload": {
			"paths": [
				"application/g/**/Component.js"
			]
		}
	}
};

const applicationHTree = {
	"id": "application.h",
	"version": "1.0.0",
	"path": applicationHPath,
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.h",
		"namespace": "application/h"
	},
	"dependencies": [],
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
	"builder": {
		"bundles": [{
			"bundleDefinition": {
				"name": "application/h/sectionsA/customBundle.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"application/h/sectionsA/",
						"!application/h/sectionsA/section2**",
					]
				}],
				"sort": true
			},
			"bundleOptions": {
				"optimize": true,
				"usePredefinedCalls": true
			}
		},
		{
			"bundleDefinition": {
				"name": "application/h/sectionsB/customBundle.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"application/h/sectionsB/"
					]
				}]
			},
			"bundleOptions": {
				"optimize": true,
				"usePredefinedCalls": true
			}
		}]
	}
};

const applicationITree = {
	"id": "application.i",
	"version": "1.0.0",
	"path": applicationIPath,
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.i",
		"namespace": "application/i"
	},
	"dependencies": [],
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
	"builder": {
		"bundles": []
	}
};

const libraryDTree = {
	"id": "library.d",
	"version": "1.0.0",
	"path": libraryDPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		}
	],
	"_level": 0,
	"specVersion": "0.1",
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
	}
};

const libraryETree = {
	"id": "library.e",
	"version": "1.0.0",
	"path": libraryEPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		}
	],
	"_level": 0,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.e",
		"copyright": "UI development toolkit for HTML5 (OpenUI5)\n * (c) Copyright 2009-xxx SAP SE or an SAP affiliate company.\n * Licensed under the Apache License, Version 2.0 - see LICENSE.txt."
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
	}
};

const libraryHTree = {
	"id": "library.h",
	"version": "1.0.0",
	"path": libraryHPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		}
	],
	"_level": 0,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.h",
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
	"builder": {
		"bundles": [{
			"bundleDefinition": {
				"name": "library/h/customBundle.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"library/h/some.js",
						"library/h/library.js",
						"library/h/file.js",
						"!library/h/not.js",
						"!library/h/components/"
					],
					"resolve": false,
					"renderer": false
				}]
			},
			"bundleOptions": {
				"optimize": true,
				"usePredefinedCalls": true
			}
		}],
		"componentPreload": {
			"namespaces": [
				"library/h/components",
				"library/h/components/subcomponent1",
				"library/h/components/subcomponent2",
				"library/h/components/subcomponent3"
			]
		}
	}
};

const libraryITree = {
	"id": "library.i",
	"version": "1.0.0",
	"path": libraryIPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		},
		cloneProjectTree(libraryDTree)
	],
	"_level": 0,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.i",
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
	}
};

const libraryJTree = {
	"id": "library.j",
	"version": "1.0.0",
	"path": libraryJPath,
	"dependencies": [],
	"_level": 0,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.j",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src"
			}
		},
		"pathMappings": {
			"/resources/": "main/src"
		}
	}
};

const themeJTree = {
	"id": "library.i",
	"version": "1.0.0",
	"path": themeJPath,
	"dependencies": [],
	"_level": 0,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "theme.j",
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
	}
};
