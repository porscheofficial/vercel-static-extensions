import fs, { rmSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const CWD = process.cwd();

const pkgPath = path.join(CWD, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const externals = Object.keys(pkg.dependencies || {});

const DIST_DIR = path.join(CWD, "dist");

try {
	// 1. Reset the dist directory
	fs.rmSync(DIST_DIR, { recursive: true, force: true });

	// 2. Build the cli
	await build({
		entryPoints: [path.join(CWD, "src/cli.ts")],
		format: "cjs",
		platform: "node",
		outdir: DIST_DIR,
		target: "es2016",
		bundle: true,
		external: externals,
	});
	// 3. Copy the extension files
	fs.cpSync(
		path.join(CWD, "src", "extensions"),
		path.join(DIST_DIR, "extensions"),
		{ recursive: true },
	);
} catch (e) {
	console.error("Failed to build the project", e);
	rmSync(DIST_DIR, { recursive: true, force: true });
}
