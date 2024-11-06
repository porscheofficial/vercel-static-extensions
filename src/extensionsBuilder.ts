import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";

export interface ExtensionConfig {
	assets: {
		id: string;
		input: string;
		output: string;
		esbuild: Record<string, string | boolean>;
	}[];
	vercelDeployment: {
		functions: {
			id: string;
			dependenciesById: string[];
			vcConfig: Record<string, string>;
		}[];
	};
}

export const buildExtension = ({
	extension,
	TMP_DIR,
	esbuildDefine,
}: {
	extension: string;
	TMP_DIR: string;
	esbuildDefine?: Record<string, string>;
}): {
	cleanupDirectories: string[];
	outputDirectory: string;
	isSuccessful: boolean;
} => {
	const cleanupDirs: string[] = [];

	const extensionBasePath = path.join(__dirname, "extensions", extension);
	const extensionSrcPath = path.join(extensionBasePath, "src");
	const extensionBuildPath = path.join(TMP_DIR, extension, "build");
	const extensionOutputPath = path.join(TMP_DIR, extension, "output");

	// Create a clean extension build directory
	if (fs.existsSync(extensionBuildPath)) {
		fs.rmSync(extensionBuildPath, { recursive: true });
	}
	fs.mkdirSync(extensionBuildPath, { recursive: true });
	cleanupDirs.push(extensionBuildPath);

	// Create a clean extension output directory
	if (fs.existsSync(extensionOutputPath)) {
		fs.rmSync(extensionOutputPath, { recursive: true });
	}
	fs.mkdirSync(extensionOutputPath, { recursive: true });
	cleanupDirs.push(extensionOutputPath);

	try {
		// Read the deployment instructions of the extension
		const extensionDeploymentInstructions = require(
			path.join(extensionBasePath, "config.json"),
		) as ExtensionConfig;

		// Build all the files and return a map with the artifacts
		// [id, outputDirectory]
		console.group("1. Build artifacts");
		const buildFiles = extensionDeploymentInstructions.assets.map((asset) => {
			const absoluteInputFile = path.join(extensionSrcPath, asset.input);
			// We want to have the directory to support multiple output files, like sourcemaps
			const absoluteOutputDirectory = path.join(
				extensionBuildPath,
				path.dirname(asset.output),
				`${path.basename(asset.output, ".js")}.func`,
			);

			console.info(
				`Transpile ${absoluteInputFile} to ${absoluteOutputDirectory}`,
			);

			esbuild.buildSync({
				entryPoints: [absoluteInputFile],
				// These are the default options
				bundle: false,
				minify: true,
				format: "cjs",
				target: ["es2022"],
				platform: "browser", // Use 'browser' for Edge Functions
				sourcemap: true,
				treeShaking: true,
				...asset.esbuild,
				// These are the mandatory options
				outdir: absoluteOutputDirectory,
				define: {
					"process.env.NODE_ENV": '"production"',
					__dirname: '""', // Replace Node.js-specific globals with browser-specific ones
					...esbuildDefine,
				},
				external: asset.esbuild?.bundle
					? ["__STATIC_CONTENT_MANIFEST"]
					: undefined, // Exclude Vercel-specific globals
			});

			return [asset.id, absoluteOutputDirectory];
		});
		console.groupEnd();

		// Now create the Vercel Output Structure
		// .vercel/output/functions/<functionName>.func/<functionName>.js
		console.group("2. Create Vercel Output Structure");
		for (const vercelOutputItem of extensionDeploymentInstructions
			.vercelDeployment.functions) {
			// First we need to get the config of the asset
			const assetConfig = extensionDeploymentInstructions.assets.find(
				(asset) => asset.id === vercelOutputItem.id,
			);

			if (!assetConfig) {
				console.error(
					`No assetConfig with id ${vercelOutputItem.id} found. Please check config.json of extension ${extension}.`,
				);
				throw new Error();
			}

			console.group(`Create function ${vercelOutputItem.id}`);
			// First create the target directory
			const functionOutputDir = path.join(
				extensionOutputPath,
				path.dirname(assetConfig.output),
				`${path.basename(assetConfig.output, ".js")}.func`,
			);
			console.info(`Create directory: ${functionOutputDir}`);
			if (!fs.existsSync(functionOutputDir)) {
				fs.mkdirSync(functionOutputDir, { recursive: true });
			}

			// Now copy the build files
			const buildArtifacts = buildFiles.find(
				(buildFile) => buildFile[0] === vercelOutputItem.id,
			);
			if (!buildArtifacts) {
				console.error(
					`No buildArtifacts with id ${vercelOutputItem.id} found. Please check config.json of extension ${extension}.`,
				);
				throw new Error();
			}
			const buildArtifactsDirectory = buildArtifacts[1];

			const targetPath = path.join(
				functionOutputDir,
				path.dirname(assetConfig.output),
			);
			console.info(`Copy artifacts ${assetConfig.output} into ${targetPath}`);
			fs.cpSync(buildArtifactsDirectory, targetPath, {
				recursive: true,
				errorOnExist: true,
			});

			// Now copy the dependencies
			for (const dependencyId of vercelOutputItem.dependenciesById) {
				// First we need to get the config of the asset
				const assetConfig = extensionDeploymentInstructions.assets.find(
					(asset) => asset.id === dependencyId,
				);
				if (!assetConfig) {
					console.error(
						`No assetConfig with id ${dependencyId} found. Please check config.json of extension ${extension}.`,
					);
					throw new Error();
				}
				const buildArtifacts = buildFiles.find(
					(buildFile) => buildFile[0] === dependencyId,
				);
				if (!buildArtifacts) {
					console.error(
						`No buildArtifacts with id ${dependencyId} found. Please check config.json of extension ${extension}.`,
					);
					throw new Error();
				}
				const buildArtifactsDirectory = buildArtifacts[1];
				const targetPath = path.join(
					functionOutputDir,
					path.dirname(assetConfig.output),
				);
				console.info(
					`Copy dependency ${dependencyId} into function directory ${targetPath}`,
				);
				fs.cpSync(buildArtifactsDirectory, targetPath, {
					recursive: true,
					errorOnExist: true,
				});
			}

			// Now create the config file
			console.info("Create .vc-config.json");
			const vcConfig = vercelOutputItem.vcConfig;
			const configFilePath = path.join(functionOutputDir, ".vc-config.json");
			fs.writeFileSync(configFilePath, JSON.stringify(vcConfig, null, 2));

			console.groupEnd();
		}
		console.groupEnd();
	} catch (e) {
		console.error(
			"Something went wrong while building the extension. Cleaning up the directories now.",
			e,
		);
		cleanupDirs.forEach((dir) => {
			fs.rmSync(dir, { recursive: true });
		});
		return {
			cleanupDirectories: cleanupDirs,
			outputDirectory: extensionOutputPath,
			isSuccessful: false,
		};
	}
	console.info(`3. Remove Build Files of Extension.`);
	// Finally clean up the extension build directory
	fs.rmSync(extensionBuildPath, { recursive: true });
	return {
		cleanupDirectories: cleanupDirs,
		outputDirectory: extensionOutputPath,
		isSuccessful: true,
	};
};
