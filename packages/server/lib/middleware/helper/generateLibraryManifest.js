import createManifestProcessor from "@ui5/builder/processors/manifestCreator";

export default async function generateLibraryManifest(middlewareUtil, dotLibResource) {
	const project = dotLibResource.getProject();
	const libResources = await project.getReader().byGlob(
		`/resources/**/*.{js,json,library,less,css,theming,theme,properties}`);

	const res = await createManifestProcessor({
		libraryResource: dotLibResource,
		namespace: project.getNamespace(),
		resources: libResources,
		getProjectVersion: (projectName) => {
			return middlewareUtil.getProject(projectName)?.getVersion();
		}
	});
	if (res) {
		res.setProject(project);
		return res;
	}
}
