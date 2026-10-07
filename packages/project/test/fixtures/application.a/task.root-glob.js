// Custom task that reads root configuration files through a glob with the gitignore filter disabled, so
// the read is recorded against the useGitignore:false root manager. Exercises glob-based root tracking:
// adding or removing a file matching the glob must invalidate the task's cache (root indices refresh by
// re-globbing, so a newly matching file is detected).
module.exports = async function ({taskUtil, workspace}) {
	const {createResource} = taskUtil.resourceFactory;
	const rootReader = taskUtil.getProject().getRootReader({useGitignore: false});
	const configs = await rootReader.byGlob("/rootcfg/**/*.json");
	const names = configs.map((r) => r.getPath()).sort();
	await workspace.write(createResource({
		path: "/rootGlobDigest.js",
		string: `export const configs = ${JSON.stringify(names)};\n`,
	}));
};
