/**
 * @typedef {object} ResourceMetadata
 * @property {string} integrity Content integrity of the resource
 * @property {number} lastModified Last modified timestamp (mtimeMs)
 * @property {number} inode Inode number of the resource
 * @property {number} size Size of the resource in bytes
 */

/**
 * Compares two resource instances for equality
 *
 * @param {object} resourceA - First resource to compare
 * @param {object} resourceB - Second resource to compare
 * @returns {Promise<boolean>} True if resources are equal
 * @throws {Error} If either resource is undefined
 */
export async function areResourcesEqual(resourceA, resourceB) {
	if (!resourceA || !resourceB) {
		throw new Error("Cannot compare undefined resources");
	}
	if (resourceA === resourceB) {
		return true;
	}
	if (resourceA.getOriginalPath() !== resourceB.getOriginalPath()) {
		throw new Error("Cannot compare resources with different original paths");
	}
	if (resourceA.getLastModified() !== resourceB.getLastModified()) {
		return false;
	}
	if (await resourceA.getSize() !== resourceB.getSize()) {
		return false;
	}
	// if (await resourceA.getString() === await resourceB.getString()) {
	// 	return true;
	// }
	return false;
}

// /**
//  * Compares a resource instance with cached metadata fingerprint
//  *
//  * @param {object} resourceA - Resource instance to compare
//  * @param {ResourceMetadata} resourceBMetadata - Cached metadata to compare against
//  * @param {number} indexTimestamp - Timestamp of the index creation
//  * @returns {Promise<boolean>} True if resource matches the fingerprint
//  * @throws {Error} If resource or metadata is undefined
//  */
// export async function matchResourceMetadata(resourceA, resourceBMetadata, indexTimestamp) {
// 	if (!resourceA || !resourceBMetadata) {
// 		throw new Error("Cannot compare undefined resources");
// 	}
// 	if (resourceA.getLastModified() !== resourceBMetadata.lastModified) {
// 		return false;
// 	}
// 	if (await resourceA.getSize() !== resourceBMetadata.size) {
// 		return false;
// 	}
// 	if (resourceBMetadata.inode && resourceA.getInode() !== resourceBMetadata.inode) {
// 		return false;
// 	}
// 	if (await resourceA.getIntegrity() === resourceBMetadata.integrity) {
// 		return true;
// 	}
// 	return false;
// }

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
