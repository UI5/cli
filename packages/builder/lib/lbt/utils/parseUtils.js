
import {parse} from "espree";

const hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);

export function parseJS(code, userOptions = {}) {
	// allowed options and their defaults
	const options = {
		comment: false,
		ecmaVersion: 2021, // NOTE: Adopt JSModuleAnalyzer.js to allow new Syntax when upgrading to newer ECMA versions
		range: false,
		sourceType: "script",
	};

	// validate and assign options
	for (const [name, value] of Object.entries(userOptions)) {
		if (!hasOwn(options, name)) {
			throw new TypeError(`Allowed parser options are ${Object.keys(options)}, but not '${name}'`);
		}
		options[name] = value;
	}

	return parse(code, options);
}

export {Syntax, VisitorKeys} from "espree";
