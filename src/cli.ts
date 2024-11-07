#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildExtension } from "./extensionsBuilder";

export interface Config {
	staticDirectory: string;
	extensions: {
		authentication?: {
			provider: "microsoft-entra-id";
			environmentVariables: {
				AUTH_MICROSOFT_ENTRA_CLIENT_ID: string;
				AUTH_MICROSOFT_ENTRA_ID_SECRET: string;
				AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: string;
				AUTH_SECRET: string;
			};
		};
	};
}
// Default Values
let config: Config = {
	staticDirectory: "build",
	extensions: {
		authentication: {
			provider: "microsoft-entra-id",
			environmentVariables: {
				AUTH_MICROSOFT_ENTRA_CLIENT_ID: "AUTH_MICROSOFT_ENTRA_CLIENT_ID",
				AUTH_MICROSOFT_ENTRA_ID_SECRET: "AUTH_MICROSOFT_ENTRA_ID_SECRET",
				AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: "AUTH_MICROSOFT_ENTRA_ID_TENANT_ID",
				AUTH_SECRET: "AUTH_SECRET",
			},
		},
	},
};

const CWD = process.cwd();

const EXTENSIONS_SRC_DIR = path.join(__dirname, "extensions");
const TMP_DIR = path.join(CWD, ".vercel-static-extensions");
const STATIC_ASSETS_SRC_DIR = path.join(CWD, config.staticDirectory);
// By convention, the Output Directory needs to be called ".vercel"
const VERCEL_OUT_ROOT_DIR = path.join(CWD, ".vercel");
const VERCEL_BUILD_OUTPUT_DIR = path.join(VERCEL_OUT_ROOT_DIR, "output");

let exitCode = 0;
const cleanupDirectories: string[] = [];

const cleanup = (directories: string[]) => {
	try {
		for (const dir of directories) {
			fs.rmSync(dir, { recursive: true });
		}
	} catch {
		console.error(
			`Unable to cleanup the build files. Please delete them manually: ${directories.join(", ")}`,
		);
	}
};

// First load the configuration file if there's one
// The naming convention is vercel-static-extensions.config.json
const configPath = path.join(CWD, "vercel-static-extensions.config.json");

try {
	if (fs.existsSync(configPath)) {
		config = JSON.parse(fs.readFileSync(configPath).toString());
		console.info("1. Loaded Configuration File");
	} else {
		console.info(
			`1. No Configuration File found (${configPath}). Using default values.`,
		);
	}
} catch (e) {
	console.info(
		`1. Can't load Configuration File (${configPath}). Using default values.`,
		e,
	);
}

// Only run the script, if the build directory exists
if (!fs.existsSync(STATIC_ASSETS_SRC_DIR)) {
	throw new Error(
		`No static files found in ${STATIC_ASSETS_SRC_DIR}. Please run this script after your static files have been created or update the staticDirectory.`,
	);
}

try {
	// Create a clean Vercel Build Output Directory
	if (fs.existsSync(VERCEL_BUILD_OUTPUT_DIR)) {
		fs.rmSync(VERCEL_BUILD_OUTPUT_DIR, { recursive: true });
	}
	fs.mkdirSync(VERCEL_BUILD_OUTPUT_DIR, { recursive: true });

	// Create a clean tmp directory
	if (fs.existsSync(TMP_DIR)) {
		fs.rmSync(TMP_DIR, { recursive: true });
	}
	fs.mkdirSync(TMP_DIR, { recursive: true });
	cleanupDirectories.push(TMP_DIR);

	// First move the static files to the output directory
	const staticFilesOutputDir = path.join(VERCEL_BUILD_OUTPUT_DIR, "static");
	fs.cpSync(STATIC_ASSETS_SRC_DIR, staticFilesOutputDir, {
		recursive: true,
		errorOnExist: true,
	});
} catch (e) {
	fs.rmSync(VERCEL_BUILD_OUTPUT_DIR, { recursive: true });
	console.error("Error while moving static files", e);
	exitCode = 1;
}

