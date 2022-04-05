const test = require("ava");

const ThemeLibraryBuilder = require("../../../../lib/types/themeLibrary/ThemeLibraryBuilder");

test("tasks", async (t) => {
	const themeLibraryBuilder = new ThemeLibraryBuilder({
		resourceCollections: {
			workspace: {
				byGlob: async () => {
					return [];
				}
			},
			dependencies: {
				byGlob: async () => {
					return [];
				}
			}
		},
		buildContext: {
			isRootProject: () => {
				return true;
			}
		},
		project: {
			metadata: {
				name: "name",
				copyright: "copyright"
			},
			type: "type"
		},
		parentLogger: {
			createSubLogger: () => {
				return {
					createTaskLogger: () => {
						return {
							addWork: () => undefined,
							startWork: () => undefined,
							completeWork: () => undefined
						};
					}
				};
			}
		},
		taskUtil: {
			isRootProject: () => {
				return true;
			},
			getBuildOption: (key) => {
				return key;
			}
		}
	});

	const taskNames = Object.keys(themeLibraryBuilder.tasks);
	t.deepEqual(taskNames, [
		"replaceCopyright",
		"replaceVersion",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson",
	], "Expected tasks have been added");

	await themeLibraryBuilder.build(taskNames);
});
