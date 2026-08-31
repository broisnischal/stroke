/**
 * The app's Monaco entry point. Import from here, never from `monaco-editor`.
 *
 * The package's default entry (`esm/vs/editor/editor.main.js`) is an
 * everything-bundle: it registers all 80-odd basic languages plus the css,
 * html, json and typescript language services, and each service drags in its
 * own web worker. We display exactly six languages - sql, json, javascript,
 * typescript, rust (Prisma's schema DSL borrows Rust's block syntax) and
 * markdown - plus the two Monarch grammars we register ourselves in
 * `monaco-delimited.js`. Everything else was dead weight in the main chunk,
 * and the css/html services pulled in css.worker and html.worker for grammars
 * nothing in the app can ever open.
 *
 * So this module composes the entry by hand out of the same pieces
 * `editor.main.js` uses:
 *
 * - `edcore.main.js` is the editor itself with every *feature* contribution
 *   (find, folding, suggest, context menu, quick access...) and no languages.
 *   Dropping features is not on the table; dropping languages is the win.
 * - each `basic-languages/*.contribution.js` registers one language id and a
 *   lazy Monarch loader. These are what make a language id exist at all.
 * - the `language/json` and `language/typescript` services add worker-backed
 *   validation and IntelliSense on top, and must be published on
 *   `monaco.languages.{json,typescript}` by hand - `editor.main.js` does that
 *   assignment itself, the contributions do not self-register.
 *
 * Adding a language means adding its contribution here. A language id that is
 * never registered does not error, it silently renders as plaintext, so if
 * highlighting disappears somewhere this file is the first place to look.
 */
import { languages } from 'monaco-editor/esm/vs/editor/edcore.main.js'

// Language ids. `javascript`/`typescript` must stay even though the language
// service below also targets them: the service only hooks `onLanguage`, so
// without these registrations it never fires.
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js'

// Worker-backed services. json powers the JSON views' validation/formatting
// (`monaco.languages.json.jsonDefaults` in monaco-env.js); typescript powers
// the ORM runner's IntelliSense (`languages.typescript.javascriptDefaults`).
import * as jsonService from 'monaco-editor/esm/vs/language/json/monaco.contribution.js'
import * as typescriptService from 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js'

languages.json = jsonService
languages.typescript = typescriptService

export * from 'monaco-editor/esm/vs/editor/edcore.main.js'
