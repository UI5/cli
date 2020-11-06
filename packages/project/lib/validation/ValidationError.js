const chalk = require("chalk");
const escapeStringRegExp = require("escape-string-regexp");

/**
 * Error class for validation of project configuration.
 *
 * @public
 * @hideconstructor
 * @augments Error
 * @memberof module:@ui5/project.validation
 */
class ValidationError extends Error {
	constructor({errors, project, yaml}) {
		super();

		/**
		 * ValidationError
		 *
		 * @constant
		 * @default
		 * @type {string}
		 * @readonly
		 * @public
		 */
		this.name = "ValidationError";

		this.project = project;
		this.yaml = yaml;

		this.errors = ValidationError.filterErrors(errors);

		/**
		 * Formatted error message
		 *
		 * @type {string}
		 * @readonly
		 * @public
		 */
		this.message = this.formatErrors();

		Error.captureStackTrace(this, this.constructor);
	}

	formatErrors() {
		let separator = "\n\n";
		if (process.stdout.isTTY) {
			// Add a horizontal separator line between errors in case a terminal is used
			separator += chalk.grey.dim("\u2500".repeat(process.stdout.columns || 80));
		}
		separator += "\n\n";
		let message = chalk.red(`Invalid ui5.yaml configuration for project ${this.project.id}`) + "\n\n";
		message += this.errors.map((error) => {
			return this.formatError(error);
		}).join(separator);
		return message;
	}

	formatError(error) {
		let errorMessage = ValidationError.formatMessage(error);
		if (this.yaml && this.yaml.path && this.yaml.source) {
			const yamlExtract = ValidationError.getYamlExtract({error, yaml: this.yaml});
			const errorLines = errorMessage.split("\n");
			errorLines.splice(1, 0, "\n" + yamlExtract);
			errorMessage = errorLines.join("\n");
		}
		return errorMessage;
	}

	static formatMessage(error) {
		if (error.keyword === "errorMessage") {
			return error.message;
		}

		let message = "Configuration ";
		if (error.dataPath) {
			message += chalk.underline(chalk.red(error.dataPath.substr(1))) + " ";
		}

		switch (error.keyword) {
		case "additionalProperties":
			message += `property ${error.params.additionalProperty} must not be provided here`;
			break;
		case "type":
			message += `must be of type '${error.params.type}'`;
			break;
		case "required":
			message += `must have required property '${error.params.missingProperty}'`;
			break;
		case "enum":
			message += "must be equal to one of the allowed values\n";
			message += "Allowed values: " + error.params.allowedValues.join(", ");
			break;
		default:
			message += error.message;
		}

		return message;
	}

	static _findDuplicateError(error, errorIndex, errors) {
		const foundIndex = errors.findIndex(($) => {
			if ($.dataPath !== error.dataPath) {
				return false;
			} else if ($.keyword !== error.keyword) {
				return false;
			} else if (JSON.stringify($.params) !== JSON.stringify(error.params)) {
				return false;
			} else {
				return true;
			}
		});
		return foundIndex !== errorIndex;
	}

	static filterErrors(allErrors) {
		return allErrors.filter((error, i, errors) => {
			if (error.keyword === "if" || error.keyword === "oneOf") {
				return false;
			}

			return !ValidationError._findDuplicateError(error, i, errors);
		});
	}

