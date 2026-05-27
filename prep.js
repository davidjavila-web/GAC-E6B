// prep.js — strip the `react` import line and append a render call.
// Input:  e6b_tankering.jsx
// Output: e6b_for_build.jsx  (still JSX; babel handles the JSX transform next.)

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "e6b_tankering.jsx");
const OUT = path.join(__dirname, "e6b_for_build.jsx");

let code = fs.readFileSync(SRC, "utf8");

// Strip any `import ... from "react"` / 'react' line. React + ReactDOM are
// pulled from CDN globals in the final HTML, so React hooks get rebound to
// `var useState = React.useState, ...` in the HTML template (build_html.js).
const before = code;
code = code.replace(/^\s*import\s+[^;]*?from\s+["']react["'];?\s*\n/m, "");
code = code.replace(/^\s*import\s+[^;]*?from\s+["']react-dom[^"']*["'];?\s*\n/m, "");

if (code === before) {
  console.warn("prep.js: no react import found to strip — continuing.");
}

// Strip `export default ` from the root component declaration. The HTML shell
// is a plain <script> (not type="module"), so the `export` keyword would throw
// SyntaxError: Unexpected token 'export' at parse time.
const beforeExport = code;
code = code.replace(/^\s*export\s+default\s+/gm, "");
if (code === beforeExport) {
  console.warn("prep.js: no `export default` found to strip — continuing.");
}

// Make sure the file ends with a newline before we append the render call.
if (!code.endsWith("\n")) code += "\n";

// Append the mount call. `<E6B/>` becomes React.createElement(E6B) after babel.
code += '\nReactDOM.createRoot(document.getElementById("root")).render(<E6B/>);\n';

fs.writeFileSync(OUT, code);
console.log(`prep.js: wrote ${OUT} (${code.length.toLocaleString()} bytes).`);
