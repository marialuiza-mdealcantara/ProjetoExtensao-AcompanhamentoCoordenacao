/**
 * Tipagem oficial do banco de dados Supabase (schema public)
 * Baseada na Especificação Técnica do Banco de Dados e no Diagrama ER:
 * - 19 tabelas no schema public (todas com RLS habilitado)
 * - 10 tipos enumerados (enums)
 * - 2 buckets privados no Supabase Storage (absence-documents, makeup-evidence)
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'PROFESSOR' | 'SECRETARIA' | 'COORDENADOR';

export type AcademicShift = 'MATUTINO' | 'NOTURNO';

export type ClassificationStatus = 'SUBSTITUIDA' | 'VAGA' | 'DISPENSADA';

export type DispensationShift = 'MATUTINO' | 'NOTURNO' | 'AMBOS';

export type DispensationStatus = 'ATIVA' | 'CANCELADA';

export type DocumentReviewStatus = 'PENDENTE' | 'CONFERIDO';

export type EvidenceType =
  | 'LISTA_PRESENCA'
  | 'REGISTRO_AULA'
  | 'MATERIAL_ATIVIDADE'
  | 'OUTRO';

export type JustificationStatus = 'PENDENTE' | 'APROVADA' | 'REJEITADA';

export type MakeupModality = 'PRESENCIAL' | 'REMOTA';

export type MakeupStatus = 'PENDENTE' | 'REALIZADA';

export type DocumentType = 'ATESTADO';

export const STORAGE_BUCKETS = {
  ABSENCE_DOCUMENTS: 'absence-documents',
  MAKEUP_EVIDENCE: 'makeup-evidence',
} as const;

export const STORAGE_CONSTRAINTS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MiB
  ALLOWED_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png'] as const,
} as const;

// 1. profiles
export type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  /** Coluna nullable no catálogo PostgreSQL; o frontend deve negar acesso se for null */
  role: UserRole | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  id: string;
  full_name: string;
  email: string;
  role?: UserRole | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = {
  full_name?: string;
  email?: string;
  role?: UserRole | null;
  active?: boolean;
  updated_at?: string;
};

