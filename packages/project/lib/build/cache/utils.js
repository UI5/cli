export async function createResourceIndex(resources, includeInode = false) {
	const index = Object.create(null);
	await Promise.all(resources.map(async (resource) => {
		const resourceMetadata = {
			lastModified: resource.getLastModified(),
			size: await resource.getSize(),
			integrity: await resource.getIntegrity(),
		};
		if (includeInode) {
			resourceMetadata.inode = resource.getInode();
		}

		index[resource.getOriginalPath()] = resourceMetadata;
	}));
	return index;
}
