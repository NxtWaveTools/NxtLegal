declare module 'word-extractor' {
  export interface WordExtractorDocument {
    getBody(): string
  }

  export default class WordExtractor {
    extract(input: Buffer): Promise<WordExtractorDocument>
  }
}
