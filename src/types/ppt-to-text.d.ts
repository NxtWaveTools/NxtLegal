declare module 'ppt-to-text' {
  const pptToText: {
    extractText(input: Buffer): string
  }

  export default pptToText
}
