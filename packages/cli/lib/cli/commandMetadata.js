/**
 * Applies declarative command metadata (from a JSON definition file) to a yargs instance.
 * Registers options, positionals, and examples.
 *
 * Coerce functions and any imperative CLI logic remain in the caller.
 *
 * @param {object} cli The yargs instance
 * @param {object} metadata The command metadata object (from a *.json file)
 * @returns {object} The yargs instance
 */
export function applyCommandMetadata(cli, metadata) {
	for (const opt of (metadata.options || [])) {
		cli.option(opt.key, Object.fromEntries(
			Object.entries(opt).filter(([k]) => k !== "key")
		));
	}
	for (const pos of (metadata.positionals || [])) {
		cli.positional(pos.key, Object.fromEntries(
			Object.entries(pos).filter(([k]) => k !== "key" && k !== "required")
		));
	}
	for (const [example, description] of (metadata.examples || [])) {
		cli.example(example, description);
	}
	return cli;
}
