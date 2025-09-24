export async function updateLibraryDotTheming({resource, namespace, version, hasThemes}) {
	const dotTheming = JSON.parse(await resource.getString());

	if (!dotTheming.sEntity) {
		throw new Error(`Missing 'sEntity' property in ${resource.getPath()}`);
	}

	if (dotTheming.sEntity !== "Library") {
		throw new Error(
			`Incorrect 'sEntity' value '${dotTheming.sEntity}' in ${resource.getPath()}: ` +
			`Expected 'Library'`
		);
	}

	if (!dotTheming.sId) {
		throw new Error(`Missing 'sId' property in ${resource.getPath()}`);
	}

	if (dotTheming.sId !== namespace) {
		throw new Error(`Incorrect 'sId' value '${dotTheming.sId}' in ${resource.getPath()}: Expected '${namespace}'`);
	}

	dotTheming.sVersion = version;

	if (!hasThemes) {
		// Set ignore flag when there are no themes at all
		// This is important in case a library used to contain themes that have been removed
		// in a later version of the library.
		dotTheming.bIgnore = true;
	}

	resource.setString(JSON.stringify(dotTheming, null, 2));
}
