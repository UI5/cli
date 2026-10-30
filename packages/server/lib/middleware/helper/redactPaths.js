import os from "node:os";
import {sep} from "node:path";

/**
 * Replaces home-directory prefixes in error text with <code>~</code>, so HTTP error
 * responses do not expose the OS username. Paths outside a home directory stay intact.
 * Never throws: when the home lookup fails, it returns a safe placeholder instead.
 *
 * @param {string} text Error message or stack
 * @returns {string} Redacted text, or a safe placeholder if redaction fails
 */
export default function redactPaths(text) {
	try {
		const home = os.homedir();
		let redacted = text;
		if (home) {
			redacted = redacted.replaceAll(home + sep, "~" + sep);
		}
		redacted = redacted
			.replace(/\/(?:Users|home)\/[^/\r\n]+\/|\/root\//g, "~/")
			.replace(/[A-Za-z]:\\Users\\[^\\\r\n]+\\/gi, "~\\");
		// Replace the bare home last. The prefix passes above already reduced every
		// "<home>/<rest>" form, so this only matches the home path on its own and cannot
		// truncate a longer username that shares the home's prefix.
		return home ? redacted.replaceAll(home, "~") : redacted;
	} catch {
		return "Error details unavailable";
	}
}
