// Custom task that reads a configuration file from the project root (outside the UI5 resource model)
// through taskUtil.getProject().getRootReader() and derives its output from that file's content.
// Exercises root-resource tracking: a change to the root config must invalidate this task's cache.
module.exports = async function ({taskUtil, workspace}) {
	const {createResource} = taskUtil.resourceFactory;
	const rootReader = taskUtil.getProject().getRootReader();
	const tsconfig = await rootReader.byPath("/tsconfig.json");
	const content = tsconfig ? await tsconfig.getString() : "no-tsconfig";
	await workspace.write(createResource({
		path: "/tsconfigDigest.js",
		string: `export const tsconfig = ${JSON.stringify(content)};\n`,
	}));
};
