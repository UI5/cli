import {spawnProcess} from "./process.js";

// Execute a git command and return stdout
async function runGitCommand(args, cwd, commandName = args[0], spawnFn = spawnProcess) {
	return spawnFn("git", args, {
		cwd,
		errorMessage: `git ${commandName} failed`
	});
}

// Check if the git repository is dirty (has uncommitted changes)
async function checkGitStatus(cwd, spawnFn = spawnProcess) {
	return runGitCommand(["status", "--porcelain"], cwd, "status", spawnFn);
}

// Get the merge base revision between target and comparison branches
async function getMergeBaseRevision(targetBranch, comparisonBranch, cwd, spawnFn = spawnProcess) {
	return runGitCommand(["merge-base", targetBranch, comparisonBranch], cwd, "merge-base", spawnFn);
}

// Get the revision hash for a branch
async function getBranchRevision(branch, cwd, spawnFn = spawnProcess) {
	return runGitCommand(["rev-parse", branch], cwd, "rev-parse", spawnFn);
}

// Get the git revision of a directory (if it's a git repository)
async function getProjectRevision(cwd, spawnFn = spawnProcess) {
	try {
		return await runGitCommand(["rev-parse", "HEAD"], cwd, "rev-parse", spawnFn);
	} catch {
		return null; // Not a git repository or error
	}
}

// Checkout a specific git revision / branch
async function checkout(revision, cwd, spawnFn = spawnProcess) {
	await runGitCommand(["checkout", revision], cwd, "checkout", spawnFn);
}

export default {
	checkGitStatus,
	getMergeBaseRevision,
	getBranchRevision,
	getProjectRevision,
	checkout
};
