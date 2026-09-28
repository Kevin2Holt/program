import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";


export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		strictPort: false
	},
	test: {
		include: ["tests/unit/**/*.test.js", "tests/services/**/*.test.js"],
		setupFiles: ["tests/setup/useTestDatabase.js"],
		globalSetup: ["tests/setup/prepareTestDatabase.js"],
		// Service tests share one real test database, so files run one at a time.
		fileParallelism: false,
		testTimeout: 15000,
		hookTimeout: 30000
	}
});
