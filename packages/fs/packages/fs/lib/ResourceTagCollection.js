const tagNamespaceRegExp = new RegExp("^[a-z][a-z0-9]*$"); // part before the colon
const tagNameRegExp = new RegExp("^[A-Z][A-Za-z0-9]+$"); // part after the colon

class ResourceTagCollection {
	constructor({allowedTags}) {
		if (!allowedTags || !allowedTags.length) {
			throw new Error(`Missing parameter 'allowedTags'`);
		}
		// No validation of tag names here since we might remove/ignore
		//	this parameter in the future and generally allow all tags
		this._allowedTags = Object.freeze(allowedTags);
		this._pathTags = {};
	}

	setTag(resource, tag, value = true) {
		this._validateResource(resource);
		this._validateTag(tag);
		this._validateValue(value);

		const resourcePath = resource.getPath();
		if (!this._pathTags[resourcePath]) {
			this._pathTags[resourcePath] = {};
		}
		this._pathTags[resourcePath][tag] = value;
	}

	clearTag(resource, tag) {
		this._validateResource(resource);
		this._validateTag(tag);

		const resourcePath = resource.getPath();
		if (this._pathTags[resourcePath]) {
			this._pathTags[resourcePath][tag] = undefined;
		}
	}

	getTag(resource, tag) {
		this._validateResource(resource);
		this._validateTag(tag);

		const resourcePath = resource.getPath();
		if (this._pathTags[resourcePath]) {
			return this._pathTags[resourcePath][tag];
		}
	}

	_validateResource(resource) {
		const path = resource.getPath();
		if (!path) {
			throw new Error(`Invalid Resource: Resource path must not be empty`);
		}
	}

	_validateTag(tag) {
		if (!this._allowedTags.includes(tag)) {
			throw new Error(`Invalid Tag: Not found in list of allowed tags. Allowed tags: ` +
				this._allowedTags.join(", "));
		}

		if (!tag.includes(":")) {
			throw new Error(`Invalid Tag: Colon required after namespace`);
		}
		const parts = tag.split(":");
		if (parts.length > 2) {
			throw new Error(`Invalid Tag: Expected exactly one colon but found ${parts.length - 1}`);
		}

		const [tagNamespace, tagName] = parts;
		if (!tagNamespaceRegExp.test(tagNamespace)) {
			throw new Error(
				`Invalid Tag: Namespace part must be alphanumeric, lowercase and start with a letter`);
		}
		if (!tagNameRegExp.test(tagName)) {
			throw new Error(`Invalid Tag: Name part must be alphanumeric and start with a capital letter`);
		}
	}

	_validateValue(value) {
		const type = typeof value;
		if (!["string", "number", "boolean"].includes(type)) {
			throw new Error(
				`Invalid Tag Value: Must be of type string, number or boolean but is ${type}`);
		}
	}
}

module.exports = ResourceTagCollection;
