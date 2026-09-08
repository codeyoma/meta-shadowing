import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

// Generic controls belong to the checked-in official shadcn layer. Content,
// semantic layout, audio engines, and domain-specific visualization stay HTML.
const app = fileURLToPath(new URL("../src/app/", import.meta.url));
const nativeControls = new Set([
  "button", "input", "select", "option", "optgroup", "textarea", "label",
  "fieldset", "legend", "dialog", "progress", "details", "summary", "hr",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
]);
const violations = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) continue;
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && nativeControls.has(node.tagName.getText(source))) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        violations.push(`${path.relative(process.cwd(), file)}:${line}: replace <${node.tagName.getText(source)}> with its shadcn primitive`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}

await inspect(app);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UI primitives: all app controls use the shared shadcn layer.");
}
