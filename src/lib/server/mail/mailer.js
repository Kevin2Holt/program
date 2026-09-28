/*
	Pluggable mail transport. "log" (development default) prints the message;
	"smtp" sends it through nodemailer. Sending never throws to callers: a mail
	failure must not fail a booking. Returns true when the message was handed off.
*/
import nodemailer from "nodemailer";
import { config } from "../config.js";


let smtpTransport = null;


function getSmtpTransport() {

	smtpTransport ||= nodemailer.createTransport(config.mail.smtpUrl);
	return smtpTransport;
}

export async function sendMail({ to, subject, text, html = undefined, attachments = [] }) {

	try {
		if (config.mail.transport === "smtp" && config.mail.smtpUrl) {
			await getSmtpTransport().sendMail({ from: config.mail.from, to, subject, text, html, attachments });
		}
		else {
			console.log(`[mail] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
		}
		return true;
	}
	catch (err) {
		console.error("[mail] send failed", err);
		return false;
	}
}
