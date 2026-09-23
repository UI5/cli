import {createRequire} from "node:module";
import chalk from "chalk";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {applyCommandMetadata} from "../commandMetadata.js";
import {getUi5DataDirOrDefault, resolveServerCertificatePaths, formatPath} from "../../dataDir.js";
import {exists} from "../../utils/fsHelper.js";

const require = createRequire(import.meta.url);
const metadata = require("./certificate.json");

const certificateCommand = {
	command: metadata.command,
	describe: metadata.describe,
	middlewares: [baseMiddleware],
};

certificateCommand.builder = function(cli) {
	const generateMeta = metadata.subcommands.find((s) => s.command === "generate");
	return cli
		.demandCommand(1, "Command required. Available command is 'generate'")
		.command("generate", generateMeta.describe, {
			handler: handleGenerate,
			builder: function(yargs) {
				applyCommandMetadata(yargs, generateMeta);
				return yargs;
			},
			middlewares: [baseMiddleware],
		});
};

async function handleGenerate(argv) {
	const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});
	const {keyPath, certPath} = resolveServerCertificatePaths(ui5DataDir, {
		keyPath: argv.key,
		certPath: argv.cert,
	});

	if (!argv.force) {
		let keyExists;
		let certExists;
		try {
			[keyExists, certExists] = await Promise.all([exists(keyPath), exists(certPath)]);
		} catch (err) {
			throw new Error(
				`Failed to check for an existing server certificate at ${formatPath(keyPath)} ` +
				`and ${formatPath(certPath)}: ${err.message}`, {cause: err});
		}
		// Only a complete pair counts as "already existing". A partial state (just the key or just the
		// certificate) is a broken pair that the user cannot otherwise repair without --force, so fall
		// through to regeneration, which overwrites any leftover file.
		if (keyExists && certExists) {
			process.stderr.write(
				`A server certificate already exists at the target location:\n` +
				`  Private key: ${chalk.bold(formatPath(keyPath))}\n` +
				`  Certificate: ${chalk.bold(formatPath(certPath))}\n\n` +
				`Use ${chalk.bold("--force")} to generate a new certificate and overwrite the existing one.\n`
			);
			return;
		}
	}

	// Inform the user before triggering the trust-store installation, which requires elevated
	// privileges and therefore prompts for the root password (or shows a confirmation dialog on Windows).
	if (process.platform === "win32") {
		process.stderr.write("Press 'Allow' in the opened dialog to confirm importing the newly created " +
			"SSL certificate into the operating system and browsers.\n");
	} else {
		process.stderr.write("Enter your root password to import the newly created " +
			"SSL certificate into the operating system and browsers.\n");
	}

	const {generateSslCertificate} = await import("@ui5/server/internal/sslUtil");
	await generateSslCertificate(keyPath, certPath);

	process.stderr.write(
		`\nServer certificate written:\n` +
		`  Private key: ${chalk.bold(formatPath(keyPath))}\n` +
		`  Certificate: ${chalk.bold(formatPath(certPath))}\n`
	);

	// devcert-sanscache leaves handles open that keep the event loop alive: it resumes stdin to wait
	// for the user to confirm the browser import without pausing it again, and its Firefox flow starts
	// an HTTP server that is never closed. The latter runs unconditionally on Windows, so the process
	// would otherwise hang here on every run. All work is done at this point, so exit explicitly.
	process.exit(0);
}

export default certificateCommand;
