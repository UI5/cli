// Custom task whose root read is conditional: it reads /tsconfig.json through the project root reader
// only while /toggle.js exists in the workspace. Exercises a stage that stops reading a root resource.
// Once /toggle.js is gone the task records no root read, so the previously recorded root request must
// be cleared (and the emptied request set re-persisted), and a later change to /tsconfig.json must then
// no longer invalidate this stage.
module.exports = async function ({taskUtil, workspace, options: {projectNamespace}}) {
	const {createResource} = taskUtil.resourceFactory;
	const toggle = await workspace.byPath(`/resources/${projectNamespace}/toggle.js`);
	let content = "root-not-read";
	if (toggle) {
		const rootReader = taskUtil.getProject().getRootReader();
		const tsconfig = await rootReader.byPath("/tsconfig.json");
		content = tsconfig ? await tsconfig.getString() : "no-tsconfig";
	}
	await workspace.write(createResource({
		path: "/rootConditionalDigest.js",
		string: `export const content = ${JSON.stringify(content)};\n`,
	}));
};
