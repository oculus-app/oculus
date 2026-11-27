/**
 * How an agent cites the library, as one grammar: the path spellings it
 * writes (`courses/…`, `../../courses/…`, absolute, `.oculus/agents/…`,
 * agent-cwd-relative, and the `../courses/…` and `agents/…` older chats
 * hold), a line or page suffix, and the partial spellings
 * (course-relative, bare filename) that need a lookup. Parsing is shape-only
 * and sync, so rendering a reply costs no queries; partials resolve through
 * `resolveCitation`, cached. Parsed `.md` ↔ PDF page arithmetic lives here
 * too (`citedPage`), since the chip label and the opener both need it.
 */
export {
  citationText,
  fullCitation,
  parseCitation,
  parsedSourceOf,
  splitLibraryHref,
} from "./parse";
export type { Citation, CitationShape, CiteLocation, LineRange } from "./parse";
export * from "./prose";
export * from "./resolve";
export * from "./pages";
export * from "./text";
