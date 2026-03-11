const tagNamespaceRegExp = /^[a-z][a-z0-9]+$/; // part before the colon
const tagNameRegExp = /^[A-Z][A-Za-z0-9]+$/; // part after the colon
import ResourceFacade from "./ResourceFacade.js";

/**
 * A ResourceTagCollection
 *
 * @class
 * @alias @ui5/fs/internal/ResourceTagCollection
 */
class ResourceTagCollection {
	/**
	 * Constructor
	 *
	 * @param {object} options Options
	 * @param {string[]} [options.allowedTags=[]] List of allowed tags
	 * @param {string[]} [options.allowedNamespaces=[]] List of allowed namespaces
	 * @param {object} [options.tags] Initial tags object mapping resource paths to their tags
	 */
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

	/**
	 * Set a tag on a resource
	 *
	 * @param {string|object} resourcePath Path of the resource or a resource instance
	 * @param {string} tag Tag in the format "namespace:Name"
	 * @param {string|number|boolean} [value=true] Tag value
	 */
	setTag(resourcePath, tag, value = true) {
		resourcePath = this._getPath(resourcePath);
		this._validateTag(tag);
		this._validateValue(value);

		if (!this._pathTags[resourcePath]) {
			this._pathTags[resourcePath] = Object.create(null);
		}
		this._pathTags[resourcePath][tag] = value;
	}

	/**
	 * Clear a tag from a resource
	 *
	 * @param {string|object} resourcePath Path of the resource or a resource instance
	 * @param {string} tag Tag in the format "namespace:Name"
	 */
	clearTag(resourcePath, tag) {
		resourcePath = this._getPath(resourcePath);
		this._validateTag(tag);

		if (this._pathTags[resourcePath]) {
			this._pathTags[resourcePath][tag] = undefined;
		}
	}

	/**
	 * Get a tag value from a resource
	 *
	 * @param {string|object} resourcePath Path of the resource or a resource instance
	 * @param {string} tag Tag in the format "namespace:Name"
	 * @returns {string|number|boolean|undefined} Tag value or undefined if not set
	 */
	getTag(resourcePath, tag) {
		resourcePath = this._getPath(resourcePath);
		this._validateTag(tag);

		if (this._pathTags[resourcePath]) {
			return this._pathTags[resourcePath][tag];
		}
	}

	/**
	 * Get all tags for all resources
	 *
	 * @returns {object} Object mapping resource paths to their tags
	 */
	getAllTags() {
		return this._pathTags;
	}
	/**
	 * Get all tags for all resources
	 *
	 * @param {string} resourcePath Path of the resource
	 * @returns {object} Object mapping tags to their values for the given resource path
	 */
	getAllTagsForResource(resourcePath) {
		return this._pathTags[resourcePath] || Object.create(null);
	}

	/**
	 * Check if a tag is accepted by this collection
	 *
	 * @param {string} tag Tag in the format "namespace:Name"
	 * @returns {boolean} Whether the tag is accepted
	 */
	acceptsTag(tag) {
		if (this._allowedTags.includes(tag) || this._allowedNamespacesRegExp?.test(tag)) {
			return true;
		}
		return false;
	}

	/**
	 * Extract the path from a resource or validate a path string
	 *
	 * @param {string|object} resourcePath Path of the resource or a resource instance
	 * @returns {string} Resolved resource path
	 */
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

	/**
	 * Validate a tag format and check if it's accepted by this collection
	 *
	 * @param {string} tag Tag in the format "namespace:Name"
	 * @throws {Error} If the tag format is invalid or not accepted
	 */
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

	/**
	 * Validate that a tag value has an acceptable type
	 *
	 * @param {any} value Value to validate
	 * @throws {Error} If the value type is not string, number, or boolean
	 */
	_validateValue(value) {
		const type = typeof value;
		if (!["string", "number", "boolean"].includes(type)) {
			throw new Error(
				`Invalid Tag Value: Must be of type string, number or boolean but is ${type}`);
		}
	}
}

export default ResourceTagCollection;
