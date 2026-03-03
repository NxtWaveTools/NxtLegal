import { buildMasterTemplate } from '../src/lib/email/master-template'

type SignatureRequestedPayloadInput = {
  recipientEmail: string
  contractTitle: string
  signingUrl: string
}

export function buildSignatureRequestedBrevoPayload(input: SignatureRequestedPayloadInput) {
  return {
    to: [input.recipientEmail],
    subject: `Signature Requested: ${input.contractTitle}`,
    htmlContent: buildMasterTemplate({
      title: 'Signature Requested',
      greeting: 'Hello,',
      messageText: `Please review and sign the contract \"${input.contractTitle}\" using the secure link below.`,
      buttonText: 'Review & Sign Contract',
      buttonLink: input.signingUrl,
      footerText: 'This signing link is unique to you and may expire based on your organization policy.',
    }),
    tags: ['contract-signature-requested'],
  }
}

const mockPayload = buildSignatureRequestedBrevoPayload({
  recipientEmail: 'signatory@example.com',
  contractTitle: 'Master Service Agreement FY26',
  signingUrl: 'https://app.nxtlegal.example/contracts/contract-123/sign?token=example',
})

console.log(JSON.stringify(mockPayload, null, 2))
