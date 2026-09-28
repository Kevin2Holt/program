/*
	Node module-resolution hooks mapping SvelteKit's $lib/$server aliases to
	files, so scripts (like the seed) can use the real services.
*/
import path from "node:path";
import { pathToFileURL } from "node:url";


const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const ALIASES = {
	"$lib/": path.join(PROJECT_ROOT, "src/lib/"),
	"$server/": path.join(PROJECT_ROOT, "src/lib/server/")
};


export async function resolve(specifier, context, nextResolve) {

	for (const [alias, target] of Object.entries(ALIASES)) {
		if (specifier.startsWith(alias)) {
			return nextResolve(pathToFileURL(path.join(target, specifier.slice(alias.length))).href, context);
		}
	}
	return nextResolve(specifier, context);
}
