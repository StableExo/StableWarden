export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      warden_entries: {
        Row: {
          author: string | null
          capabilities: string[] | null
          commit_hash: string | null
          created_at: string | null
          date: string
          entry_number: number
          files_changed: number | null
          id: number
          is_pr: boolean | null
          lines_added: number | null
          lines_removed: number | null
          message: string | null
          narrative: string | null
          pr_number: number | null
          significance: string | null
          title: string
        }
        Insert: {
          author?: string | null
          capabilities?: string[] | null
          commit_hash?: string | null
          created_at?: string | null
          date: string
          entry_number: number
          files_changed?: number | null
          id?: number
          is_pr?: boolean | null
          lines_added?: number | null
          lines_removed?: number | null
          message?: string | null
          narrative?: string | null
          pr_number?: number | null
          significance?: string | null
          title: string
        }
        Update: {
          author?: string | null
          capabilities?: string[] | null
          commit_hash?: string | null
          created_at?: string | null
          date?: string
          entry_number?: number
          files_changed?: number | null
          id?: number
          is_pr?: boolean | null
          lines_added?: number | null
          lines_removed?: number | null
          message?: string | null
          narrative?: string | null
          pr_number?: number | null
          significance?: string | null
          title?: string
        }
        Relationships: []
      }
      warden_operations: {
        Row: {
          alignment_score: number | null
          chain: string | null
          created_at: string
          decision: string | null
          dex_pair: string | null
          event_type: string
          id: string
          profit_estimate: number | null
          raw_data: Json | null
          reason: string | null
          timestamp: string
        }
        Insert: {
          alignment_score?: number | null
          chain?: string | null
          created_at?: string
          decision?: string | null
          dex_pair?: string | null
          event_type: string
          id?: string
          profit_estimate?: number | null
          raw_data?: Json | null
          reason?: string | null
          timestamp?: string
        }
        Update: {
          alignment_score?: number | null
          chain?: string | null
          created_at?: string
          decision?: string | null
          dex_pair?: string | null
          event_type?: string
          id?: string
          profit_estimate?: number | null
          raw_data?: Json | null
          reason?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      warden_patterns: {
        Row: {
          accuracy_delta: number | null
          chain: string | null
          created_at: string
          dex: string | null
          id: string
          last_updated: string
          observed_value: number | null
          pattern_type: string
          predicted_value: number | null
          sample_size: number | null
          weight: number
        }
        Insert: {
          accuracy_delta?: number | null
          chain?: string | null
          created_at?: string
          dex?: string | null
          id?: string
          last_updated?: string
          observed_value?: number | null
          pattern_type: string
          predicted_value?: number | null
          sample_size?: number | null
          weight?: number
        }
        Update: {
          accuracy_delta?: number | null
          chain?: string | null
          created_at?: string
          dex?: string | null
          id?: string
          last_updated?: string
          observed_value?: number | null
          pattern_type?: string
          predicted_value?: number | null
          sample_size?: number | null
          weight?: number
        }
        Relationships: []
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

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
