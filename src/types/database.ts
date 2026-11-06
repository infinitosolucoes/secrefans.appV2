
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
                    "created_at": string,"creator_id": string,"height": number | null,"id": string,"kind": string,"position": number,"post_id": string,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"creator_id": string,"height"?: number | null,"id"?: string,"kind"?: string,"position"?: number,"post_id": string,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"creator_id"?: string,"height"?: number | null,"id"?: string,"kind"?: string,"position"?: number,"post_id"?: string,"storage_path"?: string,"width"?: number | null
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
                    "avatar_path": string | null,"banner_path": string | null,"bio": string,"categories": (string)[],"created_at": string,"creator_intent": boolean,"display_name": string,"handle": string,"id": string,"links": (string)[],"status": Database["public"]['Enums']["account_status"],"updated_at": string,"visibility": Database["public"]['Enums']["profile_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string,"categories"?: (string)[],"created_at"?: string,"creator_intent"?: boolean,"display_name"?: string,"handle": string,"id": string,"links"?: (string)[],"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Update: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string,"categories"?: (string)[],"created_at"?: string,"creator_intent"?: boolean,"display_name"?: string,"handle"?: string,"id"?: string,"links"?: (string)[],"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string,"visibility"?: Database["public"]['Enums']["profile_visibility"]
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
            "feed_posts": {
                  Row: {
                    "avatar_path": string | null,"body": string,"comment_count": number | null,"creator_id": string,"display_name": string,"handle": string,"id": string,"like_count": number | null,"liked_by_me": boolean | null,"media_count": number | null,"price_cents": number | null,"published_at": string | null,"unlocked": boolean | null,"visibility": Database["public"]['Enums']["post_visibility"]
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"public_profiles": {
                  Row: {
                    "avatar_path": string | null,"banner_path": string | null,"bio": string,"categories": (string)[],"created_at": string,"display_name": string,"handle": string,"id": string,"is_creator": boolean | null,"links": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string | null,"categories"?: (string)[] | null,"created_at"?: string | null,"display_name"?: string | null,"handle"?: string | null,"id"?: string | null,"is_creator"?: never,"links"?: (string)[] | null
                         }
                        Update: {
                           "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string | null,"categories"?: (string)[] | null,"created_at"?: string | null,"display_name"?: string | null,"handle"?: string | null,"id"?: string | null,"is_creator"?: never,"links"?: (string)[] | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
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
"can_follow":
{ Args: { "p_creator_id": string }; Returns: boolean
                           },
"can_view_post_media":
{ Args: { "p_post_id": string }; Returns: boolean
                           },
"creator_stats":
{ Args: { "p_creator_id": string }; Returns: {
              "followers": number,"posts": number
            }[]
                           },
"decide_creator_verification":
{ Args: { "p_reason": string,"p_status": Database["public"]['Enums']["verification_status"],"p_verification_id": string }; Returns: undefined
                           },
"decide_report":
{ Args: { "p_reason": string,"p_remove_target"?: boolean,"p_report_id": string,"p_status": Database["public"]['Enums']["report_status"] }; Returns: undefined
                           },
"grant_role":
{ Args: { "p_reason": string,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: boolean
                           },
"handle_available":
{ Args: { "p_handle": string }; Returns: boolean
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
"my_roles":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"][]
                           },
"post_card_visible":
{ Args: { "p_post_id": string }; Returns: boolean
                           },
"post_media_for":
{ Args: { "p_post_id": string }; Returns: {
              "height": number,"position": number,"storage_path": string,"width": number
            }[]
                           },
"revoke_role":
{ Args: { "p_reason": string,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: boolean
                           },
"set_account_status":
{ Args: { "p_reason": string,"p_status": Database["public"]['Enums']["account_status"],"p_user_id": string }; Returns: undefined
                           },
"staff_can":
{ Args: { "permission": string }; Returns: boolean
                           },
"submit_creator_verification":
{ Args: { "p_birth_date": string,"p_depicted_consent": boolean,"p_document_back_path": string,"p_document_front_path": string,"p_legal_name": string,"p_rights_consent": boolean,"p_selfie_path": string }; Returns: string
                           }
          }
          Enums: {
            "account_status": "active"|"blocked"|"deleted","app_role": "fan"|"creator"|"moderator"|"support"|"finance"|"admin_ops"|"super_admin","comment_status": "visible"|"removed","post_status": "draft"|"published"|"removed","post_visibility": "free"|"subscribers"|"ppv","profile_visibility": "public"|"followers"|"private","report_status": "open"|"resolved"|"dismissed","report_target": "post"|"comment"|"profile","verification_status": "pending"|"approved"|"rejected"|"suspended"
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
            "account_status": ["active", "blocked", "deleted"],"app_role": ["fan", "creator", "moderator", "support", "finance", "admin_ops", "super_admin"],"comment_status": ["visible", "removed"],"post_status": ["draft", "published", "removed"],"post_visibility": ["free", "subscribers", "ppv"],"profile_visibility": ["public", "followers", "private"],"report_status": ["open", "resolved", "dismissed"],"report_target": ["post", "comment", "profile"],"verification_status": ["pending", "approved", "rejected", "suspended"]
          }
        }
} as const
