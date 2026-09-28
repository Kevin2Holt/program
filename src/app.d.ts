// Types for SvelteKit's request-scoped objects. This declaration file is the one
// place TypeScript syntax is used (the framework requires it); all code is JS.
declare global {
	namespace App {
		interface Locals {
			user: { id: number; email: string; displayName: string } | null;
			sessionToken: string | null;
			csrfToken: string;
			theme: "dark" | "light";
		}
		interface PageState {
			signupStep?: "details";
		}
		interface Error {
			message: string;
			reference?: string;
		}
	}
}

export {};
