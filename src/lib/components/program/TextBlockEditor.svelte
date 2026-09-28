<script>
	/*
		Rich text block (Tiptap). Emits { doc, html } on every change; the parent
		autosaves. Only formatting the sanitizer allows is offered.
	*/
	import { onMount } from "svelte";
	import { Editor } from "@tiptap/core";
	import StarterKit from "@tiptap/starter-kit";
	import Icon from "../ui/Icon.svelte";
	import { dismissable } from "../ui/floating.js";

	const HEADING_LEVEL = /** @type {const} */ (2);
	const SUBHEADING_LEVEL = /** @type {const} */ (3);
	const LINK_PROTOCOL_PATTERN = /^(https?:\/\/|mailto:)/i;
	const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	let { content, onchange, label = "Text" } = $props();

	let element = $state();
	let editor = $state(null);
	let active = $state(/** @type {Record<string, boolean>} */ ({}));
	let linkOpen = $state(false);
	let linkUrl = $state("");
	let linkInput = $state();

	const TOOLBAR = [
		{ key: "heading", icon: "heading", label: "Heading", run: (chain) => chain.toggleHeading({ level: HEADING_LEVEL }) },
		{ separator: true, key: "s1" },
		{ key: "bold", icon: "bold", label: "Bold", run: (chain) => chain.toggleBold() },
		{ key: "italic", icon: "italic", label: "Italic", run: (chain) => chain.toggleItalic() },
		{ key: "underline", icon: "underline", label: "Underline", run: (chain) => chain.toggleUnderline() },
		{ separator: true, key: "s2" },
		{ key: "bulletList", icon: "list", label: "Bulleted list", run: (chain) => chain.toggleBulletList() },
		{ key: "orderedList", icon: "list-ol", label: "Numbered list", run: (chain) => chain.toggleOrderedList() }
	];


	function readActiveMarks(currentEditor) {

		return {
			heading: currentEditor.isActive("heading"),
			bold: currentEditor.isActive("bold"),
			italic: currentEditor.isActive("italic"),
			underline: currentEditor.isActive("underline"),
			bulletList: currentEditor.isActive("bulletList"),
			orderedList: currentEditor.isActive("orderedList"),
			link: currentEditor.isActive("link")
		};
	}

	function runCommand(tool) {

		tool.run(editor.chain().focus()).run();
	}

	function normalizeLinkUrl(raw) {

		const url = raw.trim();
		if (!url) {
			return "";
		}
		if (LINK_PROTOCOL_PATTERN.test(url)) {
			return url;
		}
		return EMAIL_PATTERN.test(url) ? `mailto:${url}` : `https://${url}`;
	}

	function openLinkEditor() {

		linkUrl = editor.getAttributes("link").href || "";
		linkOpen = true;
		setTimeout(() => linkInput?.focus());
	}

	function applyLink() {

		const url = normalizeLinkUrl(linkUrl);
		const chain = editor.chain().focus().extendMarkRange("link");
		(url ? chain.setLink({ href: url }) : chain.unsetLink()).run();
		linkOpen = false;
	}

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [HEADING_LEVEL, SUBHEADING_LEVEL] },
					code: false,
					codeBlock: false,
					blockquote: false,
					horizontalRule: false,
					link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["mailto"] }
				})
			],
			content: content.doc,
			editorProps: {
				attributes: { class: "rte", role: "textbox", "aria-multiline": "true", "aria-label": label }
			},
			onUpdate: ({ editor: updated }) => onchange({ doc: updated.getJSON(), html: updated.getHTML() }),
			onTransaction: ({ editor: updated }) => {
				active = readActiveMarks(updated);
			}
		});
		return () => editor.destroy();
	});
</script>

<div class="rte-toolbar" role="toolbar" aria-label="Text formatting">
	{#each TOOLBAR as tool (tool.key)}
		{#if tool.separator}
			<span class="rte-toolbar__sep"></span>
		{:else}
			<button type="button" aria-pressed={Boolean(active[tool.key])} aria-label={tool.label} title={tool.label} onmousedown={(event) => event.preventDefault()} onclick={() => runCommand(tool)}>
				<Icon name={tool.icon} />
			</button>
		{/if}
	{/each}
	<span
		class="select"
		use:dismissable={() => {
			linkOpen = false;
		}}
	>
		<button type="button" aria-pressed={Boolean(active.link)} aria-label="Link" title="Link" aria-expanded={linkOpen} onmousedown={(event) => event.preventDefault()} onclick={openLinkEditor}>
			<Icon name="link" />
		</button>
		{#if linkOpen}
			<div class="popover link-popover">
				<form
					class="row"
					onsubmit={(event) => {
						event.preventDefault();
						applyLink();
					}}
				>
					<input bind:this={linkInput} class="input" type="text" placeholder="https://… or email" aria-label="Link address" bind:value={linkUrl} />
					<button class="btn btn--primary btn--sm" type="submit">{linkUrl.trim() ? "Apply" : "Remove"}</button>
				</form>
			</div>
		{/if}
	</span>
</div>
<div bind:this={element}></div>
