// @types/pdf-parse only declares the package root; we import the internal file
// path (to bypass pdf-parse's index "debug mode"), so re-export those types here.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse';
  export default pdfParse;
}
