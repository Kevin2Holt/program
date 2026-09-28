/*
	Server configuration, read once from the environment (.env in development).
	Nothing else reads process.env directly.
*/
import dotenv from "dotenv";


const DEFAULT_PUBLIC_BASE_URL = "https://progr.am";
const DEFAULT_MAIL_FROM = "progr.am <no-reply@progr.am>";
const MAIL_TRANSPORTS = ["log", "smtp"];

dotenv.config({ quiet: true });


function readTrimmedEnv(name, fallback) {

	const value = process.env[name];
	return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function stripTrailingSlashes(url) {

	return url.replace(/\/+$/, "");
}


const mailTransport = readTrimmedEnv("MAIL_TRANSPORT", "log");

export const config = {
	databaseUrl: readTrimmedEnv("DATABASE_URL", ""),
	publicBaseUrl: stripTrailingSlashes(readTrimmedEnv("PUBLIC_BASE_URL", DEFAULT_PUBLIC_BASE_URL)),
	isProduction: process.env.NODE_ENV === "production",
	mail: {
		transport: MAIL_TRANSPORTS.includes(mailTransport) ? mailTransport : "log",
		from: readTrimmedEnv("MAIL_FROM", DEFAULT_MAIL_FROM),
		smtpUrl: readTrimmedEnv("SMTP_URL", "")
	}
};
