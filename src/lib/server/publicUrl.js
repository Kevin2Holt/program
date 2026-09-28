/* Public links are built from configuration, never hard-coded, so a temporary domain works. */
import { config } from "./config.js";


export function buildPublicUrl(path) {

	return `${config.publicBaseUrl}${path.startsWith("/") ? path : "/" + path}`;
}

// "progr.am/elm-ward" style label for display.
export function buildPublicLinkLabel(code) {

	return `${config.publicBaseUrl.replace(/^https?:\/\//, "")}/${code}`;
}
