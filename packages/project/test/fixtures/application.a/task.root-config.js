// Custom task that reads a configuration file from the project root (outside the UI5 resource model)
// through taskUtil.getProject().getRootReader() and derives its output from that file's content.
// Exercises root-resource tracking: a change to the root config must invalidate this task's cache.
// Specification Version 5.0 descriptor: the default export is a factory that returns the task body.
module.exports = function build() {
	return {
		task: async ({taskUtil, workspace}) => {
			const {createResource} = taskUtil.resourceFactory;
			const rootReader = taskUtil.getProject().getRootReader();
			const tsconfig = await rootReader.byPath("/tsconfig.json");
			const content = tsconfig ? await tsconfig.getString() : "no-tsconfig";
			await workspace.write(createResource({
				path: "/tsconfigDigest.js",
				string: `export const tsconfig = ${JSON.stringify(content)};\n`,
			}));
		}
	};
};
