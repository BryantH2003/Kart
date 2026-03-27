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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      alerts_sent: {
        Row: {
          id: string
          sent_at: string | null
          triggered_price: number | null
          user_id: string | null
          vendor_product_id: string | null
        }
        Insert: {
          id?: string
          sent_at?: string | null
          triggered_price?: number | null
          user_id?: string | null
          vendor_product_id?: string | null
        }
        Update: {
          id?: string
          sent_at?: string | null
          triggered_price?: number | null
          user_id?: string | null
          vendor_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_sent_vendor_product_id_fkey"
            columns: ["vendor_product_id"]
            isOneToOne: false
            referencedRelation: "vendor_products"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_products: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string | null
          external_id: string | null
          external_id_type: string | null
          id: string
          image_url: string | null
          metacritic_score: number | null
          metadata: Json | null
          name: string
          release_date: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string | null
          external_id?: string | null
          external_id_type?: string | null
          id?: string
          image_url?: string | null
          metacritic_score?: number | null
          metadata?: Json | null
          name: string
          release_date?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string | null
          external_id?: string | null
          external_id_type?: string | null
          id?: string
          image_url?: string | null
          metacritic_score?: number | null
          metadata?: Json | null
          name?: string
          release_date?: string | null
        }
        Relationships: []
      }
      price_history_daily: {
        Row: {
          date: string
          price_avg: number | null
          price_max: number | null
          price_min: number | null
          vendor_product_id: string
        }
        Insert: {
          date: string
          price_avg?: number | null
          price_max?: number | null
          price_min?: number | null
          vendor_product_id: string
        }
        Update: {
          date?: string
          price_avg?: number | null
          price_max?: number | null
          price_min?: number | null
          vendor_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_daily_vendor_product_id_fkey"
            columns: ["vendor_product_id"]
            isOneToOne: false
            referencedRelation: "vendor_products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_snapshots: {
        Row: {
          availability: string | null
          id: string
          original_price: number | null
          price: number
          rating: number | null
          rating_text: string | null
          recorded_at: string | null
          review_count: number | null
          store_prices: Json | null
          vendor_product_id: string | null
        }
        Insert: {
          availability?: string | null
          id?: string
          original_price?: number | null
          price: number
          rating?: number | null
          rating_text?: string | null
          recorded_at?: string | null
          review_count?: number | null
          store_prices?: Json | null
          vendor_product_id?: string | null
        }
        Update: {
          availability?: string | null
          id?: string
          original_price?: number | null
          price?: number
          rating?: number | null
          rating_text?: string | null
          recorded_at?: string | null
          review_count?: number | null
          store_prices?: Json | null
          vendor_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_snapshots_vendor_product_id_fkey"
            columns: ["vendor_product_id"]
            isOneToOne: false
            referencedRelation: "vendor_products"
            referencedColumns: ["id"]
          },
        ]
      }
      search_cache: {
        Row: {
          cached_at: string | null
          query_hash: string
          results: Json
        }
        Insert: {
          cached_at?: string | null
          query_hash: string
          results: Json
        }
        Update: {
          cached_at?: string | null
          query_hash?: string
          results?: Json
        }
        Relationships: []
      }
      vendor_products: {
        Row: {
          canonical_id: string | null
          id: string
          is_active: boolean
          last_synced: string | null
          metadata: Json | null
          product_url: string | null
          sync_error: string | null
          sync_status: string
          vendor_id: string | null
          vendor_product_id: string
        }
        Insert: {
          canonical_id?: string | null
          id?: string
          is_active?: boolean
          last_synced?: string | null
          metadata?: Json | null
          product_url?: string | null
          sync_error?: string | null
          sync_status?: string
          vendor_id?: string | null
          vendor_product_id: string
        }
        Update: {
          canonical_id?: string | null
          id?: string
          is_active?: boolean
          last_synced?: string | null
          metadata?: Json | null
          product_url?: string | null
          sync_error?: string | null
          sync_status?: string
          vendor_id?: string | null
          vendor_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "canonical_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          config: Json | null
          enabled: boolean | null
          id: string
          name: string
          vendor_type: string
        }
        Insert: {
          config?: Json | null
          enabled?: boolean | null
          id: string
          name: string
          vendor_type?: string
        }
        Update: {
          config?: Json | null
          enabled?: boolean | null
          id?: string
          name?: string
          vendor_type?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          canonical_id: string | null
          created_at: string | null
          id: string
          target_price: number | null
          user_id: string | null
        }
        Insert: {
          canonical_id?: string | null
          created_at?: string | null
          id?: string
          target_price?: number | null
          user_id?: string | null
        }
        Update: {
          canonical_id?: string | null
          created_at?: string | null
          id?: string
          target_price?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "canonical_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
