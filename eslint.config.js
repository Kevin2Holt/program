/*
	Lint and formatting rules. Formatting follows Kevin's style (see CLAUDE.md):
	tabs, Stroustrup braces (else/catch on their own line), double quotes,
	semicolons, up to 4 blank lines between sections, and exactly one blank
	line after a function declaration line (local rule). No Prettier: it would
	remove that blank line.
*/
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import blankLineAfterFunctionDeclaration from "./eslint-rules/blank-line-after-function-declaration.js";


const MAX_BLANK_LINES = 4;

const localPlugin = {
	rules: { "blank-line-after-function-declaration": blankLineAfterFunctionDeclaration }
};

const styleRules = {
	"@stylistic/indent": ["error", "tab", { SwitchCase: 1 }],
	"@stylistic/brace-style": ["error", "stroustrup", { allowSingleLine: true }],
	"@stylistic/quotes": ["error", "double", { avoidEscape: true }],
	"@stylistic/semi": ["error", "always"],
	"@stylistic/comma-dangle": ["error", "never"],
	"@stylistic/no-trailing-spaces": "error",
	"@stylistic/eol-last": ["error", "always"],
	"@stylistic/no-multiple-empty-lines": ["error", { max: MAX_BLANK_LINES, maxBOF: 0, maxEOF: 0 }],
	"@stylistic/keyword-spacing": "error",
	"@stylistic/space-before-blocks": "error",
	"@stylistic/object-curly-spacing": ["error", "always"],
	"@stylistic/arrow-parens": ["error", "always"],
	"local/blank-line-after-function-declaration": "error"
};

const qualityRules = {
	"no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
	"prefer-const": "error",
	"no-var": "error",
	eqeqeq: ["error", "always"],
	curly: ["error", "all"]
};


export default [
	{
		ignores: [".svelte-kit/", "build/", "node_modules/", "docs/", "test-results/", "playwright-report/"]
	},
	js.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...globals.browser, ...globals.node }
		},
		plugins: { "@stylistic": stylistic, local: localPlugin },
		rules: { ...qualityRules, ...styleRules }
	},
	{
		files: ["**/*.svelte", "**/*.svelte.js"],
		rules: {
			// Svelte markup has its own indentation rule; script blocks start one tab in.
			"@stylistic/indent": "off",
			"svelte/indent": ["error", { indent: "tab", indentScript: true }],
			"svelte/no-at-html-tags": "off",
			// Svelte's $props()/$derived() are declared with let by convention.
			"prefer-const": "off",
			"svelte/prefer-const": "error",
			"svelte/require-each-key": "error",
			"svelte/no-navigation-without-resolve": "off"
		}
	}
];
