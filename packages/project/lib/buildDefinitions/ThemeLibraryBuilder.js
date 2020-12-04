const AbstractBuilder = require("./AbstractBuilder");

class ThemeLibraryBuilder extends AbstractBuilder {
	addStandardTasks({project, taskUtil, getTask}) {
		this.addTask("replaceCopyright", {
			options: {
				copyright: project.getCopyright(),
				pattern: "/resources/**/*.{less,theme}"
			}
		});

		this.addTask("replaceVersion", {
			options: {
				version: project.getVersion(),
				pattern: "/resources/**/*.{less,theme}"
			}
		});

		this.addTask("buildThemes", {
			requiresDependencies: true,
			options: {
				librariesPattern: !taskUtil.isRootProject() ? "/resources/**/(*.library|library.js)" : undefined,
				themesPattern: !taskUtil.isRootProject() ? "/resources/sap/ui/core/themes/*" : undefined,
				inputPattern: "/resources/**/themes/*/library.source.less",
				cssVariables: taskUtil.getBuildOption("cssVariables")
			}
		});

		this.addTask("generateThemeDesignerResources", {
			requiresDependencies: true,
			options: {
				version: project.getVersion()
			}
		});

		this.addTask("generateResourcesJson", {requiresDependencies: true});
	}
}

module.exports = ThemeLibraryBuilder;
