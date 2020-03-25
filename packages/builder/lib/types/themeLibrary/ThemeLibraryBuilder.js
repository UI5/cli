const AbstractBuilder = require("../AbstractBuilder");
const taskRepository = require("../../tasks/taskRepository");

class ThemeLibraryBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log, buildContext}) {
		this.addTask("replaceCopyright", async () => {
			return taskRepository.getTask("replaceCopyright").task({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/resources/**/*.{less,theme}"
				}
			});
		});

		this.addTask("replaceVersion", async () => {
			return taskRepository.getTask("replaceVersion").task({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/resources/**/*.{less,theme}"
				}
			});
		});

		this.addTask("buildThemes", async () => {
			return taskRepository.getTask("buildThemes").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name,
					librariesPattern: !buildContext.isRootProject() ? "/resources/**/*.library" : undefined,
					themesPattern: !buildContext.isRootProject() ? "/resources/sap/ui/core/themes/*" : undefined,
					inputPattern: "/resources/**/themes/*/library.source.less"
				}
			});
		});
	}
}

module.exports = ThemeLibraryBuilder;
