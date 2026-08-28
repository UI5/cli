import chalk from "chalk";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {getUi5DataDirOrDefault, getServerCertificatePaths, formatPath} from "../../dataDir.js";
import {exists} from "../../utils/fsHelper.js";

const certificateCommand = {
	command: "certificate",
	describe: "Manage the UI5 CLI server certificate",
	middlewares: [baseMiddleware],
};

certificateCommand.builder = function(cli) {
	return cli
		.demandCommand(1, "Command required. Available command is 'generate'")
		.command("generate", "Generate a self-signed server certificate and install it into the trust store", {
			handler: handleGenerate,
			builder: function(yargs) {
				return yargs
					.option("key", {
						describe: "Path the private key is written to",
						defaultDescription: "<UI5 data dir>/server/server.key",
						type: "string"
					})
					.option("cert", {
						describe: "Path the certificate is written to",
						defaultDescription: "<UI5 data dir>/server/server.crt",
						type: "string"
					})
					.option("force", {
						alias: "f",
						describe: "Generate a new certificate even if one already exists at the target path",
						default: false,
						type: "boolean"
					})
					.example("$0 certificate generate",
						"Generate a server certificate in the default UI5 data directory")
					.example("$0 certificate generate --force",
						"Regenerate the server certificate, overwriting an existing one")
					.example("UI5_DATA_DIR=/custom/path $0 certificate generate",
						"Generate a server certificate in a non-default UI5 data directory");
			},
			middlewares: [baseMiddleware],
		});
};

async function handleGenerate(argv) {
	const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});
	const defaults = getServerCertificatePaths(ui5DataDir);
	const keyPath = argv.key ?? defaults.keyPath;
	const certPath = argv.cert ?? defaults.certPath;

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
		process.stderr.write("Please press allow in the opened dialog to confirm importing the newly created " +
			"SSL certificate into the operating system and browsers.\n");
	} else {
		process.stderr.write("Please enter your root password to allow importing the newly created " +
			"SSL certificate into the operating system and browsers.\n");
	}

	const {generateSslCertificate} = await import("@ui5/server/internal/sslUtil");
	await generateSslCertificate(keyPath, certPath);

	process.stderr.write(
		`\nServer certificate written:\n` +
		`  Private key: ${chalk.bold(formatPath(keyPath))}\n` +
		`  Certificate: ${chalk.bold(formatPath(certPath))}\n`
	);
}

export default certificateCommand;
