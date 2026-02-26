// This is a modified version of the compileLicenseSummary example of the UI5 CLI.
// (https://github.com/UI5/cli/blob/b72919469d856508dd757ecf325a5fb45f15e56d/internal/documentation/docs/pages/extensibility/CustomTasks.md#example-libtaskscompilelicensesummaryjs)

module.exports = async function ({dependencies, log, taskUtil, workspace, options: {projectNamespace}}) {
	const {createResource} = taskUtil.resourceFactory;
    const projectsVisited = new Set();

    async function processProject(project) {
		return Promise.all(taskUtil.getDependencies().map(async (projectName) => {
            if (projectName !== "library.d") {
				return;
			}
			if (projectsVisited.has(projectName)) {
                return;
            }
            projectsVisited.add(projectName);
            const project = taskUtil.getProject(projectName);
			const newLibraryFile = await project.getReader().byGlob("**/newLibraryFile.js");
			if (newLibraryFile.length > 0) {
				console.log('New Library file found. We are in #4 build.');
				// Change content of application.a:
				const applicationResource = await workspace.byPath("/resources/id1/test.js");
				const content = (await applicationResource.getString()) + "\n console.log('something new');";
				await workspace.write(createResource({
        			path: "/test.js",
        			string: content
    			}));
            } else {
				console.log(`New Library file not found. We are still in an earlier build.`);
            }
            return processProject(project);
        }));
    }
    // Start processing dependencies of the root project
    await processProject(taskUtil.getProject());
};