// Error Handling
if (exitCode !== 0) {
	cleanup(cleanupDirectories);
	process.exit(exitCode);
}

const enabledExtensions = Object.keys(config.extensions);
const extensionsDirectories: string[] = fs
	.readdirSync(EXTENSIONS_SRC_DIR)
	.filter((extension: string) => {
		return enabledExtensions.includes(extension);
	});

// Iterate through all enabled extensions
// First build the artifacts according to the config
// Some files need to be bundled, others not.
//
// Second create the Vercel Output Structure
//
// This is split, because some artifacts do not need to be deployed as a separate function.
// Instead, these are dependencies of other functions, and can be copied to the same directory.
// e.g. auth.config.js
const extensionsOutputs: ReturnType<typeof buildExtension>[] = [];
let indexExtension = 0;
for (const extension of extensionsDirectories) {
	indexExtension += 1;
	console.group(
		`2. Build extension ${indexExtension}/${extensionsDirectories.length}: ${extension}`,
	);

	let esbuildDefine: Record<string, string> = {};
	if (extension === "authentication" && config?.extensions?.authentication) {
		esbuildDefine = {
			"process.env.AUTH_MICROSOFT_ENTRA_CLIENT_ID": `process.env.${config.extensions.authentication.environmentVariables.AUTH_MICROSOFT_ENTRA_CLIENT_ID ?? "AUTH_MICROSOFT_ENTRA_CLIENT_ID"}`,
			"process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET": `process.env.${config.extensions.authentication.environmentVariables.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "AUTH_MICROSOFT_ENTRA_ID_SECRET"}`,
			"process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID": `process.env.${config.extensions.authentication.environmentVariables.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? "AUTH_MICROSOFT_ENTRA_ID_TENANT_ID"}`,
			"process.env.AUTH_SECRET": `process.env.${config.extensions.authentication.environmentVariables.AUTH_SECRET ?? "AUTH_SECRET"}`,
		};
	}

	const buildResult = buildExtension({
		extension,
		TMP_DIR,
		esbuildDefine,
	});
	extensionsOutputs.push(buildResult);
	if (!buildResult.isSuccessful) {
		console.error(`Error while building extension ${extension}.`);
		exitCode = 1;
		break;
	}
	console.groupEnd();
}

// Error Handling
if (exitCode !== 0) {
	cleanup([...cleanupDirectories, VERCEL_OUT_ROOT_DIR]);
	process.exit(exitCode);
}

// Now we move the created artifacts into the Vercel Output Directory
// .vercel/output/functions/<functionName>.func/<functionName>.js
console.info("3. Move Extension Artifacts into Vercel Output Directory");
for (const extensionOutput of extensionsOutputs) {
	try {
		fs.cpSync(
			extensionOutput.outputDirectory,
			path.join(VERCEL_BUILD_OUTPUT_DIR, "functions"),
			{
				errorOnExist: true,
				recursive: true,
			},
		);
	} catch (e) {
		console.error(
			`Error while moving extension ${extensionOutput} to Vercel Output Directory`,
			e,
		);
		exitCode = 1;
	}
}

// Error Handling
if (exitCode !== 0) {
	cleanup([...cleanupDirectories, VERCEL_OUT_ROOT_DIR]);
	process.exit(exitCode);
}

// Finally create the Vercel Output Config
// Write the Vercel Output Config
try {
	console.info(`4. Copy config.json into ${VERCEL_BUILD_OUTPUT_DIR}`);
	fs.cpSync(
		path.join(EXTENSIONS_SRC_DIR, "vercel-config.json"),
		path.join(VERCEL_BUILD_OUTPUT_DIR, "config.json"),
	);
} catch (e) {
	console.error("Error while copying config.json", e);
	exitCode = 1;
}

// Clean up
if (exitCode !== 0) {
	cleanup([...cleanupDirectories, VERCEL_OUT_ROOT_DIR]);
	process.exit(exitCode);
} else {
	cleanup(cleanupDirectories);
}
