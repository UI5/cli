/**
 * Pure formatting helpers that reproduce yargs' help-detail rendering
 * (type/required/choices/default columns and the switch column) from
 * command metadata, without invoking yargs' own renderer.
 *
 * The logic mirrors yargs 18.x `lib/usage.js` so the generated documentation
 * matches what users see on the command line.
 */

const Y18N_PREFIX = "__yargsString__:";

/**
 * Reproduces yargs' `stringifiedValues`: JSON.stringify each choice, joined by ", ".
 *
 * @param {any[]} values The choices
 * @returns {string} The stringified, comma-separated choices
 */
export function stringifiedValues(values) {
	return [].concat(values).map((value) => JSON.stringify(value)).join(", ");
}

/**
 * Reproduces yargs' `defaultString`: renders the "[default: X]" tag or null.
 *
 * @param {any} value The default value
 * @param {string} [defaultDescription] An explicit default description
 * @returns {string|null} The "[default: ...]" tag, or null when there is no default
 */
export function defaultString(value, defaultDescription) {
	if (value === undefined && !defaultDescription) {
		return null;
	}
	let inner;
	if (defaultDescription) {
		inner = defaultDescription;
	} else if (typeof value === "string") {
		inner = `"${value}"`;
	} else if (typeof value === "object") {
		inner = JSON.stringify(value);
	} else {
		inner = String(value);
	}
	return `[default: ${inner}]`;
}

/**
 * Determines the "[type]" tag for an option key based on the yargs options object.
 *
 * @param {string} key The option key
 * @param {object} opts The yargs options object (from getOptions())
 * @returns {string|null} The type tag, or null
 */
function optionTypeTag(key, opts) {
	let type = null;
	if ((opts.boolean || []).includes(key)) {
		type = "[boolean]";
	}
	if ((opts.count || []).includes(key)) {
		type = "[count]";
	}
	if ((opts.string || []).includes(key)) {
		type = "[string]";
	}
	if ((opts.normalize || []).includes(key)) {
		type = "[string]";
	}
	if ((opts.array || []).includes(key)) {
		type = "[array]";
	}
	if ((opts.number || []).includes(key)) {
		type = "[number]";
	}
	return type;
}

/**
 * Builds the "Details" column for an option, in yargs' order:
 * [deprecated] [type] [required] [choices: ...] [default: ...]
 *
 * @param {string} key The option key
 * @param {object} opts The yargs options object (from getOptions())
 * @param {object} demandedOptions Map of demanded (required) option keys
 * @returns {string} The joined details string (may be empty)
 */
export function optionDetails(key, opts, demandedOptions) {
	const deprecated = opts.deprecatedOptions || {};
	const parts = [
		key in deprecated ?
			(typeof deprecated[key] === "string" ? `[deprecated: ${deprecated[key]}]` : "[deprecated]") :
			null,
		optionTypeTag(key, opts),
		key in demandedOptions ? "[required]" : null,
		opts.choices && opts.choices[key] ? `[choices: ${stringifiedValues(opts.choices[key])}]` : null,
		defaultString((opts.default || {})[key], (opts.defaultDescription || {})[key]),
	];
	return parts.filter(Boolean).join(" ");
}

/**
 * Builds the "Details" column for a positional argument. Type and default are
 * derived from the command-string metadata since yargs only populates these at
 * parse time: variadic positionals ("name..") become arrays defaulting to [].
 *
 * @param {object} params The positional metadata
 * @param {boolean} params.variadic Whether the positional is variadic ("..")
 * @param {boolean} params.required Whether the positional is required ("<>")
 * @param {string} params.name The positional name
 * @param {object} params.opts The yargs options object of the command instance
 * @returns {string} The joined details string (may be empty)
 */
export function positionalDetails({variadic, required, name, opts}) {
	let type = null;
	if (variadic) {
		type = "[array]";
	} else if ((opts.string || []).includes(name)) {
		type = "[string]";
	} else if ((opts.number || []).includes(name)) {
		type = "[number]";
	} else if ((opts.boolean || []).includes(name)) {
		type = "[boolean]";
	}

	const explicitDefault = (opts.default || {})[name];
	let def;
	if (variadic && explicitDefault === undefined) {
		def = "[default: []]";
	} else {
		def = defaultString(explicitDefault, (opts.defaultDescription || {})[name]);
	}

	const parts = [
		type,
		required ? "[required]" : null,
		opts.choices && opts.choices[name] ? `[choices: ${stringifiedValues(opts.choices[name])}]` : null,
		def,
	];
	return parts.filter(Boolean).join(" ");
}

/**
 * Reproduces yargs' switch column for an option: prefixes each of the option's
 * key and aliases ("-x" for single-char, "--xx" otherwise) and sorts short
 * switches before long ones (stable), joined by ", ".
 *
 * @param {string} key The option key
 * @param {object} opts The yargs options object (from getOptions())
 * @returns {string} The switch column (e.g. "-D, --development, --dev")
 */
export function switchColumn(key, opts) {
	const isBoolean = (opts.boolean || []).includes(key);
	const switches = [key].concat((opts.alias || {})[key] || []).map((sw) => {
		const prefix = /^[0-9]$/.test(sw) ?
			(isBoolean ? "-" : "--") :
			sw.length > 1 ? "--" : "-";
		return prefix + sw;
	});
	// Array.prototype.sort is stable: keep declaration order within short/long groups
	switches.sort((sw1, sw2) => {
		const long1 = /^--/.test(sw1);
		const long2 = /^--/.test(sw2);
		return long1 === long2 ? 0 : long1 ? 1 : -1;
	});
	return switches.join(", ");
}

/**
 * Strips the yargs i18n-deferral prefix from a description.
 *
 * @param {string} desc The raw description
 * @returns {string} The description without the deferral prefix
 */
export function plainDescription(desc) {
	if (!desc) {
		return "";
	}
	return desc.startsWith(Y18N_PREFIX) ? desc.substring(Y18N_PREFIX.length) : desc;
}

/**
 * Prepares a description for use inside a Markdown table cell: strips the
 * deferral prefix and replaces newlines with "<br>" so table rows stay intact.
 *
 * @param {string} desc The raw description
 * @returns {string} The table-cell-safe description
 */
export function tableCellDescription(desc) {
	return plainDescription(desc).replace(/\r?\n/g, "<br>");
}
