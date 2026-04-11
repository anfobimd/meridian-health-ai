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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_api_calls: {
        Row: {
          created_at: string
          encounter_id: string | null
          error_message: string | null
          function_name: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_used: string | null
          output_tokens: number | null
          status: string | null
        }
        Insert: {
          created_at?: string
          encounter_id?: string | null
          error_message?: string | null
          function_name: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_used?: string | null
          output_tokens?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string
          encounter_id?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_used?: string | null
          output_tokens?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_api_calls_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chart_analysis: {
        Row: {
          ai_flags: Json | null
          brief: Json | null
          created_at: string
          documentation_score: number | null
          encounter_id: string
          estimated_review_seconds: number | null
          id: string
          model_used: string | null
          prompt_version: string | null
          recommended_action: string | null
          review_record_id: string | null
          risk_score: number | null
          risk_tier: string | null
        }
        Insert: {
          ai_flags?: Json | null
          brief?: Json | null
          created_at?: string
          documentation_score?: number | null
          encounter_id: string
          estimated_review_seconds?: number | null
          id?: string
          model_used?: string | null
          prompt_version?: string | null
          recommended_action?: string | null
          review_record_id?: string | null
          risk_score?: number | null
          risk_tier?: string | null
        }
        Update: {
          ai_flags?: Json | null
          brief?: Json | null
          created_at?: string
          documentation_score?: number | null
          encounter_id?: string
          estimated_review_seconds?: number | null
          id?: string
          model_used?: string | null
          prompt_version?: string | null
          recommended_action?: string | null
          review_record_id?: string | null
          risk_score?: number | null
          risk_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chart_analysis_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chart_analysis_review_record_id_fkey"
            columns: ["review_record_id"]
            isOneToOne: false
            referencedRelation: "chart_review_records"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_doc_checklists: {
        Row: {
          checklist_items: Json
          created_at: string
          id: string
          is_active: boolean
          procedure_type: string
          updated_at: string
        }
        Insert: {
          checklist_items?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          procedure_type: string
          updated_at?: string
        }
        Update: {
          checklist_items?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          procedure_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_md_consistency: {
        Row: {
          avg_review_seconds: number | null
          consistency_score: number | null
          correction_rate: number | null
          created_at: string
          id: string
          month: string
          reviewer_id: string
          rubber_stamp_count: number | null
          total_reviews: number | null
        }
        Insert: {
          avg_review_seconds?: number | null
          consistency_score?: number | null
          correction_rate?: number | null
          created_at?: string
          id?: string
          month: string
          reviewer_id: string
          rubber_stamp_count?: number | null
          total_reviews?: number | null
        }
        Update: {
          avg_review_seconds?: number | null
          consistency_score?: number | null
          correction_rate?: number | null
          created_at?: string
          id?: string
          month?: string
          reviewer_id?: string
          rubber_stamp_count?: number | null
          total_reviews?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_md_consistency_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_oversight_reports: {
        Row: {
          alerts: Json | null
          created_at: string
          generated_by: string | null
          highlights: Json | null
          id: string
          metrics: Json | null
          narrative: string | null
          recommendations: Json | null
          report_month: string
          report_type: string
        }
        Insert: {
          alerts?: Json | null
          created_at?: string
          generated_by?: string | null
          highlights?: Json | null
          id?: string
          metrics?: Json | null
          narrative?: string | null
          recommendations?: Json | null
          report_month: string
          report_type?: string
        }
        Update: {
          alerts?: Json | null
          created_at?: string
          generated_by?: string | null
          highlights?: Json | null
          id?: string
          metrics?: Json | null
          narrative?: string | null
          recommendations?: Json | null
          report_month?: string
          report_type?: string
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          prompt_key: string
          prompt_name: string
          system_prompt: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          prompt_key: string
          prompt_name: string
          system_prompt: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          prompt_key?: string
          prompt_name?: string
          system_prompt?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      ai_provider_intelligence: {
        Row: {
          avg_documentation_score: number | null
          coaching_notes: string | null
          coaching_status: string | null
          correction_rate: number | null
          created_at: string
          id: string
          last_analyzed_at: string | null
          provider_id: string
          recurring_issues: Json | null
          total_charts: number | null
          updated_at: string
        }
        Insert: {
          avg_documentation_score?: number | null
          coaching_notes?: string | null
          coaching_status?: string | null
          correction_rate?: number | null
          created_at?: string
          id?: string
          last_analyzed_at?: string | null
          provider_id: string
          recurring_issues?: Json | null
          total_charts?: number | null
          updated_at?: string
        }
        Update: {
          avg_documentation_score?: number | null
          coaching_notes?: string | null
          coaching_status?: string | null
          correction_rate?: number | null
          created_at?: string
          id?: string
          last_analyzed_at?: string | null
          provider_id?: string
          recurring_issues?: Json | null
          total_charts?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_intelligence_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_treatment_recommendations: {
        Row: {
          created_at: string
          goals_input: string[] | null
          id: string
          model_used: string | null
          patient_id: string
          recommendations: Json
        }
        Insert: {
          created_at?: string
          goals_input?: string[] | null
          id?: string
          model_used?: string | null
          patient_id: string
          recommendations?: Json
        }
        Update: {
          created_at?: string
          goals_input?: string[] | null
          id?: string
          model_used?: string | null
          patient_id?: string
          recommendations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_treatment_recommendations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_waitlist: {
        Row: {
          created_at: string
          fulfilled_appointment_id: string | null
          id: string
          is_fulfilled: boolean
          notes: string | null
          patient_id: string
          preferred_date: string | null
          preferred_time_end: string | null
          preferred_time_start: string | null
          provider_id: string | null
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fulfilled_appointment_id?: string | null
          id?: string
          is_fulfilled?: boolean
          notes?: string | null
          patient_id: string
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          provider_id?: string | null
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fulfilled_appointment_id?: string | null
          id?: string
          is_fulfilled?: boolean
          notes?: string | null
          patient_id?: string
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          provider_id?: string | null
          treatment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_waitlist_fulfilled_appointment_id_fkey"
            columns: ["fulfilled_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          checked_in_at: string | null
          completed_at: string | null
          created_at: string
          device_id: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          patient_id: string
          provider_id: string | null
          room_id: string | null
          roomed_at: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          patient_id: string
          provider_id?: string | null
          room_id?: string | null
          roomed_at?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          patient_id?: string
          provider_id?: string | null
          room_id?: string | null
          roomed_at?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chart_review_records: {
        Row: {
          ai_priority_score: number | null
          ai_risk_tier: string | null
          correction_details: Json | null
          created_at: string
          encounter_id: string
          id: string
          md_action: string | null
          md_comment: string | null
          patient_id: string
          provider_id: string | null
          review_completed_at: string | null
          review_duration_seconds: number | null
          review_started_at: string | null
          reviewer_id: string | null
          rubber_stamp_threshold_seconds: number | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_priority_score?: number | null
          ai_risk_tier?: string | null
          correction_details?: Json | null
          created_at?: string
          encounter_id: string
          id?: string
          md_action?: string | null
          md_comment?: string | null
          patient_id: string
          provider_id?: string | null
          review_completed_at?: string | null
          review_duration_seconds?: number | null
          review_started_at?: string | null
          reviewer_id?: string | null
          rubber_stamp_threshold_seconds?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_priority_score?: number | null
          ai_risk_tier?: string | null
          correction_details?: Json | null
          created_at?: string
          encounter_id?: string
          id?: string
          md_action?: string | null
          md_comment?: string | null
          patient_id?: string
          provider_id?: string | null
          review_completed_at?: string | null
          review_duration_seconds?: number | null
          review_started_at?: string | null
          reviewer_id?: string | null
          rubber_stamp_threshold_seconds?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_review_records_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_review_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_review_records_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_review_records_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_template_fields: {
        Row: {
          ai_variable: string | null
          config: Json | null
          created_at: string
          default_value: string | null
          field_key: string | null
          field_type: string
          id: string
          is_required: boolean
          label: string
          maps_to_column: string | null
          options: Json | null
          placeholder: string | null
          section_id: string
          sort_order: number | null
          unit: string | null
        }
        Insert: {
          ai_variable?: string | null
          config?: Json | null
          created_at?: string
          default_value?: string | null
          field_key?: string | null
          field_type?: string
          id?: string
          is_required?: boolean
          label: string
          maps_to_column?: string | null
          options?: Json | null
          placeholder?: string | null
          section_id: string
          sort_order?: number | null
          unit?: string | null
        }
        Update: {
          ai_variable?: string | null
          config?: Json | null
          created_at?: string
          default_value?: string | null
          field_key?: string | null
          field_type?: string
          id?: string
          is_required?: boolean
          label?: string
          maps_to_column?: string | null
          options?: Json | null
          placeholder?: string | null
          section_id?: string
          sort_order?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_template_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "chart_template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_template_orders: {
        Row: {
          cpt_code: string | null
          created_at: string | null
          description: string | null
          followup_days: number | null
          id: string
          is_auto_added: boolean | null
          lab_panel: string | null
          label: string
          order_key: string
          order_type: string
          rx_name: string | null
          sort_order: number | null
          template_id: string
        }
        Insert: {
          cpt_code?: string | null
          created_at?: string | null
          description?: string | null
          followup_days?: number | null
          id?: string
          is_auto_added?: boolean | null
          lab_panel?: string | null
          label: string
          order_key: string
          order_type: string
          rx_name?: string | null
          sort_order?: number | null
          template_id: string
        }
        Update: {
          cpt_code?: string | null
          created_at?: string | null
          description?: string | null
          followup_days?: number | null
          id?: string
          is_auto_added?: boolean | null
          lab_panel?: string | null
          label?: string
          order_key?: string
          order_type?: string
          rx_name?: string | null
          sort_order?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_template_orders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "chart_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_template_sections: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_collapsible: boolean | null
          is_required: boolean
          section_key: string | null
          sort_order: number | null
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_collapsible?: boolean | null
          is_required?: boolean
          section_key?: string | null
          sort_order?: number | null
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_collapsible?: boolean | null
          is_required?: boolean
          section_key?: string | null
          sort_order?: number | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "chart_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_templates: {
        Row: {
          auto_labs: boolean | null
          auto_protocol_milestone: boolean | null
          category: string | null
          cc_keywords: string[] | null
          color: string | null
          created_at: string
          default_cpt: string[] | null
          default_icd10: string[] | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_shared: boolean | null
          is_system: boolean
          keywords: string[] | null
          name: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          auto_labs?: boolean | null
          auto_protocol_milestone?: boolean | null
          category?: string | null
          cc_keywords?: string[] | null
          color?: string | null
          created_at?: string
          default_cpt?: string[] | null
          default_icd10?: string[] | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_shared?: boolean | null
          is_system?: boolean
          keywords?: string[] | null
          name: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          auto_labs?: boolean | null
          auto_protocol_milestone?: boolean | null
          category?: string | null
          cc_keywords?: string[] | null
          color?: string | null
          created_at?: string
          default_cpt?: string[] | null
          default_icd10?: string[] | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_shared?: boolean | null
          is_system?: boolean
          keywords?: string[] | null
          name?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      clinical_note_addenda: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          note_id: string
          reason: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          note_id: string
          reason?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          note_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_note_addenda_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "clinical_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_notes: {
        Row: {
          ai_generated: boolean
          appointment_id: string | null
          assessment: string | null
          created_at: string
          id: string
          objective: string | null
          patient_id: string
          plan: string | null
          provider_id: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["note_status"]
          subjective: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          appointment_id?: string | null
          assessment?: string | null
          created_at?: string
          id?: string
          objective?: string | null
          patient_id: string
          plan?: string | null
          provider_id?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["note_status"]
          subjective?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          appointment_id?: string | null
          assessment?: string | null
          created_at?: string
          id?: string
          objective?: string | null
          patient_id?: string
          plan?: string | null
          provider_id?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["note_status"]
          subjective?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_photos: {
        Row: {
          body_area: string | null
          created_at: string
          encounter_id: string | null
          id: string
          notes: string | null
          patient_id: string
          photo_type: string
          storage_path: string
          taken_at: string | null
          treatment_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          body_area?: string | null
          created_at?: string
          encounter_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          photo_type?: string
          storage_path: string
          taken_at?: string | null
          treatment_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          body_area?: string | null
          created_at?: string
          encounter_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          photo_type?: string
          storage_path?: string
          taken_at?: string | null
          treatment_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_photos_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_photos_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_actions: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_resolved: boolean
          provider_id: string
          resolved_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_resolved?: boolean
          provider_id: string
          resolved_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_resolved?: boolean
          provider_id?: string
          resolved_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_actions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          device_type: string
          id: string
          is_active: boolean
          maintenance_notes: string | null
          name: string
          room_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          maintenance_notes?: string | null
          name: string
          room_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          maintenance_notes?: string | null
          name?: string
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      e_consents: {
        Row: {
          consent_text: string
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string
          id: string
          ip_address: string | null
          patient_id: string
          signature_data: string | null
          signed_at: string
          user_agent: string | null
        }
        Insert: {
          consent_text: string
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          id?: string
          ip_address?: string | null
          patient_id: string
          signature_data?: string | null
          signed_at?: string
          user_agent?: string | null
        }
        Update: {
          consent_text?: string
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          id?: string
          ip_address?: string | null
          patient_id?: string
          signature_data?: string | null
          signed_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "e_consents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      encounter_field_responses: {
        Row: {
          ai_suggested: boolean
          created_at: string
          encounter_id: string
          field_id: string
          field_key: string | null
          field_label: string | null
          field_type: string | null
          id: string
          is_abnormal: boolean | null
          ref_range_high: number | null
          ref_range_low: number | null
          section_id: string | null
          section_key: string | null
          template_id: string | null
          updated_at: string
          value: string | null
          value_boolean: boolean | null
          value_json: Json | null
          value_numeric: number | null
        }
        Insert: {
          ai_suggested?: boolean
          created_at?: string
          encounter_id: string
          field_id: string
          field_key?: string | null
          field_label?: string | null
          field_type?: string | null
          id?: string
          is_abnormal?: boolean | null
          ref_range_high?: number | null
          ref_range_low?: number | null
          section_id?: string | null
          section_key?: string | null
          template_id?: string | null
          updated_at?: string
          value?: string | null
          value_boolean?: boolean | null
          value_json?: Json | null
          value_numeric?: number | null
        }
        Update: {
          ai_suggested?: boolean
          created_at?: string
          encounter_id?: string
          field_id?: string
          field_key?: string | null
          field_label?: string | null
          field_type?: string | null
          id?: string
          is_abnormal?: boolean | null
          ref_range_high?: number | null
          ref_range_low?: number | null
          section_id?: string | null
          section_key?: string | null
          template_id?: string | null
          updated_at?: string
          value?: string | null
          value_boolean?: boolean | null
          value_json?: Json | null
          value_numeric?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "encounter_field_responses_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_field_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "chart_template_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_field_responses_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "chart_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_field_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "chart_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      encounters: {
        Row: {
          appointment_id: string | null
          chief_complaint: string | null
          completed_at: string | null
          created_at: string
          encounter_type: string | null
          id: string
          patient_id: string
          provider_id: string | null
          signed_at: string | null
          signed_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          chief_complaint?: string | null
          completed_at?: string | null
          created_at?: string
          encounter_type?: string | null
          id?: string
          patient_id: string
          provider_id?: string | null
          signed_at?: string | null
          signed_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["encounter_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          chief_complaint?: string | null
          completed_at?: string | null
          created_at?: string
          encounter_type?: string | null
          id?: string
          patient_id?: string
          provider_id?: string | null
          signed_at?: string | null
          signed_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["encounter_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "encounters_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "chart_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hormone_visits: {
        Row: {
          ai_recommendation: string | null
          ai_sections: Json | null
          approval_notes: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          edited_monitoring: string | null
          edited_treatment: string | null
          id: string
          intake_focus: string[] | null
          intake_goals: string[] | null
          intake_symptoms: string[] | null
          lab_a1c: number | null
          lab_alt: number | null
          lab_ana: string | null
          lab_apoe: string | null
          lab_ast: number | null
          lab_b12: number | null
          lab_calcitonin: number | null
          lab_cd4cd8: string | null
          lab_crp: number | null
          lab_crt: number | null
          lab_dhea: number | null
          lab_e2: number | null
          lab_fins: number | null
          lab_folate: number | null
          lab_fsh: number | null
          lab_ft: number | null
          lab_ft3: number | null
          lab_ft4: number | null
          lab_glc: number | null
          lab_hct: number | null
          lab_hgb: number | null
          lab_igf1: number | null
          lab_igfbp3: number | null
          lab_igg: string | null
          lab_lh: number | null
          lab_p4: number | null
          lab_prl: number | null
          lab_psa: number | null
          lab_rbc: number | null
          lab_rpr: string | null
          lab_shbg: number | null
          lab_tsh: number | null
          lab_tt: number | null
          lab_vitd: number | null
          patient_id: string
          peptide_categories: string[] | null
          peptide_contraindications: string[] | null
          provider_id: string | null
          updated_at: string
          visit_date: string
        }
        Insert: {
          ai_recommendation?: string | null
          ai_sections?: Json | null
          approval_notes?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          edited_monitoring?: string | null
          edited_treatment?: string | null
          id?: string
          intake_focus?: string[] | null
          intake_goals?: string[] | null
          intake_symptoms?: string[] | null
          lab_a1c?: number | null
          lab_alt?: number | null
          lab_ana?: string | null
          lab_apoe?: string | null
          lab_ast?: number | null
          lab_b12?: number | null
          lab_calcitonin?: number | null
          lab_cd4cd8?: string | null
          lab_crp?: number | null
          lab_crt?: number | null
          lab_dhea?: number | null
          lab_e2?: number | null
          lab_fins?: number | null
          lab_folate?: number | null
          lab_fsh?: number | null
          lab_ft?: number | null
          lab_ft3?: number | null
          lab_ft4?: number | null
          lab_glc?: number | null
          lab_hct?: number | null
          lab_hgb?: number | null
          lab_igf1?: number | null
          lab_igfbp3?: number | null
          lab_igg?: string | null
          lab_lh?: number | null
          lab_p4?: number | null
          lab_prl?: number | null
          lab_psa?: number | null
          lab_rbc?: number | null
          lab_rpr?: string | null
          lab_shbg?: number | null
          lab_tsh?: number | null
          lab_tt?: number | null
          lab_vitd?: number | null
          patient_id: string
          peptide_categories?: string[] | null
          peptide_contraindications?: string[] | null
          provider_id?: string | null
          updated_at?: string
          visit_date?: string
        }
        Update: {
          ai_recommendation?: string | null
          ai_sections?: Json | null
          approval_notes?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          edited_monitoring?: string | null
          edited_treatment?: string | null
          id?: string
          intake_focus?: string[] | null
          intake_goals?: string[] | null
          intake_symptoms?: string[] | null
          lab_a1c?: number | null
          lab_alt?: number | null
          lab_ana?: string | null
          lab_apoe?: string | null
          lab_ast?: number | null
          lab_b12?: number | null
          lab_calcitonin?: number | null
          lab_cd4cd8?: string | null
          lab_crp?: number | null
          lab_crt?: number | null
          lab_dhea?: number | null
          lab_e2?: number | null
          lab_fins?: number | null
          lab_folate?: number | null
          lab_fsh?: number | null
          lab_ft?: number | null
          lab_ft3?: number | null
          lab_ft4?: number | null
          lab_glc?: number | null
          lab_hct?: number | null
          lab_hgb?: number | null
          lab_igf1?: number | null
          lab_igfbp3?: number | null
          lab_igg?: string | null
          lab_lh?: number | null
          lab_p4?: number | null
          lab_prl?: number | null
          lab_psa?: number | null
          lab_rbc?: number | null
          lab_rpr?: string | null
          lab_shbg?: number | null
          lab_tsh?: number | null
          lab_tt?: number | null
          lab_vitd?: number | null
          patient_id?: string
          peptide_categories?: string[] | null
          peptide_contraindications?: string[] | null
          provider_id?: string | null
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hormone_visits_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hormone_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hormone_visits_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_forms: {
        Row: {
          created_at: string
          form_type: string
          id: string
          patient_id: string
          responses: Json
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          form_type?: string
          id?: string
          patient_id: string
          responses?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          form_type?: string
          id?: string
          patient_id?: string
          responses?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_forms_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_forms_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_percent: number | null
          id: string
          invoice_id: string
          quantity: number
          total: number
          treatment_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_percent?: number | null
          id?: string
          invoice_id: string
          quantity?: number
          total?: number
          treatment_id?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_percent?: number | null
          id?: string
          invoice_id?: string
          quantity?: number
          total?: number
          treatment_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number | null
          appointment_id: string | null
          balance_due: number | null
          created_at: string
          discount_amount: number | null
          due_date: string | null
          id: string
          notes: string | null
          patient_id: string
          quote_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number | null
          tax_amount: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          appointment_id?: string | null
          balance_due?: number | null
          created_at?: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          appointment_id?: string | null
          balance_due?: number | null
          created_at?: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          created_at: string
          encounter_id: string | null
          id: string
          lab_name: string | null
          notes: string | null
          order_date: string
          patient_id: string
          provider_id: string | null
          status: Database["public"]["Enums"]["lab_order_status"]
          tests_ordered: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          encounter_id?: string | null
          id?: string
          lab_name?: string | null
          notes?: string | null
          order_date?: string
          patient_id: string
          provider_id?: string | null
          status?: Database["public"]["Enums"]["lab_order_status"]
          tests_ordered?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          encounter_id?: string | null
          id?: string
          lab_name?: string | null
          notes?: string | null
          order_date?: string
          patient_id?: string
          provider_id?: string | null
          status?: Database["public"]["Enums"]["lab_order_status"]
          tests_ordered?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          created_at: string
          id: string
          is_abnormal: boolean | null
          lab_order_id: string
          patient_id: string
          reference_high: number | null
          reference_low: number | null
          resulted_at: string | null
          test_name: string
          unit: string | null
          value: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_abnormal?: boolean | null
          lab_order_id: string
          patient_id: string
          reference_high?: number | null
          reference_low?: number | null
          resulted_at?: string | null
          test_name: string
          unit?: string | null
          value?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_abnormal?: boolean | null
          lab_order_id?: string
          patient_id?: string
          reference_high?: number | null
          reference_low?: number | null
          resulted_at?: string | null
          test_name?: string
          unit?: string | null
          value?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_lab_order_id_fkey"
            columns: ["lab_order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_bookings: {
        Row: {
          ai_match_reasoning: string | null
          appointment_id: string | null
          created_at: string
          id: string
          patient_id: string
          provider_id: string
          requested_at: string
          status: string
          treatment_id: string | null
        }
        Insert: {
          ai_match_reasoning?: string | null
          appointment_id?: string | null
          created_at?: string
          id?: string
          patient_id: string
          provider_id: string
          requested_at?: string
          status?: string
          treatment_id?: string | null
        }
        Update: {
          ai_match_reasoning?: string | null
          appointment_id?: string | null
          created_at?: string
          id?: string
          patient_id?: string
          provider_id?: string
          requested_at?: string
          status?: string
          treatment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_bookings_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_config: {
        Row: {
          clinic_name: string | null
          created_at: string
          id: string
          is_active: boolean
          laser_hourly_rate: number
          membership_tiers: Json
          modalities: Json
          updated_at: string
        }
        Insert: {
          clinic_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          laser_hourly_rate?: number
          membership_tiers?: Json
          modalities?: Json
          updated_at?: string
        }
        Update: {
          clinic_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          laser_hourly_rate?: number
          membership_tiers?: Json
          modalities?: Json
          updated_at?: string
        }
        Relationships: []
      }
      membership_invoices: {
        Row: {
          amount: number
          created_at: string
          id: string
          laser_charges: number
          laser_uses: number
          membership_amount: number
          membership_id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          provider_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          laser_charges?: number
          laser_uses?: number
          membership_amount?: number
          membership_id: string
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          provider_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          laser_charges?: number
          laser_uses?: number
          membership_amount?: number
          membership_id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          provider_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_invoices_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "provider_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_invoices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      oversight_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string
          description: string | null
          id: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      package_notification_log: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          id: string
          purchase_id: string
          rule_id: string | null
          sent_at: string
          status: string
          subject: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          purchase_id: string
          rule_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          purchase_id?: string
          rule_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_notification_log_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "patient_package_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_notification_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "package_notification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      package_notification_rules: {
        Row: {
          channel: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          template_body: string | null
          template_subject: string | null
          threshold_sessions: number | null
          timing_days: number | null
          tone: string
          trigger_label: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          template_body?: string | null
          template_subject?: string | null
          threshold_sessions?: number | null
          timing_days?: number | null
          tone?: string
          trigger_label: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          template_body?: string | null
          template_subject?: string | null
          threshold_sessions?: number | null
          timing_days?: number | null
          tone?: string
          trigger_label?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      patient_allergies: {
        Row: {
          allergen: string
          created_at: string
          id: string
          is_active: boolean
          onset_date: string | null
          patient_id: string
          reaction: string | null
          severity: string | null
        }
        Insert: {
          allergen: string
          created_at?: string
          id?: string
          is_active?: boolean
          onset_date?: string | null
          patient_id: string
          reaction?: string | null
          severity?: string | null
        }
        Update: {
          allergen?: string
          created_at?: string
          id?: string
          is_active?: boolean
          onset_date?: string | null
          patient_id?: string
          reaction?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_churn_scores: {
        Row: {
          ai_summary: string | null
          created_at: string
          days_since_visit: number | null
          factors: Json
          has_active_package: boolean | null
          id: string
          last_visit_date: string | null
          patient_id: string
          risk_score: number
          risk_tier: string
          scored_at: string
          updated_at: string
          visit_count_90d: number | null
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          days_since_visit?: number | null
          factors?: Json
          has_active_package?: boolean | null
          id?: string
          last_visit_date?: string | null
          patient_id: string
          risk_score?: number
          risk_tier?: string
          scored_at?: string
          updated_at?: string
          visit_count_90d?: number | null
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          days_since_visit?: number | null
          factors?: Json
          has_active_package?: boolean | null
          id?: string
          last_visit_date?: string | null
          patient_id?: string
          risk_score?: number
          risk_tier?: string
          scored_at?: string
          updated_at?: string
          visit_count_90d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_churn_scores_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_emergency: boolean
          is_primary: boolean
          name: string
          patient_id: string
          phone: string | null
          relationship: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_emergency?: boolean
          is_primary?: boolean
          name: string
          patient_id: string
          phone?: string | null
          relationship?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_emergency?: boolean
          is_primary?: boolean
          name?: string
          patient_id?: string
          phone?: string | null
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_insurance: {
        Row: {
          created_at: string
          group_number: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          patient_id: string
          policy_number: string | null
          provider_name: string
          relationship: string | null
          subscriber_dob: string | null
          subscriber_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_number?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          patient_id: string
          policy_number?: string | null
          provider_name: string
          relationship?: string | null
          subscriber_dob?: string | null
          subscriber_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_number?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          patient_id?: string
          policy_number?: string | null
          provider_name?: string
          relationship?: string | null
          subscriber_dob?: string | null
          subscriber_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_insurance_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_history: {
        Row: {
          condition: string
          created_at: string
          diagnosed_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          patient_id: string
          resolved_date: string | null
        }
        Insert: {
          condition: string
          created_at?: string
          diagnosed_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id: string
          resolved_date?: string | null
        }
        Update: {
          condition?: string
          created_at?: string
          diagnosed_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id?: string
          resolved_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medications: {
        Row: {
          created_at: string
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          is_active: boolean
          name: string
          patient_id: string
          prescriber: string | null
          start_date: string | null
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          name: string
          patient_id: string
          prescriber?: string | null
          start_date?: string | null
        }
        Update: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          name?: string
          patient_id?: string
          prescriber?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_package_purchases: {
        Row: {
          cancelled_at: string | null
          created_at: string
          deferred_revenue_amount: number
          expires_at: string | null
          id: string
          notes: string | null
          package_id: string
          patient_id: string
          paused_at: string | null
          price_paid: number
          provider_id: string | null
          purchased_at: string
          revenue_recognized_amount: number
          sessions_total: number
          sessions_used: number
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          deferred_revenue_amount?: number
          expires_at?: string | null
          id?: string
          notes?: string | null
          package_id: string
          patient_id: string
          paused_at?: string | null
          price_paid?: number
          provider_id?: string | null
          purchased_at?: string
          revenue_recognized_amount?: number
          sessions_total?: number
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          deferred_revenue_amount?: number
          expires_at?: string | null
          id?: string
          notes?: string | null
          package_id?: string
          patient_id?: string
          paused_at?: string | null
          price_paid?: number
          provider_id?: string | null
          purchased_at?: string
          revenue_recognized_amount?: number
          sessions_total?: number
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_package_purchases_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_package_purchases_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_package_purchases_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_package_sessions: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          notes: string | null
          provider_id: string | null
          purchase_id: string
          redeemed_at: string
          revenue_amount: number
          treatment_name: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          provider_id?: string | null
          purchase_id: string
          redeemed_at?: string
          revenue_amount?: number
          treatment_name?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          provider_id?: string | null
          purchase_id?: string
          redeemed_at?: string
          revenue_amount?: number
          treatment_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_package_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_package_sessions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_package_sessions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "patient_package_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          allergies: string[] | null
          auth_user_id: string | null
          city: string | null
          contraindications: string[] | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          fertility_goals: string | null
          first_name: string
          focus: string[] | null
          gender: string | null
          goals: string[] | null
          height_in: number | null
          id: string
          insurance_id: string | null
          insurance_provider: string | null
          is_active: boolean
          last_name: string
          lmp_status: string | null
          medications: string[] | null
          meno_status: string | null
          phone: string | null
          preferences: Json | null
          preferred_routes: string[] | null
          prior_therapy: string | null
          state: string | null
          symptoms: string[] | null
          updated_at: string
          uterine_status: string | null
          weight_lbs: number | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string[] | null
          auth_user_id?: string | null
          city?: string | null
          contraindications?: string[] | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          fertility_goals?: string | null
          first_name: string
          focus?: string[] | null
          gender?: string | null
          goals?: string[] | null
          height_in?: number | null
          id?: string
          insurance_id?: string | null
          insurance_provider?: string | null
          is_active?: boolean
          last_name: string
          lmp_status?: string | null
          medications?: string[] | null
          meno_status?: string | null
          phone?: string | null
          preferences?: Json | null
          preferred_routes?: string[] | null
          prior_therapy?: string | null
          state?: string | null
          symptoms?: string[] | null
          updated_at?: string
          uterine_status?: string | null
          weight_lbs?: number | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string[] | null
          auth_user_id?: string | null
          city?: string | null
          contraindications?: string[] | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          fertility_goals?: string | null
          first_name?: string
          focus?: string[] | null
          gender?: string | null
          goals?: string[] | null
          height_in?: number | null
          id?: string
          insurance_id?: string | null
          insurance_provider?: string | null
          is_active?: boolean
          last_name?: string
          lmp_status?: string | null
          medications?: string[] | null
          meno_status?: string | null
          phone?: string | null
          preferences?: Json | null
          preferred_routes?: string[] | null
          prior_therapy?: string | null
          state?: string | null
          symptoms?: string[] | null
          updated_at?: string
          uterine_status?: string | null
          weight_lbs?: number | null
          zip?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          patient_id: string
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          patient_id: string
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          patient_id?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          dosage: string | null
          encounter_id: string | null
          end_date: string | null
          frequency: string | null
          id: string
          is_active: boolean
          medication_name: string
          notes: string | null
          patient_id: string
          pharmacy: string | null
          provider_id: string | null
          quantity: number | null
          refills: number | null
          route: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          encounter_id?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          medication_name: string
          notes?: string | null
          patient_id: string
          pharmacy?: string | null
          provider_id?: string | null
          quantity?: number | null
          refills?: number | null
          route?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          encounter_id?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          medication_name?: string
          notes?: string | null
          patient_id?: string
          pharmacy?: string | null
          provider_id?: string | null
          quantity?: number | null
          refills?: number | null
          route?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proforma_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          inputs: Json
          is_default: boolean
          name: string
          results: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inputs?: Json
          is_default?: boolean
          name: string
          results?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inputs?: Json
          is_default?: boolean
          name?: string
          results?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      protocol_enrollments: {
        Row: {
          compound: string | null
          created_at: string
          dose: string | null
          end_date: string | null
          frequency: string | null
          id: string
          notes: string | null
          patient_id: string
          protocol_name: string
          provider_id: string | null
          route: string | null
          start_date: string
          status: Database["public"]["Enums"]["enrollment_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          compound?: string | null
          created_at?: string
          dose?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          protocol_name: string
          provider_id?: string | null
          route?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          compound?: string | null
          created_at?: string
          dose?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          protocol_name?: string
          provider_id?: string | null
          route?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_enrollments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_enrollments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_enrollments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "protocol_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_templates: {
        Row: {
          category: string | null
          compound: string | null
          created_at: string
          default_dose: string | null
          default_duration_weeks: number | null
          default_frequency: string | null
          default_route: string | null
          description: string | null
          id: string
          is_active: boolean
          monitoring_schedule: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          compound?: string | null
          created_at?: string
          default_dose?: string | null
          default_duration_weeks?: number | null
          default_frequency?: string | null
          default_route?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monitoring_schedule?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          compound?: string | null
          created_at?: string
          default_dose?: string | null
          default_duration_weeks?: number | null
          default_frequency?: string | null
          default_route?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monitoring_schedule?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_availability: {
        Row: {
          break_end: string | null
          break_start: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          provider_id: string
          room_preference_id: string | null
          start_time: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          provider_id: string
          room_preference_id?: string | null
          start_time: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          provider_id?: string
          room_preference_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_availability_room_preference_id_fkey"
            columns: ["room_preference_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_availability_overrides: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          is_available: boolean
          override_date: string
          provider_id: string
          reason: string | null
          start_time: string | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_available?: boolean
          override_date: string
          provider_id: string
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_available?: boolean
          override_date?: string
          provider_id?: string
          reason?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_overrides_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_earnings: {
        Row: {
          appointment_id: string | null
          cogs: number
          created_at: string
          gross_revenue: number
          id: string
          modality: string
          net_revenue: number
          notes: string | null
          patient_id: string | null
          provider_id: string
          service_date: string
          time_minutes: number | null
          treatment_id: string | null
          units_used: number | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          cogs?: number
          created_at?: string
          gross_revenue?: number
          id?: string
          modality?: string
          net_revenue?: number
          notes?: string | null
          patient_id?: string | null
          provider_id: string
          service_date?: string
          time_minutes?: number | null
          treatment_id?: string | null
          units_used?: number | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          cogs?: number
          created_at?: string
          gross_revenue?: number
          id?: string
          modality?: string
          net_revenue?: number
          notes?: string | null
          patient_id?: string | null
          provider_id?: string
          service_date?: string
          time_minutes?: number | null
          treatment_id?: string | null
          units_used?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_earnings_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_earnings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_earnings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_earnings_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_memberships: {
        Row: {
          created_at: string
          end_date: string | null
          founding_rate: number | null
          founding_rate_locked: boolean
          id: string
          is_active: boolean
          modalities: string[]
          monthly_rate: number
          notes: string | null
          provider_id: string
          start_date: string
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          founding_rate?: number | null
          founding_rate_locked?: boolean
          id?: string
          is_active?: boolean
          modalities?: string[]
          monthly_rate?: number
          notes?: string | null
          provider_id: string
          start_date?: string
          status?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          founding_rate?: number | null
          founding_rate_locked?: boolean
          id?: string
          is_active?: boolean
          modalities?: string[]
          monthly_rate?: number
          notes?: string | null
          provider_id?: string
          start_date?: string
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_memberships_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_skills: {
        Row: {
          certification_level: string
          created_at: string
          id: string
          modality: string
          provider_id: string
          skill_name: string
          verified_at: string | null
        }
        Insert: {
          certification_level?: string
          created_at?: string
          id?: string
          modality?: string
          provider_id: string
          skill_name: string
          verified_at?: string | null
        }
        Update: {
          certification_level?: string
          created_at?: string
          id?: string
          modality?: string
          provider_id?: string
          skill_name?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_skills_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          bio: string | null
          created_at: string
          credentials: string | null
          email: string | null
          first_name: string
          hourly_rate_override: number | null
          id: string
          is_active: boolean
          last_name: string
          license_number: string | null
          marketplace_bio: string | null
          marketplace_enabled: boolean
          modalities: string[] | null
          npi: string | null
          phone: string | null
          specialty: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          credentials?: string | null
          email?: string | null
          first_name: string
          hourly_rate_override?: number | null
          id?: string
          is_active?: boolean
          last_name: string
          license_number?: string | null
          marketplace_bio?: string | null
          marketplace_enabled?: boolean
          modalities?: string[] | null
          npi?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          credentials?: string | null
          email?: string | null
          first_name?: string
          hourly_rate_override?: number | null
          id?: string
          is_active?: boolean
          last_name?: string
          license_number?: string | null
          marketplace_bio?: string | null
          marketplace_enabled?: boolean
          modalities?: string[] | null
          npi?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          discount_percent: number | null
          id: string
          quantity: number
          quote_id: string
          total: number
          treatment_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_percent?: number | null
          id?: string
          quantity?: number
          quote_id: string
          total?: number
          treatment_id?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_percent?: number | null
          id?: string
          quantity?: number
          quote_id?: string
          total?: number
          treatment_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          discount_amount: number | null
          id: string
          notes: string | null
          patient_id: string
          provider_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number | null
          tax_amount: number | null
          total: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          notes?: string | null
          patient_id: string
          provider_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          notes?: string | null
          patient_id?: string
          provider_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          assigned_provider_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          room_type: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          assigned_provider_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          room_type?: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          assigned_provider_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          room_type?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_assigned_provider_id_fkey"
            columns: ["assigned_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_package_items: {
        Row: {
          created_at: string
          id: string
          package_id: string
          sessions_included: number
          treatment_id: string | null
          treatment_name: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          sessions_included?: number
          treatment_id?: string | null
          treatment_name: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          sessions_included?: number
          treatment_id?: string | null
          treatment_name?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_package_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      service_packages: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          individual_price: number | null
          is_active: boolean
          name: string
          package_type: string
          price: number
          session_count: number
          updated_at: string
          valid_days: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          individual_price?: number | null
          is_active?: boolean
          name: string
          package_type?: string
          price?: number
          session_count?: number
          updated_at?: string
          valid_days?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          individual_price?: number | null
          is_active?: boolean
          name?: string
          package_type?: string
          price?: number
          session_count?: number
          updated_at?: string
          valid_days?: number | null
        }
        Relationships: []
      }
      treatment_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      treatment_device_requirements: {
        Row: {
          created_at: string
          device_id: string
          id: string
          is_required: boolean
          treatment_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          is_required?: boolean
          treatment_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          is_required?: boolean
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_device_requirements_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_device_requirements_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          category: string | null
          category_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean
          name: string
          price: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name: string
          price?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "treatment_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vitals: {
        Row: {
          bmi: number | null
          bp_diastolic: number | null
          bp_systolic: number | null
          created_at: string
          encounter_id: string | null
          heart_rate: number | null
          height_in: number | null
          id: string
          o2_sat: number | null
          pain_scale: number | null
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          temperature: number | null
          updated_at: string
          weight_lbs: number | null
        }
        Insert: {
          bmi?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          encounter_id?: string | null
          heart_rate?: number | null
          height_in?: number | null
          id?: string
          o2_sat?: number | null
          pain_scale?: number | null
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          temperature?: number | null
          updated_at?: string
          weight_lbs?: number | null
        }
        Update: {
          bmi?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          encounter_id?: string | null
          heart_rate?: number | null
          height_in?: number | null
          id?: string
          o2_sat?: number | null
          pain_scale?: number | null
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          temperature?: number | null
          updated_at?: string
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_stale_packages: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      link_patient_auth: {
        Args: { _email: string; _user_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "provider" | "front_desk"
      appointment_status:
        | "booked"
        | "checked_in"
        | "roomed"
        | "in_progress"
        | "completed"
        | "no_show"
        | "cancelled"
      consent_type: "general" | "telehealth" | "hipaa" | "photo_release"
      encounter_status:
        | "open"
        | "in_progress"
        | "completed"
        | "signed"
        | "amended"
      enrollment_status: "active" | "paused" | "completed" | "discontinued"
      invoice_status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void"
      lab_order_status:
        | "ordered"
        | "collected"
        | "processing"
        | "resulted"
        | "cancelled"
      note_status: "draft" | "signed" | "amended"
      payment_method:
        | "cash"
        | "credit_card"
        | "debit_card"
        | "check"
        | "insurance"
        | "financing"
        | "other"
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired"
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
      app_role: ["admin", "provider", "front_desk"],
      appointment_status: [
        "booked",
        "checked_in",
        "roomed",
        "in_progress",
        "completed",
        "no_show",
        "cancelled",
      ],
      consent_type: ["general", "telehealth", "hipaa", "photo_release"],
      encounter_status: [
        "open",
        "in_progress",
        "completed",
        "signed",
        "amended",
      ],
      enrollment_status: ["active", "paused", "completed", "discontinued"],
      invoice_status: ["draft", "sent", "partial", "paid", "overdue", "void"],
      lab_order_status: [
        "ordered",
        "collected",
        "processing",
        "resulted",
        "cancelled",
      ],
      note_status: ["draft", "signed", "amended"],
      payment_method: [
        "cash",
        "credit_card",
        "debit_card",
        "check",
        "insurance",
        "financing",
        "other",
      ],
      quote_status: ["draft", "sent", "accepted", "declined", "expired"],
    },
  },
} as const