// 2. courses
export type CourseRow = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CourseInsert = {
  id?: string;
  name: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CourseUpdate = {
  name?: string;
  active?: boolean;
  updated_at?: string;
};

// 3. user_courses
export type UserCourseRow = {
  user_id: string;
  course_id: string;
  created_at: string;
};

export type UserCourseInsert = {
  user_id: string;
  course_id: string;
  created_at?: string;
};

export type UserCourseUpdate = {
  user_id?: string;
  course_id?: string;
  created_at?: string;
};

// 4. subjects
export type SubjectRow = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SubjectInsert = {
  id?: string;
  name: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SubjectUpdate = {
  name?: string;
  active?: boolean;
  updated_at?: string;
};

// 5. academic_terms
export type AcademicTermRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  active: boolean;
  created_at: string;
};

export type AcademicTermInsert = {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
  active?: boolean;
  created_at?: string;
};

export type AcademicTermUpdate = {
  name?: string;
  start_date?: string;
  end_date?: string;
  active?: boolean;
};

// 6. classes
export type ClassRow = {
  id: string;
  course_id: string;
  term_id: string;
  name: string;
  semester_number: number;
  shift: AcademicShift;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClassInsert = {
  id?: string;
  course_id: string;
  term_id: string;
  name: string;
  semester_number: number;
  shift: AcademicShift;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ClassUpdate = {
  course_id?: string;
  term_id?: string;
  name?: string;
  semester_number?: number;
  shift?: AcademicShift;
  active?: boolean;
  updated_at?: string;
};

// 7. offerings
export type OfferingRow = {
  id: string;
  subject_id: string;
  teacher_id: string;
  term_id: string;
  shift: AcademicShift;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type OfferingInsert = {
  id?: string;
  subject_id: string;
  teacher_id: string;
  term_id: string;
  shift: AcademicShift;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type OfferingUpdate = {
  subject_id?: string;
  teacher_id?: string;
  term_id?: string;
  shift?: AcademicShift;
  active?: boolean;
  updated_at?: string;
};

// 8. offering_classes
export type OfferingClassRow = {
  offering_id: string;
  class_id: string;
  created_at: string;
};

export type OfferingClassInsert = {
  offering_id: string;
  class_id: string;
  created_at?: string;
};

export type OfferingClassUpdate = {
  offering_id?: string;
  class_id?: string;
  created_at?: string;
};

// 9. offering_schedules
export type OfferingScheduleRow = {
  id: string;
  offering_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
  created_at: string;
  updated_at: string;
};

export type OfferingScheduleInsert = {
  id?: string;
  offering_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type OfferingScheduleUpdate = {
  offering_id?: string;
  weekday?: number;
  start_time?: string;
  end_time?: string;
  room?: string | null;
  updated_at?: string;
};

// 10. class_occurrences
export type ClassOccurrenceRow = {
  id: string;
  schedule_id: string;
  class_date: string;
  classification: ClassificationStatus | null;
  dispensation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassOccurrenceInsert = {
  id?: string;
  schedule_id: string;
  class_date: string;
  classification?: ClassificationStatus | null;
  dispensation_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClassOccurrenceUpdate = {
  schedule_id?: string;
  class_date?: string;
  classification?: ClassificationStatus | null;
  dispensation_id?: string | null;
  updated_at?: string;
};

// 11. absences
export type AbsenceRow = {
  id: string;
  occurrence_id: string;
  teacher_id: string;
  reason: string | null;
  created_by: string;
  substitute_id: string | null;
  substitute_selected_by: string | null;
  substitute_selected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AbsenceInsert = {
  id?: string;
  occurrence_id: string;
  teacher_id: string;
  reason?: string | null;
  created_by: string;
  substitute_id?: string | null;
  substitute_selected_by?: string | null;
  substitute_selected_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AbsenceUpdate = {
  reason?: string | null;
  substitute_id?: string | null;
  substitute_selected_by?: string | null;
  substitute_selected_at?: string | null;
  updated_at?: string;
};

// 12. substitute_suggestions
export type SubstituteSuggestionRow = {
  id: string;
  absence_id: string;
  suggested_teacher_id: string;
  suggested_by: string;
  created_at: string;
};

export type SubstituteSuggestionInsert = {
  id?: string;
  absence_id: string;
  suggested_teacher_id: string;
  suggested_by: string;
  created_at?: string;
};

export type SubstituteSuggestionUpdate = {
  suggested_teacher_id?: string;
};

// 13. absence_documents
export type AbsenceDocumentRow = {
  id: string;
  absence_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  document_type: DocumentType;
  review_status: DocumentReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  forwarded_externally: boolean;
  forwarded_by: string | null;
  forwarded_at: string | null;
  created_by: string;
  created_at: string;
};

export type AbsenceDocumentInsert = {
  id?: string;
  absence_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  document_type?: DocumentType;
  review_status?: DocumentReviewStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  forwarded_externally?: boolean;
  forwarded_by?: string | null;
  forwarded_at?: string | null;
  created_by: string;
  created_at?: string;
};

export type AbsenceDocumentUpdate = {
  review_status?: DocumentReviewStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  forwarded_externally?: boolean;
  forwarded_by?: string | null;
  forwarded_at?: string | null;
};

// 14. absence_document_status
export type AbsenceDocumentStatusRow = {
  document_id: string;
  absence_id: string;
  review_status: DocumentReviewStatus;
  created_at: string;
};

export type AbsenceDocumentStatusInsert = {
  document_id: string;
  absence_id: string;
  review_status?: DocumentReviewStatus;
  created_at?: string;
};

export type AbsenceDocumentStatusUpdate = {
  review_status?: DocumentReviewStatus;
};

// 15. justifications
export type JustificationRow = {
  id: string;
  absence_id: string;
  description: string;
  status: JustificationStatus;
  submitted_at: string;
  coordinator_id: string | null;
  decision_at: string | null;
  decision_notes: string | null;
  forwarded_by: string | null;
  forwarded_at: string | null;
};

export type JustificationInsert = {
  id?: string;
  absence_id: string;
  description: string;
  status?: JustificationStatus;
  submitted_at?: string;
  coordinator_id?: string | null;
  decision_at?: string | null;
  decision_notes?: string | null;
  forwarded_by?: string | null;
  forwarded_at?: string | null;
};

export type JustificationUpdate = {
  description?: string;
  status?: JustificationStatus;
  coordinator_id?: string | null;
  decision_at?: string | null;
  decision_notes?: string | null;
  forwarded_by?: string | null;
  forwarded_at?: string | null;
};

// 16. makeups
export type MakeupRow = {
  id: string;
  absence_id: string;
  class_id: string;
  teacher_id: string;
  makeup_date: string;
  start_time: string;
  end_time: string;
  modality: MakeupModality;
  status: MakeupStatus;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MakeupInsert = {
  id?: string;
  absence_id: string;
  class_id: string;
  teacher_id: string;
  makeup_date: string;
  start_time: string;
  end_time: string;
  modality: MakeupModality;
  status?: MakeupStatus;
  verified_by?: string | null;
  verified_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MakeupUpdate = {
  makeup_date?: string;
  start_time?: string;
  end_time?: string;
  modality?: MakeupModality;
  status?: MakeupStatus;
  verified_by?: string | null;
  verified_at?: string | null;
  updated_at?: string;
};

// 17. makeup_evidence
export type MakeupEvidenceRow = {
  id: string;
  makeup_id: string;
  storage_path: string;
  file_name: string;
  evidence_type: EvidenceType;
  uploaded_by: string;
  created_at: string;
};

export type MakeupEvidenceInsert = {
  id?: string;
  makeup_id: string;
  storage_path: string;
  file_name: string;
  evidence_type: EvidenceType;
  uploaded_by: string;
  created_at?: string;
};

export type MakeupEvidenceUpdate = {
  evidence_type?: EvidenceType;
};

// 18. institutional_dispensations
export type InstitutionalDispensationRow = {
  id: string;
  dispensation_date: string;
  reason: string;
  description: string | null;
  shift: DispensationShift;
  status: DispensationStatus;
  created_by: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InstitutionalDispensationInsert = {
  id?: string;
  dispensation_date: string;
  reason: string;
  description?: string | null;
  shift: DispensationShift;
  status?: DispensationStatus;
  created_by: string;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InstitutionalDispensationUpdate = {
  dispensation_date?: string;
  reason?: string;
  description?: string | null;
  shift?: DispensationShift;
  status?: DispensationStatus;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  updated_at?: string;
};

// 19. audit_logs
export type AuditLogRow = {
  id: string;
  user_id: string | null;
  entity_name: string;
  entity_id: string;
  action: string;
  old_data: Json | null;
  new_data: Json | null;
  created_at: string;
};

export type AuditLogInsert = {
  id?: string;
  user_id?: string | null;
  entity_name: string;
  entity_id: string;
  action: string;
  old_data?: Json | null;
  new_data?: Json | null;
  created_at?: string;
};

export type AuditLogUpdate = {
  old_data?: Json | null;
  new_data?: Json | null;
};

/**
 * Tipo Database completo para tipagem estrita do SupabaseClient<Database>
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      courses: {
        Row: CourseRow;
        Insert: CourseInsert;
        Update: CourseUpdate;
        Relationships: [];
      };
      user_courses: {
        Row: UserCourseRow;
        Insert: UserCourseInsert;
        Update: UserCourseUpdate;
        Relationships: [
          {
            foreignKeyName: 'user_courses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_courses_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          }
        ];
      };
      subjects: {
        Row: SubjectRow;
        Insert: SubjectInsert;
        Update: SubjectUpdate;
        Relationships: [];
      };
      academic_terms: {
        Row: AcademicTermRow;
        Insert: AcademicTermInsert;
        Update: AcademicTermUpdate;
        Relationships: [];
      };
      classes: {
        Row: ClassRow;
        Insert: ClassInsert;
        Update: ClassUpdate;
        Relationships: [
          {
            foreignKeyName: 'classes_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'classes_term_id_fkey';
            columns: ['term_id'];
            isOneToOne: false;
            referencedRelation: 'academic_terms';
            referencedColumns: ['id'];
          }
        ];
      };
      offerings: {
        Row: OfferingRow;
        Insert: OfferingInsert;
        Update: OfferingUpdate;
        Relationships: [
          {
            foreignKeyName: 'offerings_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offerings_teacher_id_fkey';
            columns: ['teacher_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offerings_term_id_fkey';
            columns: ['term_id'];
            isOneToOne: false;
            referencedRelation: 'academic_terms';
            referencedColumns: ['id'];
          }
        ];
      };
      offering_classes: {
        Row: OfferingClassRow;
        Insert: OfferingClassInsert;
        Update: OfferingClassUpdate;
        Relationships: [
          {
            foreignKeyName: 'offering_classes_offering_id_fkey';
            columns: ['offering_id'];
            isOneToOne: false;
            referencedRelation: 'offerings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offering_classes_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          }
        ];
      };
      offering_schedules: {
        Row: OfferingScheduleRow;
        Insert: OfferingScheduleInsert;
        Update: OfferingScheduleUpdate;
        Relationships: [
          {
            foreignKeyName: 'offering_schedules_offering_id_fkey';
            columns: ['offering_id'];
            isOneToOne: false;
            referencedRelation: 'offerings';
            referencedColumns: ['id'];
          }
        ];
      };
      class_occurrences: {
        Row: ClassOccurrenceRow;
        Insert: ClassOccurrenceInsert;
        Update: ClassOccurrenceUpdate;
        Relationships: [
          {
            foreignKeyName: 'class_occurrences_schedule_id_fkey';
            columns: ['schedule_id'];
            isOneToOne: false;
            referencedRelation: 'offering_schedules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'class_occurrences_dispensation_id_fkey';
            columns: ['dispensation_id'];
            isOneToOne: false;
            referencedRelation: 'institutional_dispensations';
            referencedColumns: ['id'];
          }
        ];
      };
      absences: {
        Row: AbsenceRow;
        Insert: AbsenceInsert;
        Update: AbsenceUpdate;
        Relationships: [
          {
            foreignKeyName: 'absences_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: true;
            referencedRelation: 'class_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'absences_teacher_id_fkey';
            columns: ['teacher_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      substitute_suggestions: {
        Row: SubstituteSuggestionRow;
        Insert: SubstituteSuggestionInsert;
        Update: SubstituteSuggestionUpdate;
        Relationships: [
          {
            foreignKeyName: 'substitute_suggestions_absence_id_fkey';
            columns: ['absence_id'];
            isOneToOne: false;
            referencedRelation: 'absences';
            referencedColumns: ['id'];
          }
        ];
      };
      absence_documents: {
        Row: AbsenceDocumentRow;
        Insert: AbsenceDocumentInsert;
        Update: AbsenceDocumentUpdate;
        Relationships: [
          {
            foreignKeyName: 'absence_documents_absence_id_fkey';
            columns: ['absence_id'];
            isOneToOne: false;
            referencedRelation: 'absences';
            referencedColumns: ['id'];
          }
        ];
      };
      absence_document_status: {
        Row: AbsenceDocumentStatusRow;
        Insert: AbsenceDocumentStatusInsert;
        Update: AbsenceDocumentStatusUpdate;
        Relationships: [
          {
            foreignKeyName: 'absence_document_status_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: true;
            referencedRelation: 'absence_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'absence_document_status_absence_id_fkey';
            columns: ['absence_id'];
            isOneToOne: false;
            referencedRelation: 'absences';
            referencedColumns: ['id'];
          }
        ];
      };
      justifications: {
        Row: JustificationRow;
        Insert: JustificationInsert;
        Update: JustificationUpdate;
        Relationships: [
          {
            foreignKeyName: 'justifications_absence_id_fkey';
            columns: ['absence_id'];
            isOneToOne: true;
            referencedRelation: 'absences';
            referencedColumns: ['id'];
          }
        ];
      };
      makeups: {
        Row: MakeupRow;
        Insert: MakeupInsert;
        Update: MakeupUpdate;
        Relationships: [
          {
            foreignKeyName: 'makeups_absence_id_fkey';
            columns: ['absence_id'];
            isOneToOne: false;
            referencedRelation: 'absences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'makeups_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          }
        ];
      };
      makeup_evidence: {
        Row: MakeupEvidenceRow;
        Insert: MakeupEvidenceInsert;
        Update: MakeupEvidenceUpdate;
        Relationships: [
          {
            foreignKeyName: 'makeup_evidence_makeup_id_fkey';
            columns: ['makeup_id'];
            isOneToOne: false;
            referencedRelation: 'makeups';
            referencedColumns: ['id'];
          }
        ];
      };
      institutional_dispensations: {
        Row: InstitutionalDispensationRow;
        Insert: InstitutionalDispensationInsert;
        Update: InstitutionalDispensationUpdate;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
        Update: AuditLogUpdate;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      substitution_v2_available_substitutes: {
        Args: { p_absence_id: string };
        Returns: { teacher_id: string; full_name: string }[];
      };
      substitution_v2_record_decision: {
        Args: { p_absence_id: string; p_substitute_id: string | null };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      academic_shift: AcademicShift;
      classification_status: ClassificationStatus;
      dispensation_shift: DispensationShift;
      dispensation_status: DispensationStatus;
      document_review_status: DocumentReviewStatus;
      evidence_type: EvidenceType;
      justification_status: JustificationStatus;
      makeup_modality: MakeupModality;
      makeup_status: MakeupStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
