// Hand-authored types reflecting supabase/migrations/.
//
// TODO: Replace via `npm run db:types` once the Supabase project is
// linked. Until then this stays in lock-step with the SQL files.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Locale = "vi" | "en";
export type Plan = "free" | "pro";
export type EvidenceSource = "pubmed" | "ods" | "openfda";
export type EvidenceTier = "A" | "B" | "C" | "D";
export type QualityTier = "S" | "A" | "B" | "C";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Timestamps & {
          id: string;
          email: string;
          locale: Locale;
          plan: Plan;
          pro_until: string | null;
        };
        Insert: {
          id: string;
          email: string;
          locale?: Locale;
          plan?: Plan;
          pro_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      ingredients: {
        Row: Timestamps & {
          id: string;
          slug: string;
          name_vn: string | null;
          name_en: string;
          iupac_name: string | null;
          category: string;
          description_vn: string | null;
          description_en: string | null;
          safety_notes_vn: string | null;
          safety_notes_en: string | null;
          typical_dose_min: number | null;
          typical_dose_max: number | null;
          typical_unit: string | null;
          // pgvector wire format on read (see clinical_evidence.embedding).
          embedding: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name_vn?: string | null;
          name_en: string;
          iupac_name?: string | null;
          category: string;
          description_vn?: string | null;
          description_en?: string | null;
          safety_notes_vn?: string | null;
          safety_notes_en?: string | null;
          typical_dose_min?: number | null;
          typical_dose_max?: number | null;
          typical_unit?: string | null;
          embedding?: number[] | string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ingredients"]["Insert"]>;
        Relationships: [];
      };
      supplements: {
        Row: Timestamps & {
          id: string;
          slug: string;
          name_vn: string | null;
          name_en: string;
          brand: string;
          form: string | null;
          net_quantity: string | null;
          description_vn: string | null;
          description_en: string | null;
          source_url: string | null;
          price_vnd: number | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name_vn?: string | null;
          name_en: string;
          brand: string;
          form?: string | null;
          net_quantity?: string | null;
          description_vn?: string | null;
          description_en?: string | null;
          source_url?: string | null;
          price_vnd?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["supplements"]["Insert"]>;
        Relationships: [];
      };
      supplement_ingredients: {
        Row: {
          supplement_id: string;
          ingredient_id: string;
          dose: number;
          unit: string;
          pct_daily_value: number | null;
        };
        Insert: {
          supplement_id: string;
          ingredient_id: string;
          dose: number;
          unit: string;
          pct_daily_value?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["supplement_ingredients"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "supplement_ingredients_supplement_id_fkey";
            columns: ["supplement_id"];
            referencedRelation: "supplements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplement_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          }
        ];
      };
      clinical_evidence: {
        Row: {
          id: string;
          ingredient_id: string;
          source: EvidenceSource;
          source_ref: string;
          title_en: string;
          summary_vn: string | null;
          summary_en: string | null;
          tier: EvidenceTier;
          citation_url: string;
          published_at: string | null;
          // Stored as pgvector. The Supabase JS client returns vectors
          // as a JSON-encoded string ("[0.1,0.2,...]") on read; on
          // write you can pass either a string or an array. Sprint 3
          // retrieval helpers parse this back to number[] when needed.
          embedding: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ingredient_id: string;
          source: EvidenceSource;
          source_ref: string;
          title_en: string;
          summary_vn?: string | null;
          summary_en?: string | null;
          tier?: EvidenceTier;
          citation_url: string;
          published_at?: string | null;
          embedding?: number[] | string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["clinical_evidence"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "clinical_evidence_ingredient_id_fkey";
            columns: ["ingredient_id"];
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          }
        ];
      };
      articles: {
        Row: Timestamps & {
          id: string;
          slug: string;
          title_vn: string | null;
          title_en: string;
          body_vn: string | null;
          body_en: string | null;
          kol: string | null;
          video_url: string | null;
          supplement_id: string | null;
          ingredient_id: string | null;
          embedding: string | null;
          published_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title_vn?: string | null;
          title_en: string;
          body_vn?: string | null;
          body_en?: string | null;
          kol?: string | null;
          video_url?: string | null;
          supplement_id?: string | null;
          ingredient_id?: string | null;
          embedding?: number[] | string | null;
          published_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["articles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "articles_supplement_id_fkey";
            columns: ["supplement_id"];
            referencedRelation: "supplements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_ingredient_id_fkey";
            columns: ["ingredient_id"];
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          }
        ];
      };
      regimens: {
        Row: Timestamps & {
          id: string;
          user_id: string;
          name: string;
          timezone: string;
          enabled: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          timezone?: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["regimens"]["Insert"]>;
        Relationships: [];
      };
      regimen_items: {
        Row: Timestamps & {
          id: string;
          regimen_id: string;
          supplement_id: string | null;
          label: string;
          dose: number | null;
          unit: string | null;
          days_of_week: number[];
          times_of_day: string[];
          notify_push: boolean;
          notify_email: boolean;
          enabled: boolean;
        };
        Insert: {
          id?: string;
          regimen_id: string;
          supplement_id?: string | null;
          label: string;
          dose?: number | null;
          unit?: string | null;
          days_of_week?: number[];
          times_of_day?: string[];
          notify_push?: boolean;
          notify_email?: boolean;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["regimen_items"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "regimen_items_regimen_id_fkey";
            columns: ["regimen_id"];
            referencedRelation: "regimens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "regimen_items_supplement_id_fkey";
            columns: ["supplement_id"];
            referencedRelation: "supplements";
            referencedColumns: ["id"];
          }
        ];
      };
      intake_log: {
        Row: {
          id: string;
          user_id: string;
          regimen_item_id: string;
          scheduled_for: string;
          taken_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          regimen_item_id: string;
          scheduled_for: string;
          taken_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["intake_log"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "intake_log_regimen_item_id_fkey";
            columns: ["regimen_item_id"];
            referencedRelation: "regimen_items";
            referencedColumns: ["id"];
          }
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["push_subscriptions"]["Insert"]
        >;
        Relationships: [];
      };
      subscriptions: {
        Row: Timestamps & {
          id: string;
          user_id: string;
          payment_code: string;
          status: "pending" | "active" | "canceled" | "expired";
          period: "monthly" | "yearly";
          amount_vnd: number;
          activated_at: string | null;
          expires_at: string | null;
          sepay_event_id: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          payment_code: string;
          status?: "pending" | "active" | "canceled" | "expired";
          period: "monthly" | "yearly";
          amount_vnd: number;
          activated_at?: string | null;
          expires_at?: string | null;
          sepay_event_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["subscriptions"]["Insert"]
        >;
        Relationships: [];
      };
      payment_events: {
        Row: {
          id: number;
          payload: Json;
          matched_subscription_id: string | null;
          received_at: string;
        };
        Insert: {
          id: number;
          payload: Json;
          matched_subscription_id?: string | null;
          received_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["payment_events"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "payment_events_matched_subscription_id_fkey";
            columns: ["matched_subscription_id"];
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          }
        ];
      };
      chat_message_log: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["chat_message_log"]["Insert"]
        >;
        Relationships: [];
      };
      reminder_log: {
        Row: {
          id: string;
          regimen_item_id: string;
          scheduled_for: string;
          channel: "push" | "email";
          fired_at: string;
          ok: boolean;
          error: string | null;
        };
        Insert: {
          id?: string;
          regimen_item_id: string;
          scheduled_for: string;
          channel: "push" | "email";
          fired_at?: string;
          ok?: boolean;
          error?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["reminder_log"]["Insert"]
        >;
        Relationships: [];
      };
      quality_index: {
        Row: {
          supplement_id: string;
          lab_test_score: number;
          ingredient_quality_score: number;
          price_per_dose_score: number;
          total_score: number;
          tier: QualityTier;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          supplement_id: string;
          lab_test_score: number;
          ingredient_quality_score: number;
          price_per_dose_score: number;
          tier?: QualityTier;
          notes?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["quality_index"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "quality_index_supplement_id_fkey";
            columns: ["supplement_id"];
            referencedRelation: "supplements";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      tier_for_score: {
        Args: { total: number };
        Returns: QualityTier;
      };
      chat_messages_today: {
        Args: { p_user_id: string };
        Returns: number;
      };
      search_knowledge_hybrid: {
        Args: {
          query: string;
          query_embedding: number[] | null;
          total_limit?: number;
        };
        Returns: Array<{
          source: "evidence" | "article" | "ingredient" | "supplement";
          source_id: string;
          slug: string;
          title: string;
          content: string;
          citation_url: string | null;
          score: number;
        }>;
      };
    };
    Enums: {
      evidence_source: EvidenceSource;
      evidence_tier: EvidenceTier;
      quality_tier: QualityTier;
    };
    CompositeTypes: Record<string, never>;
  };
};
