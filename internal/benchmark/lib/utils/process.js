import {spawn} from "node:child_process";

// Generic function to spawn a process
export async function spawnProcess(command, args, options = {}) {
	const {
		cwd,
		stdio = "pipe",
		env = process.env,
		captureOutput = true,
		errorMessage = `${command} failed`
	} = options;

	return new Promise((resolve, reject) => {
		const childProcess = spawn(command, args, {
			stdio,
			cwd,
			env
		});

		let stdout = "";
		let stderr = "";

		if (captureOutput && childProcess.stdout) {
			childProcess.stdout.on("data", (data) => {
				stdout += data.toString();
			});
		}

		if (captureOutput && childProcess.stderr) {
			childProcess.stderr.on("data", (data) => {
				stderr += data.toString();
			});
		}

		childProcess.on("close", (code) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				reject(new Error(captureOutput ? `${errorMessage}: ${stderr}` : `${errorMessage} (exit code ${code})`));
			}
		});

		childProcess.on("error", (error) => {
			reject(new Error(`Failed to execute ${command}: ${error.message}`));
		});
	});
}
