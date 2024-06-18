
import {parse} from "espree";

const hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);

/*
 * NOTE: After updating the ecmaVersion:
 * - Adopt JSModuleAnalyzer to handle new Syntax / VisitorKeys.
 * - Adjust the JSModuleAnalyzer test "Check for consistency between VisitorKeys and EnrichedVisitorKeys"
 *   (See comments in test for details)
*/
export const ecmaVersion = 2023;

export function parseJS(code, userOptions = {}) {
	// allowed options and their defaults
	const options = {
		comment: false,
		ecmaVersion,
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
