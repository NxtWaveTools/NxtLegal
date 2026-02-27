declare module 'officeparser' {
  export function parseOffice(input: Buffer, config?: Record<string, unknown>): Promise<{ toText: () => string }>

  const officeParserDefault: {
    parseOffice?: typeof parseOffice
  }

  export default officeParserDefault
}
