
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"id": number,"metadata": NonNullable<Json>,"reason": string | null,"target_id": string | null,"target_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"reason"?: string | null,"target_id"?: string | null,"target_type": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"reason"?: string | null,"target_id"?: string | null,"target_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"commission_rules": {
                  Row: {
                    "applies_to_tips": boolean,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"effective_from": string,"id": string,"proposed_by": string | null,"rate_bps": number,"reason": string,"status": Database["public"]['Enums']["commission_rule_status"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_to_tips"?: boolean,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"effective_from": string,"id"?: string,"proposed_by"?: string | null,"rate_bps": number,"reason": string,"status"?: Database["public"]['Enums']["commission_rule_status"],"version": number
                  }
                  Update: {
                    "applies_to_tips"?: boolean,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"effective_from"?: string,"id"?: string,"proposed_by"?: string | null,"rate_bps"?: number,"reason"?: string,"status"?: Database["public"]['Enums']["commission_rule_status"],"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"consent_records": {
                  Row: {
                    "consent_type": string,"created_at": string,"granted": boolean,"id": string,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent_type": string,"created_at"?: string,"granted": boolean,"id"?: string,"user_id": string,"version": string
                  }
                  Update: {
                    "consent_type"?: string,"created_at"?: string,"granted"?: boolean,"id"?: string,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"creator_id": string,"creator_unread": number,"fan_id": string,"fan_unread": number,"id": string,"last_message_at": string | null,"last_message_preview": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"creator_id": string,"creator_unread"?: number,"fan_id": string,"fan_unread"?: number,"id"?: string,"last_message_at"?: string | null,"last_message_preview"?: string
                  }
                  Update: {
                    "created_at"?: string,"creator_id"?: string,"creator_unread"?: number,"fan_id"?: string,"fan_unread"?: number,"id"?: string,"last_message_at"?: string | null,"last_message_preview"?: string
                  }
                  Relationships: [
                    
                  ]
                },"creator_commission_acceptances": {
                  Row: {
                    "accepted_at": string,"creator_id": string,"rule_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"creator_id": string,"rule_id": string
                  }
                  Update: {
                    "accepted_at"?: string,"creator_id"?: string,"rule_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "creator_commission_acceptances_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "commission_rules"
      referencedColumns: ["id"]
    }
                  ]
                },"creator_payout_accounts": {
                  Row: {
                    "created_at": string,"creator_id": string,"document_last4": string,"provider": string,"provider_account_id": string,"status": string,"updated_at": string,"wallet_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"creator_id": string,"document_last4": string,"provider": string,"provider_account_id": string,"status"?: string,"updated_at"?: string,"wallet_id": string
                  }
                  Update: {
                    "created_at"?: string,"creator_id"?: string,"document_last4"?: string,"provider"?: string,"provider_account_id"?: string,"status"?: string,"updated_at"?: string,"wallet_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"creator_verifications": {
                  Row: {
                    "appeal_text": string | null,"appealed_at": string | null,"birth_date": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"document_back_path": string | null,"document_front_path": string,"id": string,"legal_name": string,"selfie_path": string,"status": Database["public"]['Enums']["verification_status"],"submitted_at": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appeal_text"?: string | null,"appealed_at"?: string | null,"birth_date": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"document_back_path"?: string | null,"document_front_path": string,"id"?: string,"legal_name": string,"selfie_path": string,"status"?: Database["public"]['Enums']["verification_status"],"submitted_at"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "appeal_text"?: string | null,"appealed_at"?: string | null,"birth_date"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"document_back_path"?: string | null,"document_front_path"?: string,"id"?: string,"legal_name"?: string,"selfie_path"?: string,"status"?: Database["public"]['Enums']["verification_status"],"submitted_at"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"entitlements": {
                  Row: {
                    "granted_at": string,"id": string,"kind": string,"order_id": string,"revoked_at": string | null,"target_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"id"?: string,"kind": string,"order_id": string,"revoked_at"?: string | null,"target_id": string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"id"?: string,"kind"?: string,"order_id"?: string,"revoked_at"?: string | null,"target_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entitlements_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"feature_flags": {
                  Row: {
                    "description": string,"enabled": boolean,"key": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string,"enabled"?: boolean,"key": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "description"?: string,"enabled"?: boolean,"key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"creator_id": string,"follower_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"creator_id": string,"follower_id": string
                  }
                  Update: {
                    "created_at"?: string,"creator_id"?: string,"follower_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ledger_accounts": {
                  Row: {
                    "code": string,"created_at": string,"kind": string,"owner_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"kind": string,"owner_id"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"kind"?: string,"owner_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ledger_entries": {
                  Row: {
                    "created_at": string,"id": number,"kind": string,"memo": string,"order_id": string,"payment_event_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"kind": string,"memo"?: string,"order_id": string,"payment_event_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"kind"?: string,"memo"?: string,"order_id"?: string,"payment_event_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_payment_event_id_fkey"
      columns: ["payment_event_id"]
isOneToOne: false
      referencedRelation: "payment_events"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_lines": {
                  Row: {
                    "account_code": string,"credit_cents": number,"debit_cents": number,"entry_id": number,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_code": string,"credit_cents"?: number,"debit_cents"?: number,"entry_id": number,"id"?: never
                  }
                  Update: {
                    "account_code"?: string,"credit_cents"?: number,"debit_cents"?: number,"entry_id"?: number,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_lines_account_code_fkey"
      columns: ["account_code"]
isOneToOne: false
      referencedRelation: "ledger_accounts"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "ledger_lines_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"message_broadcasts": {
                  Row: {
                    "body": string,"created_at": string,"creator_id": string,"id": string,"price_cents": number | null,"recipients": number
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"creator_id": string,"id": string,"price_cents"?: number | null,"recipients"?: number
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"creator_id"?: string,"id"?: string,"price_cents"?: number | null,"recipients"?: number
                  }
                  Relationships: [
                    
                  ]
                },"message_media": {
                  Row: {
                    "creator_id": string,"duration_seconds": number | null,"height": number | null,"id": string,"kind": string,"message_id": string,"position": number,"poster_path": string | null,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "creator_id": string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind": string,"message_id": string,"position"?: number,"poster_path"?: string | null,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "creator_id"?: string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind"?: string,"message_id"?: string,"position"?: number,"poster_path"?: string | null,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_media_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"broadcast_id": string | null,"conversation_id": string,"created_at": string,"deleted_at": string | null,"id": string,"price_cents": number | null,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"broadcast_id"?: string | null,"conversation_id": string,"created_at"?: string,"deleted_at"?: string | null,"id": string,"price_cents"?: number | null,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"broadcast_id"?: string | null,"conversation_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"price_cents"?: number | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_broadcast_id_fkey"
      columns: ["broadcast_id"]
isOneToOne: false
      referencedRelation: "message_broadcasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "actual_fee_cents": number | null,"buyer_id": string,"commission_bps": number,"commission_cents": number,"commission_rule_id": string,"commission_rule_version": number,"created_at": string,"creator_id": string,"creator_net_cents": number,"description": string,"external_fees_cents": number,"gross_cents": number,"id": string,"idempotency_key": string,"kind": Database["public"]['Enums']["order_kind"],"method": string,"paid_at": string | null,"provider": string | null,"provider_ref": string | null,"provider_subscription_id": string | null,"renewal_of": string | null,"split_cents": number,"status": Database["public"]['Enums']["order_status"],"target_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_fee_cents"?: number | null,"buyer_id": string,"commission_bps": number,"commission_cents": number,"commission_rule_id": string,"commission_rule_version": number,"created_at"?: string,"creator_id": string,"creator_net_cents": number,"description"?: string,"external_fees_cents"?: number,"gross_cents": number,"id"?: string,"idempotency_key": string,"kind": Database["public"]['Enums']["order_kind"],"method": string,"paid_at"?: string | null,"provider"?: string | null,"provider_ref"?: string | null,"provider_subscription_id"?: string | null,"renewal_of"?: string | null,"split_cents"?: number,"status"?: Database["public"]['Enums']["order_status"],"target_id": string,"updated_at"?: string
                  }
                  Update: {
                    "actual_fee_cents"?: number | null,"buyer_id"?: string,"commission_bps"?: number,"commission_cents"?: number,"commission_rule_id"?: string,"commission_rule_version"?: number,"created_at"?: string,"creator_id"?: string,"creator_net_cents"?: number,"description"?: string,"external_fees_cents"?: number,"gross_cents"?: number,"id"?: string,"idempotency_key"?: string,"kind"?: Database["public"]['Enums']["order_kind"],"method"?: string,"paid_at"?: string | null,"provider"?: string | null,"provider_ref"?: string | null,"provider_subscription_id"?: string | null,"renewal_of"?: string | null,"split_cents"?: number,"status"?: Database["public"]['Enums']["order_status"],"target_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_commission_rule_id_fkey"
      columns: ["commission_rule_id"]
isOneToOne: false
      referencedRelation: "commission_rules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_renewal_of_fkey"
      columns: ["renewal_of"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"package_items": {
                  Row: {
                    "duration_seconds": number | null,"height": number | null,"id": string,"kind": string,"position": number,"poster_path": string | null,"size_bytes": number | null,"storage_path": string,"version_id": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind": string,"position"?: number,"poster_path"?: string | null,"size_bytes"?: number | null,"storage_path": string,"version_id": string,"width"?: number | null
                  }
                  Update: {
                    "duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind"?: string,"position"?: number,"poster_path"?: string | null,"size_bytes"?: number | null,"storage_path"?: string,"version_id"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "package_items_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "package_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "package_items_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "public_packages"
      referencedColumns: ["version_id"]
    }
                  ]
                },"package_versions": {
                  Row: {
                    "audience": Database["public"]['Enums']["package_audience"],"category": string | null,"cover_path": string | null,"created_at": string,"description": string,"id": string,"package_id": string,"price_cents": number,"published_at": string | null,"status": Database["public"]['Enums']["package_version_status"],"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: Database["public"]['Enums']["package_audience"],"category"?: string | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"package_id": string,"price_cents": number,"published_at"?: string | null,"status"?: Database["public"]['Enums']["package_version_status"],"title": string,"version": number
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["package_audience"],"category"?: string | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"package_id"?: string,"price_cents"?: number,"published_at"?: string | null,"status"?: Database["public"]['Enums']["package_version_status"],"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "package_versions_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "package_versions_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "public_packages"
      referencedColumns: ["id"]
    }
                  ]
                },"packages": {
                  Row: {
                    "created_at": string,"creator_id": string,"current_version_id": string | null,"id": string,"published_at": string | null,"removed_reason": string | null,"status": Database["public"]['Enums']["package_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"creator_id": string,"current_version_id"?: string | null,"id": string,"published_at"?: string | null,"removed_reason"?: string | null,"status"?: Database["public"]['Enums']["package_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"creator_id"?: string,"current_version_id"?: string | null,"id"?: string,"published_at"?: string | null,"removed_reason"?: string | null,"status"?: Database["public"]['Enums']["package_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "packages_current_version_fk"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "package_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "packages_current_version_fk"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "public_packages"
      referencedColumns: ["version_id"]
    }
                  ]
                },"payment_customers": {
                  Row: {
                    "cpf_last4": string,"created_at": string,"provider": string,"provider_customer_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cpf_last4": string,"created_at"?: string,"provider": string,"provider_customer_id": string,"user_id": string
                  }
                  Update: {
                    "cpf_last4"?: string,"created_at"?: string,"provider"?: string,"provider_customer_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_events": {
                  Row: {
                    "event_id": string,"id": string,"order_id": string | null,"payload": NonNullable<Json>,"provider": string,"received_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"id"?: string,"order_id"?: string | null,"payload"?: NonNullable<Json>,"provider": string,"received_at"?: string,"type": string
                  }
                  Update: {
                    "event_id"?: string,"id"?: string,"order_id"?: string | null,"payload"?: NonNullable<Json>,"provider"?: string,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_fee_settings": {
                  Row: {
                    "bps": number,"created_at": string,"created_by": string | null,"effective_from": string,"fixed_cents": number,"id": string,"method": string,"provider": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bps"?: number,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"fixed_cents"?: number,"id"?: string,"method": string,"provider": string,"reason"?: string
                  }
                  Update: {
                    "bps"?: number,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"fixed_cents"?: number,"id"?: string,"method"?: string,"provider"?: string,"reason"?: string
                  }
                  Relationships: [
                    
                  ]
                },"permissions": {
                  Row: {
                    "description": string,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"key": string
                  }
                  Update: {
                    "description"?: string,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "description": string,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"post_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"post_id": string,"status": Database["public"]['Enums']["comment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"post_id": string,"status"?: Database["public"]['Enums']["comment_status"]
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"post_id"?: string,"status"?: Database["public"]['Enums']["comment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "feed_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_likes": {
                  Row: {
                    "created_at": string,"post_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"post_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_likes_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "feed_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_likes_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_media": {
                  Row: {
                    "created_at": string,"creator_id": string,"duration_seconds": number | null,"height": number | null,"id": string,"kind": string,"position": number,"post_id": string,"poster_path": string | null,"size_bytes": number | null,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"creator_id": string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind"?: string,"position"?: number,"post_id": string,"poster_path"?: string | null,"size_bytes"?: number | null,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"creator_id"?: string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind"?: string,"position"?: number,"post_id"?: string,"poster_path"?: string | null,"size_bytes"?: number | null,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_media_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "feed_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_media_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "body": string,"created_at": string,"creator_id": string,"id": string,"price_cents": number | null,"published_at": string | null,"removed_reason": string | null,"status": Database["public"]['Enums']["post_status"],"updated_at": string,"visibility": Database["public"]['Enums']["post_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"creator_id": string,"id"?: string,"price_cents"?: number | null,"published_at"?: string | null,"removed_reason"?: string | null,"status"?: Database["public"]['Enums']["post_status"],"updated_at"?: string,"visibility"?: Database["public"]['Enums']["post_visibility"]
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"creator_id"?: string,"id"?: string,"price_cents"?: number | null,"published_at"?: string | null,"removed_reason"?: string | null,"status"?: Database["public"]['Enums']["post_status"],"updated_at"?: string,"visibility"?: Database["public"]['Enums']["post_visibility"]
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"banner_path": string | null,"bio": string,"categories": (string)[],"created_at": string,"creator_intent": boolean,"creator_type": string | null,"display_name": string,"dm_policy": string,"handle": string,"id": string,"links": (string)[],"socials": NonNullable<Json>,"status": Database["public"]['Enums']["account_status"],"subscription_price_cents": number | null,"updated_at": string,"visibility": Database["public"]['Enums']["profile_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string,"categories"?: (string)[],"created_at"?: string,"creator_intent"?: boolean,"creator_type"?: string | null,"display_name"?: string,"dm_policy"?: string,"handle": string,"id": string,"links"?: (string)[],"socials"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["account_status"],"subscription_price_cents"?: number | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Update: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string,"categories"?: (string)[],"created_at"?: string,"creator_intent"?: boolean,"creator_type"?: string | null,"display_name"?: string,"dm_policy"?: string,"handle"?: string,"id"?: string,"links"?: (string)[],"socials"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["account_status"],"subscription_price_cents"?: number | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"details": string,"id": string,"reason": string,"reporter_id": string,"status": Database["public"]['Enums']["report_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"details"?: string,"id"?: string,"reason": string,"reporter_id": string,"status"?: Database["public"]['Enums']["report_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"details"?: string,"id"?: string,"reason"?: string,"reporter_id"?: string,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string,"target_type"?: Database["public"]['Enums']["report_target"]
                  }
                  Relationships: [
                    
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "permission_key"?: string,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"creator_id": string,"current_period_end": string,"fan_id": string,"id": string,"last_order_id": string | null,"price_cents": number,"provider": string | null,"provider_subscription_id": string | null,"started_at": string,"status": Database["public"]['Enums']["subscription_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_at_period_end"?: boolean,"creator_id": string,"current_period_end": string,"fan_id": string,"id"?: string,"last_order_id"?: string | null,"price_cents": number,"provider"?: string | null,"provider_subscription_id"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"creator_id"?: string,"current_period_end"?: string,"fan_id"?: string,"id"?: string,"last_order_id"?: string | null,"price_cents"?: number,"provider"?: string | null,"provider_subscription_id"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_last_order_id_fkey"
      columns: ["last_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "creator_balance": {
                  Row: {
                    "balance_cents": number | null,"creator_id": string | null,"entries": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"feed_posts": {
                  Row: {
                    "avatar_path": string | null,"body": string,"comment_count": number | null,"creator_id": string,"display_name": string,"handle": string,"id": string,"like_count": number | null,"liked_by_me": boolean | null,"media_count": number | null,"price_cents": number | null,"published_at": string | null,"unlocked": boolean | null,"video_count": number | null,"visibility": Database["public"]['Enums']["post_visibility"]
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"public_packages": {
                  Row: {
                    "audience": Database["public"]['Enums']["package_audience"],"category": string | null,"cover_path": string | null,"creator_id": string,"description": string,"display_name": string,"handle": string,"id": string,"photo_count": number | null,"price_cents": number,"published_at": string | null,"title": string,"version": number,"version_id": string,"version_published_at": string | null,"video_count": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"public_profiles": {
                  Row: {
                    "avatar_path": string | null,"banner_path": string | null,"bio": string,"categories": (string)[],"created_at": string,"creator_type": string | null,"display_name": string,"handle": string,"id": string,"is_creator": boolean | null,"links": (string)[],"socials": NonNullable<Json>,"subscription_price_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string | null,"categories"?: (string)[] | null,"created_at"?: string | null,"creator_type"?: string | null,"display_name"?: string | null,"handle"?: string | null,"id"?: string | null,"is_creator"?: never,"links"?: (string)[] | null,"socials"?: Json | null,"subscription_price_cents"?: number | null
                         }
                        Update: {
                           "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string | null,"categories"?: (string)[] | null,"created_at"?: string | null,"creator_type"?: string | null,"display_name"?: string | null,"handle"?: string | null,"id"?: string | null,"is_creator"?: never,"links"?: (string)[] | null,"socials"?: Json | null,"subscription_price_cents"?: number | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_commission_rule":
{ Args: { "p_rule_id": string }; Returns: undefined
                           },
"admin_dashboard_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "audit_events_24h": number,"creators_total": number,"pending_verifications": number,"users_total": number
            }[]
                           },
"admin_get_user":
{ Args: { "p_user_id": string }; Returns: {
              "created_at": string,"creator_intent": boolean,"display_name": string,"email": string,"handle": string,"id": string,"last_sign_in_at": string,"roles": (Database["public"]['Enums']["app_role"])[],"status": Database["public"]['Enums']["account_status"]
            }[]
                           },
"admin_list_users":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_search"?: string }; Returns: {
              "created_at": string,"display_name": string,"email": string,"handle": string,"id": string,"roles": (Database["public"]['Enums']["app_role"])[],"status": Database["public"]['Enums']["account_status"],"total_count": number
            }[]
                           },
"appeal_creator_verification":
{ Args: { "p_text": string,"p_verification_id": string }; Returns: undefined
                           },
"attach_order_charge":
{ Args: { "p_order_id": string,"p_provider": string,"p_provider_ref": string,"p_provider_subscription_id"?: string }; Returns: undefined
                           },
"can_follow":
{ Args: { "p_creator_id": string }; Returns: boolean
                           },
"can_view_post_media":
{ Args: { "p_post_id": string }; Returns: boolean
                           },
"cancel_subscription":
{ Args: { "p_creator_id": string }; Returns: undefined
                           },
"confirm_payment":
{ Args: { "p_event_id": string,"p_net_cents"?: number,"p_payload"?: Json,"p_provider": string,"p_provider_ref": string,"p_split_cents"?: number,"p_status": string }; Returns: string
                           },
"create_order":
{ Args: { "p_amount_cents": number,"p_idempotency_key": string,"p_kind": Database["public"]['Enums']["order_kind"],"p_method": string,"p_target_id": string }; Returns: string
                           },
"create_renewal_order":
{ Args: { "p_provider": string,"p_provider_ref": string,"p_provider_subscription_id": string }; Returns: string
                           },
"creator_stats":
{ Args: { "p_creator_id": string }; Returns: {
              "followers": number,"posts": number
            }[]
                           },
"current_commission_rule":
{ Args: { "p_at"?: string }; Returns: {
              "applies_to_tips": boolean,
"created_at": string,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"effective_from": string,
"id": string,
"proposed_by": string | null,
"rate_bps": number,
"reason": string,
"status": Database["public"]['Enums']["commission_rule_status"],
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "commission_rules"
        isOneToOne: true
        isSetofReturn: false
      } },
"decide_commission_rule":
{ Args: { "p_approve": boolean,"p_reason": string,"p_rule_id": string }; Returns: undefined
                           },
"decide_creator_verification":
{ Args: { "p_reason": string,"p_status": Database["public"]['Enums']["verification_status"],"p_verification_id": string }; Returns: undefined
                           },
"decide_report":
{ Args: { "p_reason": string,"p_remove_target"?: boolean,"p_report_id": string,"p_status": Database["public"]['Enums']["report_status"] }; Returns: undefined
                           },
"delete_message":
{ Args: { "p_message_id": string }; Returns: undefined
                           },
"delete_package_draft":
{ Args: { "p_package_id": string }; Returns: string[]
                           },
"grant_role":
{ Args: { "p_reason": string,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: boolean
                           },
"handle_available":
{ Args: { "p_handle": string }; Returns: boolean
                           },
"has_active_subscription":
{ Args: { "p_creator_id": string }; Returns: boolean
                           },
"has_entitlement":
{ Args: { "p_kind": string,"p_target_id": string }; Returns: boolean
                           },
"has_permission":
{ Args: { "permission": string }; Returns: boolean
                           },
"has_role":
{ Args: { "check_role": Database["public"]['Enums']["app_role"] }; Returns: boolean
                           },
"is_blocked_with":
{ Args: { "p_other": string }; Returns: boolean
                           },
"is_mfa_session":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_verification_document_access":
{ Args: { "p_path": string,"p_verification_id": string }; Returns: undefined
                           },
"mark_conversation_read":
{ Args: { "p_conversation_id": string }; Returns: undefined
                           },
"message_media_counts":
{ Args: { "p_conversation_id": string }; Returns: {
              "media_count": number,"message_id": string
            }[]
                           },
"message_media_for":
{ Args: { "p_message_id": string }; Returns: {
              "duration_seconds": number,"height": number,"kind": string,"position": number,"poster_path": string,"storage_path": string,"width": number
            }[]
                           },
"my_roles":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"][]
                           },
"package_items_for":
{ Args: { "p_version_id": string }; Returns: {
              "duration_seconds": number,"height": number,"kind": string,"position": number,"poster_path": string,"storage_path": string,"width": number
            }[]
                           },
"post_card_visible":
{ Args: { "p_post_id": string }; Returns: boolean
                           },
"post_media_for":
{ Args: { "p_post_id": string }; Returns: {
              "duration_seconds": number,"height": number,"kind": string,"position": number,"poster_path": string,"storage_path": string,"width": number
            }[]
                           },
"prepare_order_charge":
{ Args: { "p_order_id": string,"p_provider": string }; Returns: number
                           },
"propose_commission_rule":
{ Args: { "p_applies_to_tips": boolean,"p_effective_from": string,"p_rate_bps": number,"p_reason": string }; Returns: number
                           },
"record_split_settlement":
{ Args: { "p_order_id": string,"p_split_cents": number }; Returns: string
                           },
"register_payout_account":
{ Args: { "p_account_id": string,"p_creator_id": string,"p_document_last4": string,"p_provider": string,"p_secret"?: Json,"p_status": string,"p_wallet_id": string }; Returns: undefined
                           },
"revoke_role":
{ Args: { "p_reason": string,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: boolean
                           },
"save_package":
{ Args: { "p_audience": Database["public"]['Enums']["package_audience"],"p_category": string,"p_cover_path": string,"p_description": string,"p_items": Json,"p_package_id": string,"p_price_cents": number,"p_publish": boolean,"p_title": string }; Returns: number
                           },
"send_broadcast":
{ Args: { "p_body": string,"p_broadcast_id": string,"p_media"?: Json,"p_price_cents"?: number }; Returns: number
                           },
"send_message":
{ Args: { "p_body": string,"p_conversation_id": string,"p_media"?: Json,"p_message_id": string,"p_price_cents"?: number }; Returns: string
                           },
"set_account_status":
{ Args: { "p_reason": string,"p_status": Database["public"]['Enums']["account_status"],"p_user_id": string }; Returns: undefined
                           },
"set_package_status":
{ Args: { "p_package_id": string,"p_status": Database["public"]['Enums']["package_status"] }; Returns: undefined
                           },
"set_payment_fee":
{ Args: { "p_bps": number,"p_fixed_cents": number,"p_method": string,"p_provider": string,"p_reason": string }; Returns: undefined
                           },
"staff_can":
{ Args: { "permission": string }; Returns: boolean
                           },
"start_conversation":
{ Args: { "p_other_id": string }; Returns: string
                           },
"submit_creator_verification":
{ Args: { "p_birth_date": string,"p_depicted_consent": boolean,"p_document_back_path": string,"p_document_front_path": string,"p_legal_name": string,"p_rights_consent": boolean,"p_selfie_path": string }; Returns: string
                           }
          }
          Enums: {
            "account_status": "active"|"blocked"|"deleted","app_role": "fan"|"creator"|"moderator"|"support"|"finance"|"admin_ops"|"super_admin","comment_status": "visible"|"removed","commission_rule_status": "pending_approval"|"approved"|"rejected","order_kind": "subscription"|"ppv"|"package"|"tip"|"message","order_status": "pending"|"paid"|"failed"|"cancelled"|"refunded"|"chargeback","package_audience": "all"|"subscribers","package_status": "draft"|"published"|"archived"|"removed","package_version_status": "draft"|"published"|"superseded","post_status": "draft"|"published"|"removed","post_visibility": "free"|"subscribers"|"ppv","profile_visibility": "public"|"followers"|"private","report_status": "open"|"resolved"|"dismissed","report_target": "post"|"comment"|"profile"|"message","subscription_status": "active"|"canceled"|"expired","verification_status": "pending"|"approved"|"rejected"|"suspended"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["active", "blocked", "deleted"],"app_role": ["fan", "creator", "moderator", "support", "finance", "admin_ops", "super_admin"],"comment_status": ["visible", "removed"],"commission_rule_status": ["pending_approval", "approved", "rejected"],"order_kind": ["subscription", "ppv", "package", "tip", "message"],"order_status": ["pending", "paid", "failed", "cancelled", "refunded", "chargeback"],"package_audience": ["all", "subscribers"],"package_status": ["draft", "published", "archived", "removed"],"package_version_status": ["draft", "published", "superseded"],"post_status": ["draft", "published", "removed"],"post_visibility": ["free", "subscribers", "ppv"],"profile_visibility": ["public", "followers", "private"],"report_status": ["open", "resolved", "dismissed"],"report_target": ["post", "comment", "profile", "message"],"subscription_status": ["active", "canceled", "expired"],"verification_status": ["pending", "approved", "rejected", "suspended"]
          }
        }
} as const