	static analyzeYamlError({error, yaml}) {
		if (error.dataPath === "" && error.keyword === "required") {
			// There is no line/column for a missing required property on root level
			return {line: -1, column: -1};
		}

		// Skip leading /
		const objectPath = error.dataPath.substr(1).split("/");

		if (error.keyword === "additionalProperties") {
			objectPath.push(error.params.additionalProperty);
		}

		let currentSubstring;
		let currentIndex;
		if (yaml.documentIndex) {
			const matchDocumentSeparator = /^---/gm;
			let currentDocumentIndex = 0;
			let document;
			while ((document = matchDocumentSeparator.exec(yaml.source)) !== null) {
				// If the first separator is not at the beginning of the file
				// we are already at document index 1
				// Using String#trim() to remove any whitespace characters
				if (currentDocumentIndex === 0 && yaml.source.substring(0, document.index).trim().length > 0) {
					currentDocumentIndex = 1;
				}

				if (currentDocumentIndex === yaml.documentIndex) {
					currentIndex = document.index;
					currentSubstring = yaml.source.substring(currentIndex);
					break;
				}

				currentDocumentIndex++;
			}
			// Document could not be found
			if (!currentSubstring) {
				return {line: -1, column: -1};
			}
		} else {
			// In case of index 0 or no index, use whole source
			currentIndex = 0;
			currentSubstring = yaml.source;
		}

		const matchArrayElementIndentation = /([ ]*)-/;

		for (let i = 0; i < objectPath.length; i++) {
			const property = objectPath[i];
			let newIndex;

			if (isNaN(property)) {
				// Try to find a property

				// Creating a regular expression that matches the property name a line
				// except for comments, indicated by a hash sign "#".
				const propertyRegExp = new RegExp(`^[^#]*?${escapeStringRegExp(property)}`, "m");

				const propertyMatch = propertyRegExp.exec(currentSubstring);
				if (!propertyMatch) {
					return {line: -1, column: -1};
				}
				newIndex = propertyMatch.index + propertyMatch[0].length;
			} else {
				// Try to find the right index within an array definition.
				// This currently only works for arrays defined with "-" in multiple lines.
				// Arrays using square brackets are not supported.

				const matchArrayElement = /(^|\r?\n)([ ]*-[^\r\n]*)/g;
				const arrayIndex = parseInt(property);
				let a = 0;
				let firstIndentation = -1;
				let match;
				while ((match = matchArrayElement.exec(currentSubstring)) !== null) {
					const indentationMatch = match[2].match(matchArrayElementIndentation);
					if (!indentationMatch) {
						return {line: -1, column: -1};
					}
					const currentIndentation = indentationMatch[1].length;
					if (firstIndentation === -1) {
						firstIndentation = currentIndentation;
					} else if (currentIndentation !== firstIndentation) {
						continue;
					}
					if (a === arrayIndex) {
						// match[1] might be a line-break
						newIndex = match.index + match[1].length + currentIndentation;
						break;
					}
					a++;
				}
				if (!newIndex) {
					// Could not find array element
					return {line: -1, column: -1};
				}
			}
			currentIndex += newIndex;
			currentSubstring = yaml.source.substring(currentIndex);
		}

		const linesUntilMatch = yaml.source.substring(0, currentIndex).split(/\r?\n/);
		const line = linesUntilMatch.length;
		let column = linesUntilMatch[line - 1].length + 1;
		const lastPathSegment = objectPath[objectPath.length - 1];
		if (isNaN(lastPathSegment)) {
			column -= lastPathSegment.length;
		}

		return {
			line,
			column
		};
	}

	static getSourceExtract(yamlSource, line, column) {
		let source = "";
		const lines = yamlSource.split(/\r?\n/);

		// Using line numbers instead of array indices
		const startLine = Math.max(line - 2, 1);
		const endLine = Math.min(line, lines.length);
		const padLength = String(endLine).length;

		for (let currentLine = startLine; currentLine <= endLine; currentLine++) {
			const currentLineContent = lines[currentLine - 1];
			let string = chalk.gray(
				String(currentLine).padStart(padLength, " ") + ":"
			) + " " + currentLineContent + "\n";
			if (currentLine === line) {
				string = chalk.bgRed(string);
			}
			source += string;
		}

		source += " ".repeat(column + padLength + 1) + chalk.red("^");

		return source;
	}

	static getYamlExtract({error, yaml}) {
		const {line, column} = ValidationError.analyzeYamlError({error, yaml});
		if (line !== -1 && column !== -1) {
			return chalk.grey(yaml.path + ":" + line) +
				"\n\n" + ValidationError.getSourceExtract(yaml.source, line, column);
		} else {
			return chalk.grey(yaml.path) + "\n";
		}
	}
}

module.exports = ValidationError;
