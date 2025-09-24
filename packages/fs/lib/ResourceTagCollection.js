const tagNamespaceRegExp = /^[a-z][a-z0-9]+$/; // part before the colon
const tagNameRegExp = /^[A-Z][A-Za-z0-9]+$/; // part after the colon
import ResourceFacade from "./ResourceFacade.js";

/**
 * A ResourceTagCollection
 *
 * @private
 * @class
 * @alias @ui5/fs/internal/ResourceTagCollection
 */
class ResourceTagCollection {
	constructor({allowedTags = [], allowedNamespaces = [], tags}) {
		this._allowedTags = allowedTags; // Allowed tags are validated during use
		this._allowedNamespaces = allowedNamespaces;

		if (allowedNamespaces.length) {
			let allowedNamespacesRegExp = allowedNamespaces.reduce((regex, tagNamespace, idx) => {
				// Ensure alphanum namespace to ensure working regex
				if (!tagNamespaceRegExp.test(tagNamespace)) {
					throw new Error(`Invalid namespace ${tagNamespace}: ` +
						`Namespace must be alphanumeric, lowercase and start with a letter`);
				}
				return `${regex}${idx === 0 ? "" : "|"}${tagNamespace}`;
			}, "^(?:");
			allowedNamespacesRegExp += "):.+$";
			this._allowedNamespacesRegExp = new RegExp(allowedNamespacesRegExp);
		} else {
			this._allowedNamespacesRegExp = null;
		}

		this._pathTags = tags || Object.create(null);
	}

	setTag(resourcePath, tag, value = true) {
		resourcePath = this._getPath(resourcePath);
		this._validateTag(tag);
		this._validateValue(value);

		if (!this._pathTags[resourcePath]) {
			this._pathTags[resourcePath] = Object.create(null);
		}
		this._pathTags[resourcePath][tag] = value;
	}

	clearTag(resourcePath, tag) {
		resourcePath = this._getPath(resourcePath);
		this._validateTag(tag);

		if (this._pathTags[resourcePath]) {
			this._pathTags[resourcePath][tag] = undefined;
		}
	}

	getTag(resourcePath, tag) {
		resourcePath = this._getPath(resourcePath);
		this._validateTag(tag);

		if (this._pathTags[resourcePath]) {
			return this._pathTags[resourcePath][tag];
		}
	}

	getAllTags() {
		return this._pathTags;
	}

	acceptsTag(tag) {
		if (this._allowedTags.includes(tag) || this._allowedNamespacesRegExp?.test(tag)) {
			return true;
		}
		return false;
	}

	_getPath(resourcePath) {
		if (typeof resourcePath !== "string") {
			if (resourcePath instanceof ResourceFacade) {
				resourcePath = resourcePath.getConcealedResource().getPath();
			} else {
				resourcePath = resourcePath.getPath();
			}
		}
		if (!resourcePath) {
			throw new Error(`Invalid Resource: Resource path must not be empty`);
		}
		return resourcePath;
	}

	_validateTag(tag) {
		if (!tag.includes(":")) {
			throw new Error(`Invalid Tag "${tag}": Colon required after namespace`);
		}
		const parts = tag.split(":");
		if (parts.length > 2) {
			throw new Error(`Invalid Tag "${tag}": Expected exactly one colon but found ${parts.length - 1}`);
		}

		const [tagNamespace, tagName] = parts;
		if (!tagNamespaceRegExp.test(tagNamespace)) {
			throw new Error(
				`Invalid Tag "${tag}": Namespace part must be alphanumeric, lowercase and start with a letter`);
		}
		if (!tagNameRegExp.test(tagName)) {
			throw new Error(`Invalid Tag "${tag}": Name part must be alphanumeric and start with a capital letter`);
		}

		if (!this.acceptsTag(tag)) {
			throw new Error(
				`Tag "${tag}" not accepted by this collection. Accepted tags are: ` +
				`${this._allowedTags.join(", ") || "*none*"}. Accepted namespaces are: ` +
				`${this._allowedNamespaces.join(", ") || "*none*"}`);
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

export default ResourceTagCollection;
