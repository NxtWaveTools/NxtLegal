export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          changes: Json | null
          created_at: string | null
          event_sequence: number
          event_type: Database["public"]["Enums"]["audit_event_type"] | null
          id: string
          metadata: Json | null
          note_text: string | null
          resource_id: string
          resource_type: string
          target_email: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string | null
          event_sequence?: number
          event_type?: Database["public"]["Enums"]["audit_event_type"] | null
          id?: string
          metadata?: Json | null
          note_text?: string | null
          resource_id: string
          resource_type: string
          target_email?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string | null
          event_sequence?: number
          event_type?: Database["public"]["Enums"]["audit_event_type"] | null
          id?: string
          metadata?: Json | null
          note_text?: string | null
          resource_id?: string
          resource_type?: string
          target_email?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_activity_read_state: {
        Row: {
          contract_id: string
          created_at: string
          employee_id: string
          id: string
          last_seen_at: string | null
          last_seen_event_sequence: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          employee_id: string
          id?: string
          last_seen_at?: string | null
          last_seen_event_sequence?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          last_seen_at?: string | null
          last_seen_event_sequence?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_activity_read_state_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_activity_read_state_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_activity_read_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_additional_approvers: {
        Row: {
          approved_at: string | null
          approver_email: string
          approver_employee_id: string
          contract_id: string
          created_at: string
          created_by_employee_id: string
          deleted_at: string | null
          id: string
          sequence_order: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_email: string
          approver_employee_id: string
          contract_id: string
          created_at?: string
          created_by_employee_id: string
          deleted_at?: string | null
          id?: string
          sequence_order: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_email?: string
          approver_employee_id?: string
          contract_id?: string
          created_at?: string
          created_by_employee_id?: string
          deleted_at?: string | null
          id?: string
          sequence_order?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_additional_approvers_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_additional_approvers_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_additional_approvers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_counterparties: {
        Row: {
          contract_id: string
          counterparty_name: string
          created_at: string
          deleted_at: string | null
          id: string
          sequence_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          counterparty_name: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sequence_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          counterparty_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sequence_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_counterparties_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_counterparties_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_counterparties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_documents: {
        Row: {
          contract_id: string
          counterparty_id: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          document_kind: string
          file_mime_type: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          replaced_document_id: string | null
          tenant_id: string
          updated_at: string
          uploaded_by_email: string
          uploaded_by_employee_id: string
          uploaded_role: string
          version_number: number
        }
        Insert: {
          contract_id: string
          counterparty_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          document_kind: string
          file_mime_type: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id?: string
          replaced_document_id?: string | null
          tenant_id: string
          updated_at?: string
          uploaded_by_email: string
          uploaded_by_employee_id: string
          uploaded_role?: string
          version_number?: number
        }
        Update: {
          contract_id?: string
          counterparty_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          document_kind?: string
          file_mime_type?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          replaced_document_id?: string | null
          tenant_id?: string
          updated_at?: string
          uploaded_by_email?: string
          uploaded_by_employee_id?: string
          uploaded_role?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_counterparty_tenant_fkey"
            columns: ["tenant_id", "counterparty_id"]
            isOneToOne: false
            referencedRelation: "contract_counterparties"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "contract_documents_replaced_document_id_fkey"
            columns: ["replaced_document_id"]
            isOneToOne: false
            referencedRelation: "contract_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_legal_collaborators: {
        Row: {
          collaborator_email: string
          collaborator_employee_id: string
          contract_id: string
          created_at: string
          created_by_employee_id: string
          deleted_at: string | null
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          collaborator_email: string
          collaborator_employee_id: string
          contract_id: string
          created_at?: string
          created_by_employee_id: string
          deleted_at?: string | null
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          collaborator_email?: string
          collaborator_employee_id?: string
          contract_id?: string
          created_at?: string
          created_by_employee_id?: string
          deleted_at?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_legal_collaborators_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_legal_collaborators_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_legal_collaborators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_notification_deliveries: {
        Row: {
          channel: string
          contract_id: string
          created_at: string
          envelope_id: string | null
          id: string
          last_error: string | null
          max_retries: number
          metadata: Json | null
          next_retry_at: string | null
          notification_type: string
          provider_message_id: string | null
          provider_name: string
          recipient_email: string
          retry_count: number
          status: string
          template_id: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          contract_id: string
          created_at?: string
          envelope_id?: string | null
          id?: string
          last_error?: string | null
          max_retries?: number
          metadata?: Json | null
          next_retry_at?: string | null
          notification_type: string
          provider_message_id?: string | null
          provider_name: string
          recipient_email: string
          retry_count?: number
          status: string
          template_id: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          contract_id?: string
          created_at?: string
          envelope_id?: string | null
          id?: string
          last_error?: string | null
          max_retries?: number
          metadata?: Json | null
          next_retry_at?: string | null
          notification_type?: string
          provider_message_id?: string | null
          provider_name?: string
          recipient_email?: string
          retry_count?: number
          status?: string
          template_id?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_notification_deliveries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_notification_deliveries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatories: {
        Row: {
          contract_id: string
          created_at: string
          created_by_employee_id: string
          deleted_at: string | null
          docusign_envelope_id: string
          docusign_recipient_id: string
          envelope_source_document_id: string | null
          field_config: Json
          id: string
          recipient_type: string
          routing_order: number
          signatory_email: string
          signed_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by_employee_id: string
          deleted_at?: string | null
          docusign_envelope_id: string
          docusign_recipient_id: string
          envelope_source_document_id?: string | null
          field_config?: Json
          id?: string
          recipient_type?: string
          routing_order?: number
          signatory_email: string
          signed_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by_employee_id?: string
          deleted_at?: string | null
          docusign_envelope_id?: string
          docusign_recipient_id?: string
          envelope_source_document_id?: string | null
          field_config?: Json
          id?: string
          recipient_type?: string
          routing_order?: number
          signatory_email?: string
          signed_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatories_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatories_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatories_envelope_source_document_fk"
            columns: ["envelope_source_document_id"]
            isOneToOne: false
            referencedRelation: "contract_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signing_preparation_drafts: {
        Row: {
          contract_id: string
          created_at: string
          created_by_employee_id: string
          fields: Json
          id: string
          recipients: Json
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by_employee_id: string
          fields?: Json
          id?: string
          recipients?: Json
          tenant_id: string
          updated_at?: string
          updated_by_employee_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by_employee_id?: string
          fields?: Json
          id?: string
          recipients?: Json
          tenant_id?: string
          updated_at?: string
          updated_by_employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signing_preparation_drafts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signing_preparation_drafts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signing_preparation_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_transition_graph: {
        Row: {
          allowed_roles: string[]
          created_at: string
          from_status: string
          id: string
          is_active: boolean
          tenant_id: string
          to_status: string
          trigger_action: string
          updated_at: string
        }
        Insert: {
          allowed_roles: string[]
          created_at?: string
          from_status: string
          id?: string
          is_active?: boolean
          tenant_id: string
          to_status: string
          trigger_action: string
          updated_at?: string
        }
        Update: {
          allowed_roles?: string[]
          created_at?: string
          from_status?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          to_status?: string
          trigger_action?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_transition_graph_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_types: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          normalized_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          normalized_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          background_of_request: string | null
          budget_approved: boolean
          contract_type_id: string
          counterparty_name: string | null
          created_at: string
          current_assignee_email: string
          current_assignee_employee_id: string
          current_document_id: string | null
          deleted_at: string | null
          department_id: string | null
          file_mime_type: string | null
          file_name: string | null
          file_path: string | null
          file_size_bytes: number | null
          hod_approved_at: string | null
          id: string
          legal_auto_renewal: boolean | null
          legal_effective_date: string | null
          legal_notice_period: string | null
          legal_termination_date: string | null
          legal_approved_at: string | null
          request_created_at: string
          row_version: number
          signatory_designation: string | null
          signatory_email: string | null
          signatory_name: string | null
          status: string
          tat_breached_at: string | null
          tat_deadline_at: string | null
          tenant_id: string
          title: string
          updated_at: string
          uploaded_at: string
          uploaded_by_email: string
          uploaded_by_employee_id: string
          workflow_stage: string
        }
        Insert: {
          background_of_request?: string | null
          budget_approved?: boolean
          contract_type_id: string
          counterparty_name?: string | null
          created_at?: string
          current_assignee_email: string
          current_assignee_employee_id: string
          current_document_id?: string | null
          deleted_at?: string | null
          department_id?: string | null
          file_mime_type?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          hod_approved_at?: string | null
          id?: string
          legal_auto_renewal?: boolean | null
          legal_effective_date?: string | null
          legal_notice_period?: string | null
          legal_termination_date?: string | null
          legal_approved_at?: string | null
          request_created_at?: string
          row_version?: number
          signatory_designation?: string | null
          signatory_email?: string | null
          signatory_name?: string | null
          status?: string
          tat_breached_at?: string | null
          tat_deadline_at?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_email: string
          uploaded_by_employee_id: string
          workflow_stage?: string
        }
        Update: {
          background_of_request?: string | null
          budget_approved?: boolean
          contract_type_id?: string
          counterparty_name?: string | null
          created_at?: string
          current_assignee_email?: string
          current_assignee_employee_id?: string
          current_document_id?: string | null
          deleted_at?: string | null
          department_id?: string | null
          file_mime_type?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          hod_approved_at?: string | null
          id?: string
          legal_auto_renewal?: boolean | null
          legal_effective_date?: string | null
          legal_notice_period?: string | null
          legal_termination_date?: string | null
          legal_approved_at?: string | null
          request_created_at?: string
          row_version?: number
          signatory_designation?: string | null
          signatory_email?: string | null
          signatory_name?: string | null
          status?: string
          tat_breached_at?: string | null
          tat_deadline_at?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_email?: string
          uploaded_by_employee_id?: string
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_contract_type_fk"
            columns: ["tenant_id", "contract_type_id"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "contracts_current_document_id_fkey"
            columns: ["current_document_id"]
            isOneToOne: false
            referencedRelation: "contract_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      department_legal_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          deleted_at: string | null
          department_id: string
          id: string
          is_active: boolean
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deleted_at?: string | null
          department_id: string
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deleted_at?: string | null
          department_id?: string
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_legal_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_legal_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_legal_assignments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_legal_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_legal_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      department_role_map: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          mapping_version: number
          role_id: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          mapping_version?: number
          role_id: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          mapping_version?: number
          role_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_role_map_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_role_map_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_role_map_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_role_map_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_role_map_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      docusign_webhook_events: {
        Row: {
          contract_id: string
          created_at: string
          envelope_id: string
          event_key: string
          event_type: string
          id: string
          payload: Json
          recipient_email: string | null
          signer_ip: string | null
          tenant_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          envelope_id: string
          event_key: string
          event_type: string
          id?: string
          payload: Json
          recipient_email?: string | null
          signer_ip?: string | null
          tenant_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          envelope_id?: string
          event_key?: string
          event_type?: string
          id?: string
          payload?: Json
          recipient_email?: string | null
          signer_ip?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docusign_webhook_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docusign_webhook_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_repository_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docusign_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          email: string | null
          employee_id: string
          full_name: string | null
          id: string | null
          is_active: boolean | null
          password_hash: string | null
          role: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          employee_id: string
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          password_hash?: string | null
          role?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          employee_id?: string
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          password_hash?: string | null
          role?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          type: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          key: string
          response_data: Json
          status_code: number
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          key: string
          response_data: Json
          status_code: number
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          key?: string
          response_data?: Json
          status_code?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          module_name: string
          permission_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          module_name: string
          permission_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          module_name?: string
          permission_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          permission_id: string
          role_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          permission_id: string
          role_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          permission_id?: string
          role_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          is_system: boolean
          role_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          role_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          role_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          role_type: string
          team_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role_type: string
          team_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role_type?: string
          team_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_role_mappings: {
        Row: {
          active_flag: boolean
          assigned_at: string
          assigned_by: string | null
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          replaced_at: string | null
          replaced_by: string | null
          role_type: string
          team_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active_flag?: boolean
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          id?: string
          replaced_at?: string | null
          replaced_by?: string | null
          role_type: string
          team_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active_flag?: boolean
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          replaced_at?: string | null
          replaced_by?: string | null
          role_type?: string
          team_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_role_mappings_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_role_mappings_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_role_mappings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_role_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          deleted_at: string | null
          hod_email: string | null
          hod_name: string | null
          id: string
          is_active: boolean
          name: string
          poc_email: string | null
          poc_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          hod_email?: string | null
          hod_name?: string | null
          id?: string
          is_active?: boolean
          name: string
          poc_email?: string | null
          poc_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          hod_email?: string | null
          hod_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          poc_email?: string | null
          poc_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          name: string
          region: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          region?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          region?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          role_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          role_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          password_hash: string | null
          role: string
          tenant_id: string
          token_version: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          password_hash?: string | null
          role: string
          tenant_id: string
          token_version?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          password_hash?: string | null
          role?: string
          tenant_id?: string
          token_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contracts_repository_view: {
        Row: {
          aging_business_days: number | null
          created_at: string | null
          current_assignee_email: string | null
          current_assignee_employee_id: string | null
          department_id: string | null
          hod_approved_at: string | null
          id: string | null
          is_tat_breached: boolean | null
          near_breach: boolean | null
          status: string | null
          tat_breached_at: string | null
          tat_deadline_at: string | null
          tenant_id: string | null
          title: string | null
          updated_at: string | null
          uploaded_by_email: string | null
          uploaded_by_employee_id: string | null
        }
        Insert: {
          aging_business_days?: never
          created_at?: string | null
          current_assignee_email?: string | null
          current_assignee_employee_id?: string | null
          department_id?: string | null
          hod_approved_at?: string | null
          id?: string | null
          is_tat_breached?: never
          near_breach?: never
          status?: string | null
          tat_breached_at?: string | null
          tat_deadline_at?: string | null
          tenant_id?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_by_email?: string | null
          uploaded_by_employee_id?: string | null
        }
        Update: {
          aging_business_days?: never
          created_at?: string | null
          current_assignee_email?: string | null
          current_assignee_employee_id?: string | null
          department_id?: string | null
          hod_approved_at?: string | null
          id?: string | null
          is_tat_breached?: never
          near_breach?: never
          status?: string | null
          tat_breached_at?: string | null
          tat_deadline_at?: string | null
          tenant_id?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_by_email?: string | null
          uploaded_by_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_assign_primary_team_role: {
        Args: {
          p_admin_user_id: string
          p_new_user_id: string
          p_reason?: string
          p_role_type: string
          p_team_id: string
          p_tenant_id: string
        }
        Returns: {
          affected_contracts: number
          after_state_snapshot: Json
          before_state_snapshot: Json
          next_user_id: string
          previous_user_id: string
          role_type: string
          team_id: string
        }[]
      }
      admin_change_user_role: {
        Args: {
          p_admin_user_id: string
          p_operation: string
          p_reason?: string
          p_role_key: string
          p_target_user_id: string
          p_tenant_id: string
        }
        Returns: {
          after_state_snapshot: Json
          before_state_snapshot: Json
          changed: boolean
          new_token_version: number
          old_token_version: number
          operation: string
          role_key: string
          target_email: string
          target_user_id: string
        }[]
      }
      admin_create_department: {
        Args: {
          p_admin_user_id: string
          p_department_name: string
          p_reason?: string
          p_tenant_id: string
        }
        Returns: {
          after_state_snapshot: Json
          before_state_snapshot: Json
          department_name: string
          is_active: boolean
          team_id: string
        }[]
      }
      admin_create_department_with_emails: {
        Args: {
          p_admin_user_id: string
          p_department_name: string
          p_hod_email: string
          p_poc_email: string
          p_reason?: string
          p_tenant_id: string
        }
        Returns: {
          after_state_snapshot: Json
          before_state_snapshot: Json
          department_name: string
          hod_email: string
          is_active: boolean
          poc_email: string
          team_id: string
        }[]
      }
      admin_replace_team_role_email: {
        Args: {
          p_admin_user_id: string
          p_new_email: string
          p_reason?: string
          p_role_type: string
          p_team_id: string
          p_tenant_id: string
        }
        Returns: {
          after_state_snapshot: Json
          before_state_snapshot: Json
          next_email: string
          previous_email: string
          role_type: string
          team_id: string
        }[]
      }
      admin_set_department_legal_matrix: {
        Args: {
          p_admin_user_id: string
          p_legal_user_ids: string[]
          p_reason?: string
          p_team_id: string
          p_tenant_id: string
        }
        Returns: {
          active_legal_user_ids: string[]
          after_state_snapshot: Json
          before_state_snapshot: Json
          team_id: string
        }[]
      }
      admin_update_department: {
        Args: {
          p_admin_user_id: string
          p_department_name?: string
          p_operation: string
          p_reason?: string
          p_team_id: string
          p_tenant_id: string
        }
        Returns: {
          after_state_snapshot: Json
          before_state_snapshot: Json
          department_name: string
          is_active: boolean
          team_id: string
        }[]
      }
      business_day_add: {
        Args: { days: number; start_date: string }
        Returns: string
      }
      business_day_diff: {
        Args: { end_date: string; start_date: string }
        Returns: number
      }
      create_contract_primary_document_version: {
        Args: {
          p_contract_id: string
          p_display_name: string
          p_file_mime_type: string
          p_file_name: string
          p_file_path: string
          p_file_size_bytes: number
          p_tenant_id: string
          p_uploaded_by_email: string
          p_uploaded_by_employee_id: string
          p_uploaded_by_role: string
        }
        Returns: {
          document_id: string
          replaced_document_id: string
          version_number: number
        }[]
      }
      create_contract_with_audit: {
        Args: {
          p_background_of_request: string
          p_bypass_hod_approval: boolean
          p_bypass_reason: string | null
          p_budget_approved: boolean
          p_contract_id: string
          p_contract_type_id: string
          p_department_id: string
          p_file_mime_type: string
          p_file_name: string
          p_file_path: string
          p_file_size_bytes: number
          p_signatory_designation: string
          p_signatory_email: string
          p_signatory_name: string
          p_tenant_id: string
          p_title: string
          p_upload_mode: string
          p_uploaded_by_email: string
          p_uploaded_by_employee_id: string
          p_uploaded_by_role: string
        }
        Returns: {
          contract_id: string
          current_assignee_email: string
          current_assignee_employee_id: string
          status: string
        }[]
      }
      create_team_with_primary_members: {
        Args: {
          p_hod_email: string
          p_poc_email: string
          p_team_name: string
          p_tenant_id: string
        }
        Returns: {
          created_at: string
          deleted_at: string
          hod_email: string
          id: string
          name: string
          poc_email: string
          tenant_id: string
          updated_at: string
        }[]
      }
      replace_primary_team_member: {
        Args: {
          p_actor_email: string
          p_actor_role: string
          p_actor_user_id: string
          p_new_user_id: string
          p_role_type: string
          p_team_id: string
          p_tenant_id: string
        }
        Returns: {
          created_at: string
          id: string
          is_primary: boolean
          role_type: string
          team_id: string
          tenant_id: string
          updated_at: string
          user_email: string
          user_full_name: string
          user_id: string
        }[]
      }
    }
    Enums: {
      audit_event_type:
        | "CONTRACT_CREATED"
        | "CONTRACT_TRANSITIONED"
        | "CONTRACT_APPROVED"
        | "CONTRACT_BYPASSED"
        | "CONTRACT_NOTE_ADDED"
        | "CONTRACT_APPROVER_ADDED"
        | "CONTRACT_APPROVER_APPROVED"
        | "TEAM_MEMBER_REASSIGNED"
        | "CONTRACT_APPROVER_REJECTED"
        | "CONTRACT_APPROVER_BYPASSED"
        | "CONTRACT_SIGNATORY_ADDED"
        | "CONTRACT_SIGNATORY_SENT"
        | "CONTRACT_SIGNATORY_DELIVERED"
        | "CONTRACT_SIGNATORY_VIEWED"
        | "CONTRACT_SIGNATORY_SIGNED"
        | "CONTRACT_SIGNATORY_COMPLETED"
        | "CONTRACT_SIGNATORY_DECLINED"
        | "CONTRACT_SIGNATORY_EXPIRED"
        | "CONTRACT_ASSIGNEE_SET"
        | "CONTRACT_COLLABORATOR_ADDED"
        | "CONTRACT_COLLABORATOR_REMOVED"
        | "CONTRACT_ACTIVITY_MESSAGE_ADDED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_event_type: [
        "CONTRACT_CREATED",
        "CONTRACT_TRANSITIONED",
        "CONTRACT_APPROVED",
        "CONTRACT_BYPASSED",
        "CONTRACT_NOTE_ADDED",
        "CONTRACT_APPROVER_ADDED",
        "CONTRACT_APPROVER_APPROVED",
        "TEAM_MEMBER_REASSIGNED",
        "CONTRACT_APPROVER_REJECTED",
        "CONTRACT_APPROVER_BYPASSED",
        "CONTRACT_SIGNATORY_ADDED",
        "CONTRACT_SIGNATORY_SENT",
        "CONTRACT_SIGNATORY_DELIVERED",
        "CONTRACT_SIGNATORY_VIEWED",
        "CONTRACT_SIGNATORY_SIGNED",
        "CONTRACT_SIGNATORY_COMPLETED",
        "CONTRACT_SIGNATORY_DECLINED",
        "CONTRACT_SIGNATORY_EXPIRED",
        "CONTRACT_ASSIGNEE_SET",
        "CONTRACT_COLLABORATOR_ADDED",
        "CONTRACT_COLLABORATOR_REMOVED",
        "CONTRACT_ACTIVITY_MESSAGE_ADDED",
      ],
    },
  },
} as const
