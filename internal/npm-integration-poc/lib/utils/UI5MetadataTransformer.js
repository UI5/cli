/**
 * UI5 Metadata Transformer
 *
 * Transforms web component metadata from custom-elements.json format
 * to UI5 control metadata format.
 */

import {createHash} from "crypto";

export class UI5MetadataTransformer {
	constructor(options = {}) {
		this.options = options;
	}

	/**
	 * Transform web component metadata to UI5 control metadata
	 *
	 * @param webComponentMetadata
	 * @param options
	 */
	transform(webComponentMetadata, options) {
		const {
			namespace,
			qualifiedNamespace,
			thirdpartyNamespace,
			scopeSuffix
		} = options;

		const scopedTag = this.generateScopedTag(webComponentMetadata.tagName, scopeSuffix);

		return {
			namespace: `${namespace}/${thirdpartyNamespace}/@ui5/webcomponents`,
			qualifiedNamespace: `${qualifiedNamespace}.${thirdpartyNamespace}.@ui5.webcomponents`,
			tag: scopedTag,
			interfaces: [],
			properties: this.transformProperties(webComponentMetadata.properties, namespace, thirdpartyNamespace),
			aggregations: this.transformSlots(webComponentMetadata.slots, namespace, thirdpartyNamespace),
			associations: {},
			events: this.transformEvents(webComponentMetadata.events),
			getters: [],
			methods: this.transformMethods(webComponentMetadata.methods),
			defaultAggregation: this.findDefaultAggregation(webComponentMetadata.slots)
		};
	}

	/**
	 * Generate scoped tag name to avoid conflicts
	 *
	 * @param baseTag
	 * @param scopeSuffix
	 */
	generateScopedTag(baseTag, scopeSuffix) {
		if (!scopeSuffix) {
			return baseTag;
		}

		// If scopeSuffix is "auto", generate hash
		if (scopeSuffix === "auto") {
			scopeSuffix = this.createShortHash({name: "app", version: "1.0.0"});
		}

		return `${baseTag}-${scopeSuffix}`;
	}

	/**
	 * Create short hash for scoping
	 *
	 * @param root0
	 * @param root0.name
	 * @param root0.version
	 */
	createShortHash({name, version}) {
		return createHash("shake256", {outputLength: 4})
			.update(`${name}@${version}`)
			.digest("hex");
	}

	/**
	 * Transform properties
	 *
	 * @param properties
	 * @param namespace
	 * @param thirdpartyNamespace
	 */
	transformProperties(properties, namespace, thirdpartyNamespace) {
		const ui5Properties = {};

		for (const prop of properties) {
			const propName = prop.name;
			let type = this.mapPropertyType(prop.type?.text || "string");
			let mapping = "property";

			// Special handling for certain properties
			if (propName === "text" || propName === "value") {
				mapping = "textContent";
			} else if (propName === "width" || propName === "height") {
				type = "sap.ui.core.CSSSize";
				mapping = "style";
			}

			ui5Properties[propName] = {
				type,
				mapping,
				defaultValue: prop.default !== undefined ? this.parseDefaultValue(prop.default) : undefined
			};
		}

		return ui5Properties;
	}

	/**
	 * Transform slots to aggregations
	 *
	 * @param slots
	 * @param namespace
	 * @param thirdpartyNamespace
	 */
	transformSlots(slots, namespace, thirdpartyNamespace) {
		const ui5Aggregations = {
			content: {
				type: "sap.ui.core.Control",
				multiple: true
			}
		};

		for (const slot of slots) {
			if (slot.name && slot.name !== "") {
				ui5Aggregations[slot.name] = {
					type: "sap.ui.core.Control",
					multiple: true,
					slot: slot.name
				};
			}
		}

		return ui5Aggregations;
	}

	/**
	 * Transform events
	 *
	 * @param events
	 */
	transformEvents(events) {
		const ui5Events = {};

		for (const event of events) {
			ui5Events[event.name] = {
				allowPreventDefault: false,
				enableEventBubbling: false,
				parameters: this.transformEventParameters(event.type?.references || [])
			};
		}

		return ui5Events;
	}

	/**
	 * Transform event parameters
	 *
	 * @param references
	 */
	transformEventParameters(references) {
		const parameters = {};
		// For now, return empty parameters
		// Could be extended to parse detail object structure
		return parameters;
	}

	/**
	 * Transform methods
	 *
	 * @param methods
	 */
	transformMethods(methods) {
		// For now, return empty array
		// Methods are typically not exposed in UI5 metadata
		return [];
	}

	/**
	 * Find default aggregation
	 *
	 * @param slots
	 */
	findDefaultAggregation(slots) {
		// Check if there's a default slot (empty name)
		const hasDefaultSlot = slots.some((slot) => !slot.name || slot.name === "");
		return hasDefaultSlot ? "content" : null;
	}

	/**
	 * Map web component type to UI5 type
	 *
	 * @param wcType
	 */
	mapPropertyType(wcType) {
		// Handle complex types
		if (wcType.includes("|")) {
			// Union types - take first non-null/undefined type
			const types = wcType.split("|").map((t) => t.trim());
			wcType = types.find((t) => t !== "null" && t !== "undefined") || "string";
		}

		// Remove quotes
		wcType = wcType.replace(/['"]/g, "");

		const typeMap = {
			"string": "string",
			"boolean": "boolean",
			"number": "int",
			"Integer": "int",
			"float": "float",
			"Float": "float",
			"object": "object",
			"Object": "object",
			"array": "object",
			"Array": "object"
		};

		return typeMap[wcType] || "string";
	}

	/**
	 * Parse default value
	 *
	 * @param defaultStr
	 */
	parseDefaultValue(defaultStr) {
		if (defaultStr === "true") return true;
		if (defaultStr === "false") return false;
		if (defaultStr === "null" || defaultStr === "undefined") return null;
		if (!isNaN(defaultStr)) return Number(defaultStr);
		// Remove quotes from strings
		return String(defaultStr).replace(/^["']|["']$/g, "");
	}
}
