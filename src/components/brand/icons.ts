/*
 * Single-colour (currentColor) SVG components from @lobehub/icons.
 *
 * Why relative paths into node_modules: the package's `exports` map points
 * `@lobehub/icons/es/<Name>/Mono` at files that do not exist, and every
 * per-icon `index.mjs` imports @lobehub/ui (not installed, pulls in antd).
 * The plain SVG components live at es/<Name>/components/Mono.mjs and only
 * need React. If this breaks after an upgrade, fall back to inline SVGs.
 */
export { default as Alibaba } from "../../../node_modules/@lobehub/icons/es/Alibaba/components/Mono.mjs";
export { default as Anthropic } from "../../../node_modules/@lobehub/icons/es/Anthropic/components/Mono.mjs";
export { default as ClaudeCode } from "../../../node_modules/@lobehub/icons/es/ClaudeCode/components/Mono.mjs";
export { default as Cline } from "../../../node_modules/@lobehub/icons/es/Cline/components/Mono.mjs";
export { default as Cursor } from "../../../node_modules/@lobehub/icons/es/Cursor/components/Mono.mjs";
export { default as DeepSeek } from "../../../node_modules/@lobehub/icons/es/DeepSeek/components/Mono.mjs";
export { default as Google } from "../../../node_modules/@lobehub/icons/es/Google/components/Mono.mjs";
export { default as Minimax } from "../../../node_modules/@lobehub/icons/es/Minimax/components/Mono.mjs";
export { default as Moonshot } from "../../../node_modules/@lobehub/icons/es/Moonshot/components/Mono.mjs";
export { default as OpenAI } from "../../../node_modules/@lobehub/icons/es/OpenAI/components/Mono.mjs";
export { default as OpenCode } from "../../../node_modules/@lobehub/icons/es/OpenCode/components/Mono.mjs";
export { default as ZAI } from "../../../node_modules/@lobehub/icons/es/ZAI/components/Mono.mjs";
