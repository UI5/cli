import {fileURLToPath} from "node:url";
import {readFile} from "node:fs/promises";

/**
 * @module @ui5/project/validation/validator
 * @description A collection of validation related APIs
 * @public
 */

/**
 * @enum {string}
 * @private
 * @readonly
 */
export const SCHEMA_VARIANTS = {
	"ui5": "ui5.json",
	"ui5-workspace": "ui5-workspace.json"
};

class Validator {
	constructor({Ajv, ajvErrors, schemaName}) {
		if (!schemaName || !SCHEMA_VARIANTS[schemaName]) {
			throw new Error(
				`"schemaName" is missing or incorrect. The available schemaName variants are ${Object.keys(
					SCHEMA_VARIANTS
				).join(", ")}`
			);
		}

		this._schemaName = SCHEMA_VARIANTS[schemaName];

		this.ajv = new Ajv({
			allErrors: true,
			jsonPointers: true,
			loadSchema: Validator.loadSchema
		});
		ajvErrors(this.ajv);
	}

	_compileSchema() {
		const schemaName = this._schemaName;

		if (!this._compiling) {
			this._compiling = Promise.resolve().then(async () => {
				const schema = await Validator.loadSchema(schemaName);
				const validate = await this.ajv.compileAsync(schema);
				return validate;
			});
		}
		return this._compiling;
	}

	async validate({config, project, yaml}) {
		const fnValidate = await this._compileSchema();
		const valid = fnValidate(config);
		if (!valid) {
			// Read errors/schema from fnValidate before lazy loading ValidationError module.
			// Otherwise they might be cleared already.
			const {errors, schema} = fnValidate;
			const {default: ValidationError} = await import("./ValidationError.js");
			throw new ValidationError({
				errors,
				schema,
				project,
				yaml
			});
		}
	}

	static async loadSchema(schemaPath) {
		const filePath = schemaPath.replace("http://ui5.sap/schema/", "");
		const schemaFile = await readFile(
			fileURLToPath(new URL(`./schema/${filePath}`, import.meta.url)), {encoding: "utf8"}
		);
		return JSON.parse(schemaFile);
	}
}

const validator = Object.create(null);

async function _validate(schemaName, options) {
	if (!validator[schemaName]) {
		validator[schemaName] = (async () => {
			const {default: Ajv} = await import("ajv");
			const {default: ajvErrors} = await import("ajv-errors");
			return new Validator({Ajv, ajvErrors, schemaName});
		})();
	}

	const schemaValidator = await validator[schemaName];
	await schemaValidator.validate(options);
}

/**
 * Validates the given ui5 configuration.
 *
 * @public
 * @function
 * @static
 * @param {object} options
 * @param {object} options.config UI5 Configuration to validate
 * @param {object} options.project Project information
 * @param {string} options.project.id ID of the project
 * @param {object} [options.yaml] YAML information
 * @param {string} options.yaml.path Path of the YAML file
 * @param {string} options.yaml.source Content of the YAML file
 * @param {number} [options.yaml.documentIndex=0] Document index in case the YAML file contains multiple documents
 * @throws {@ui5/project/validation/ValidationError}
 *   Rejects with a {@link @ui5/project/validation/ValidationError ValidationError}
 *   when the validation fails.
 * @returns {Promise<undefined>} Returns a Promise that resolves when the validation succeeds
 */
export async function validate(options) {
	await _validate("ui5", options);
}

/**
 * Validates the given ui5-workspace configuration.
 *
 * @public
 * @function
 * @static
 * @param {object} options
 * @param {object} options.config ui5-workspace Configuration to validate
 * @param {object} [options.yaml] YAML information
 * @param {string} options.yaml.path Path of the YAML file
 * @param {string} options.yaml.source Content of the YAML file
 * @param {number} [options.yaml.documentIndex=0] Document index in case the YAML file contains multiple documents
 * @throws {@ui5/project/validation/ValidationError}
 *   Rejects with a {@link @ui5/project/validation/ValidationError ValidationError}
 *   when the validation fails.
 * @returns {Promise<undefined>} Returns a Promise that resolves when the validation succeeds
 */
export async function validateWorkspace(options) {
	await _validate("ui5-workspace", options);
}

export {
	/**
	 * For testing only!
	 *
	 * @private
	 */
	Validator as _Validator
};
