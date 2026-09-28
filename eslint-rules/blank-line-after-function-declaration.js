/*
	Kevin's style rule: a named function's body starts with exactly one blank
	line after the declaration line, e.g.

		function saveItem(item) {

			return write(item);
		}

	Applies to function declarations, and to functions and methods defined with
	`function`. Arrow callbacks are exempt (too noisy for inline callbacks).
*/


const REQUIRED_BLANK_LINES = 1;


function checkFunctionBody(context, node) {

	const body = node.body;
	if (!body || body.type !== "BlockStatement" || body.body.length === 0) {
		return;
	}
	const sourceCode = context.sourceCode;
	const openBrace = sourceCode.getFirstToken(body);
	const firstToken = sourceCode.getTokenAfter(openBrace, { includeComments: true });
	if (openBrace.loc.end.line === body.loc.end.line) {
		return;
	}
	const blankLines = firstToken.loc.start.line - openBrace.loc.end.line - 1;
	if (blankLines === REQUIRED_BLANK_LINES) {
		return;
	}
	context.report({
		node: openBrace,
		messageId: blankLines < REQUIRED_BLANK_LINES ? "missing" : "tooMany",
		fix(fixer) {

			const lineBreak = "\n";
			const range = [openBrace.range[1], firstToken.range[0]];
			const indent = sourceCode.text.slice(sourceCode.getIndexFromLoc({ line: firstToken.loc.start.line, column: 0 }), firstToken.range[0]);
			return fixer.replaceTextRange(range, lineBreak.repeat(REQUIRED_BLANK_LINES + 1) + indent);
		}
	});
}


export default {
	meta: {
		type: "layout",
		fixable: "whitespace",
		docs: { description: "Require exactly one blank line after a function declaration line." },
		messages: {
			missing: "Add one blank line after the function declaration line.",
			tooMany: "Use exactly one blank line after the function declaration line."
		},
		schema: []
	},
	create(context) {

		return {
			FunctionDeclaration: (node) => checkFunctionBody(context, node),
			FunctionExpression: (node) => checkFunctionBody(context, node)
		};
	}
};
