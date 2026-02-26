ALTER TABLE public.contract_notification_deliveries
  DROP CONSTRAINT IF EXISTS contract_notification_deliveries_type_check;

ALTER TABLE public.contract_notification_deliveries
  ADD CONSTRAINT contract_notification_deliveries_type_check
  CHECK (
    notification_type IN (
      'SIGNATORY_LINK',
      'SIGNING_COMPLETED',
      'HOD_APPROVAL_REQUESTED',
      'APPROVAL_REMINDER',
      'ADDITIONAL_APPROVER_ADDED',
      'LEGAL_INTERNAL_ASSIGNMENT',
      'LEGAL_APPROVAL_RECEIVED_HOD',
      'LEGAL_APPROVAL_RECEIVED_ADDITIONAL',
      'LEGAL_RETURNED_TO_HOD',
      'LEGAL_CONTRACT_REJECTED'
    )
  );
