// src/integrations/supabase/types.ts
// v14 - Removed duplicate folder_id in DocumentRow, added missing BookingRow definition.

// --- Enums: Type Aliases (Derived from Database) ---
export type MemberRoleType = 'owner' | 'co_owner' | 'guest';
export type MaintenanceStatusType = 'pending' | 'in_progress' | 'completed' | 'deferred';
export type MaintenancePriorityType = 'low' | 'medium' | 'high' | 'urgent';
export type ExpenseCategoryType = 'utilities' | 'maintenance' | 'repairs' | 'supplies' | 'mortgage' | 'insurance' | 'taxes' | 'hoa_fees' | 'other' | 'management_fees' | 'cleaning_fees';
export type RecurringExpenseCategoryType = 'utilities' | 'mortgage' | 'insurance' | 'taxes' | 'hoa_fees' | 'other';
export type FrequencyType = 'monthly' | 'quarterly' | 'annually' | 'biannually';
export type SplitMethodType = 'equal' | 'percentage' | 'fixed' | 'shares' | 'payer_only';
export type BookingStatusType = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type DocumentCategoryType = 'legal' | 'financial' | 'insurance' | 'maintenance' | 'inventory' | 'agreements' | 'other';
export type SplitStatusType = 'owed' | 'paid';

// --- Enums: Exported Values (For Runtime Usage) ---
export enum MemberRole { Owner = 'owner', CoOwner = 'co_owner', Guest = 'guest' }
export enum MaintenanceStatus { Pending = 'pending', InProgress = 'in_progress', Completed = 'completed', Deferred = 'deferred' }
export enum MaintenancePriority { Low = 'low', Medium = 'medium', High = 'high', Urgent = 'urgent' }
export enum ExpenseCategory { Utilities = 'utilities', Maintenance = 'maintenance', Repairs = 'repairs', Supplies = 'supplies', Mortgage = 'mortgage', Insurance = 'insurance', Taxes = 'taxes', HoaFees = 'hoa_fees', Other = 'other', ManagementFees = 'management_fees', CleaningFees = 'cleaning_fees' }
export enum RecurringExpenseCategory { Utilities = 'utilities', Mortgage = 'mortgage', Insurance = 'insurance', Taxes = 'taxes', HoaFees = 'hoa_fees', Other = 'other' }
export enum Frequency { Monthly = 'monthly', Quarterly = 'quarterly', Annually = 'annually', Biannually = 'biannually' }
export enum SplitMethod { Equal = 'equal', Percentage = 'percentage', Fixed = 'fixed', Shares = 'shares', PayerOnly='payer_only' }
export enum BookingStatus { Pending = 'pending', Confirmed = 'confirmed', Cancelled = 'cancelled', Completed = 'completed' }
export enum DocumentCategory { Legal = 'legal', Financial = 'financial', Insurance = 'insurance', Maintenance = 'maintenance', Inventory = 'inventory', Agreements = 'agreements', Other = 'other' }
export enum SplitStatus { Owed = 'owed', Paid = 'paid' }

// --- Utility Types ---
export type PublicEnumName = keyof Database['public']['Enums'];
export type PublicEnum<T extends PublicEnumName> = Database['public']['Enums'][T];
export type WithProfile<T> = T & { profiles: Profile | null };
export type Json = | string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// --- Base DB Table Interfaces (using Type Aliases) ---
export interface Profile {
  id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; email: string | null; phone: string | null; created_at: string; updated_at: string;
}
export interface Property {
  id: string; created_at: string; name: string; address: string | null; type: string | null; image_url: string | null; created_by: string; updated_at: string | null; city: string | null; state: string | null; zip_code: string | null; country: string | null; description: string | null;
}
export interface PropertyMember {
  id: string; property_id: string; user_id: string; role: MemberRoleType; ownership_percentage: number | null; created_at: string;
}
export interface ExpenseRow {
  id: string; property_id: string; date: string;
  category: ExpenseCategoryType; amount: number; description: string | null; receipt_url: string | null;
  paid_by: string | null;
  created_at: string; updated_at: string | null; split_method: SplitMethodType; notes: string | null;
  status?: string;
}
export interface ExpenseSplitRow {
  id: string; expense_id: string; user_id: string; amount: number | null; percentage: number | null; shares: number | null;
  is_paid: boolean;
  created_at: string;
  status?: SplitStatusType;
}
export interface RecurringExpenseRow {
  id: string; property_id: string; description: string; category: RecurringExpenseCategoryType; amount: number; frequency: FrequencyType; interval: number; start_date: string; next_due_date: string; end_date: string | null;
  paid_by_user_id: string | null;
  split_method: SplitMethodType; split_details: Json | null; is_active: boolean; notes: string | null; created_at: string; updated_at: string | null; created_by: string;
}
export interface BookingRow { // Definition added back
  id: string; property_id: string; user_id: string; start_date: string; end_date: string; num_guests: number; status: BookingStatusType; notes: string | null; purpose: string | null; created_at: string; updated_at: string | null; approved_by: string | null;
}
export interface MaintenanceTaskRow {
  id: string; property_id: string; title: string; description: string | null; status: MaintenanceStatusType; priority: MaintenancePriorityType;
  assignee_id: string | null;
  estimated_cost: number | null; actual_cost: number | null; scheduled_date_start: string | null; scheduled_date_end: string | null; completed_date: string | null;
  reported_by: string | null;
  vendor_name: string | null; vendor_contact: string | null; attachment_urls: string[] | null; blocks_booking: boolean; created_at: string; updated_at: string | null;
  created_by?: string;
  linked_expense_id?: string | null;
}
export interface DocumentFolder {
  id: string; property_id: string; name: string; parent_folder_id: string | null; created_at: string; updated_at: string | null; created_by: string;
}
// --- CORRECTED DocumentRow ---
export interface DocumentRow {
  id: string; property_id: string;
  folder_id: string | null; // Keep only this one
  name: string; description: string | null; storage_path: string; file_type: string; file_size: number; category: DocumentCategoryType;
  expires_at: string | null; // String from DB
  created_at: string; updated_at: string | null;
  uploaded_by: string;
  linked_expense_id: string | null; linked_maintenance_task_id: string | null;
  // Removed duplicate folder_id and category_id (assuming category enum is sufficient)
}

// --- Enriched Types for Frontend Usage ---
type PickedProfile = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_url' | 'email'> | null;
export interface PropertyMemberWithProfile extends PropertyMember { profile: Profile | null; }
export interface ExpenseSplitWithProfile extends ExpenseSplitRow { user_profile: PickedProfile; }
export interface Expense extends ExpenseRow { paid_by_profile: PickedProfile; splits: ExpenseSplitWithProfile[]; }
export interface Document extends Omit<DocumentRow, 'expires_at'> { uploaded_by_profile: PickedProfile; expires_at: Date | null; }
export interface MaintenanceTask extends MaintenanceTaskRow { assignee_profile: PickedProfile; reported_by_profile?: PickedProfile; created_by_profile?: PickedProfile; linked_expense?: { id: string; description: string | null; amount: number } | null; }
export interface RecurringExpense extends RecurringExpenseRow { created_by_profile: PickedProfile; paid_by_profile: PickedProfile; }

// --- Form Data Types ---
export interface RecurringExpenseFormData { description: string; amount: number; category: RecurringExpenseCategoryType; frequency: FrequencyType; interval: number; start_date: Date; end_date?: Date | null; paid_by_user_id: string; split_method: SplitMethodType; notes?: string | null; percentage_splits?: Record<string, number | null>; custom_splits?: Record<string, number | null>; is_active?: boolean; }
export interface MaintenanceTaskFormData { title: string; description?: string | null; priority: MaintenancePriorityType; status: MaintenanceStatusType; assignee_id?: string | null; estimated_cost?: number | null; actual_cost?: number | null; scheduled_date_start?: Date | null; scheduled_date_end?: Date | null; completed_date?: Date | null; vendor_name?: string | null; vendor_contact?: string | null; blocks_booking: boolean; }
export interface DocumentUploadPayload { file: File; name: string; description?: string | null; category: DocumentCategoryType; expires_at?: Date | null; folder_id?: string | null; linked_expense_id?: string | null; }
export interface FolderFormData { name: string; parent_folder_id?: string | null; }
export interface StaticDocumentCategory { id: DocumentCategoryType; name: string; }
export interface AddExpenseContextPayload { description: string; amount: number; date: Date; category: ExpenseCategoryType; paid_by_user_id: string; split_method: SplitMethodType; notes?: string | null; receipt_file?: File | null; percentage_splits?: Record<string, number | null>; custom_splits?: Record<string, number | null>; }
export interface UpdateExpenseContextPayload extends AddExpenseContextPayload { existing_receipt_url?: string | null; remove_receipt?: boolean; }

// --- RPC Argument Types ---
export interface RpcSplitInput { user_id: string; amount: number | null; status: SplitStatusType; }
export interface AddExpenseRpcArgs { p_property_id: string; p_date: string; p_category: ExpenseCategoryType; p_amount: number; p_description: string | null; p_receipt_url: string | null; p_paid_by_user_id: string; p_split_method: SplitMethodType; p_notes: string | null; p_splits: RpcSplitInput[]; }
export interface UpdateExpenseRpcArgs { p_expense_id: string; p_description: string; p_amount: number; p_date: string; p_category: ExpenseCategoryType; p_paid_by_user_id: string; p_split_method: SplitMethodType; p_notes: string | null; p_splits: RpcSplitInput[]; p_receipt_url: string | null | undefined; }

// --- Utility & Database Structure ---
export type DbResult<T> = { data: T | null; error: Error | null; };
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type TablesRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

// --- Main Database Interface ---
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Profile, 'id' | 'created_at'>>; };
      properties: { Row: Property; Insert: Omit<Property, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Property, 'id' | 'created_at' | 'created_by'>>; };
      property_members: { Row: PropertyMember; Insert: Omit<PropertyMember, 'id' | 'created_at'>; Update: Partial<Omit<PropertyMember, 'id' | 'created_at' | 'property_id' | 'user_id'>>; };
      expenses: { Row: ExpenseRow; Insert: Omit<ExpenseRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<ExpenseRow, 'id' | 'created_at' | 'property_id'>>; };
      expense_splits: { Row: ExpenseSplitRow; Insert: Omit<ExpenseSplitRow, 'id' | 'created_at'>; Update: Partial<Omit<ExpenseSplitRow, 'id' | 'created_at' | 'expense_id' | 'user_id'>>; };
      recurring_expenses: { Row: RecurringExpenseRow; Insert: Omit<RecurringExpenseRow, 'id' | 'created_at' | 'updated_at' | 'next_due_date'>; Update: Partial<Omit<RecurringExpenseRow, 'id' | 'created_at' | 'property_id' | 'created_by'>>; };
      // --- CORRECTED Bookings Definition ---
      bookings: { Row: BookingRow; Insert: Omit<BookingRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<BookingRow, 'id' | 'created_at' | 'property_id' | 'user_id'>>; };
      maintenance_tasks: { Row: MaintenanceTaskRow; Insert: Omit<MaintenanceTaskRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<MaintenanceTaskRow, 'id' | 'created_at' | 'property_id'>>; };
      document_folders: { Row: DocumentFolder; Insert: Omit<DocumentFolder, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<DocumentFolder, 'id' | 'created_at' | 'property_id' | 'created_by'>>; };
      documents: { Row: DocumentRow; Insert: Omit<DocumentRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<DocumentRow, 'id' | 'created_at' | 'property_id' | 'storage_path' | 'uploaded_by'>>; };
    };
    Views: { [_ in never]: never };
    Functions: {
        add_expense_and_splits: { Args: AddExpenseRpcArgs; Returns: { id: string; }[]; };
        update_expense_and_recalculate_splits: { Args: UpdateExpenseRpcArgs; Returns: boolean; };
        delete_expense_and_splits: { Args: { p_expense_id: string }; Returns: boolean; };
        get_property_finances: { Args: { p_property_id: string; p_start_date: string; p_end_date: string }; Returns: { total_income: number; total_expenses: number; net_income: number; expenses_by_category: Json; }; };
        generate_expenses: { Args: {}; Returns: { message: string }; };
        invite_property_member: { Args: { p_property_id: string; p_invitee_email: string; p_role: MemberRoleType }; Returns: { member_id: string } | { error: string }; };
        update_property_member_role: { Args: { p_property_member_id: string; p_new_role: MemberRoleType }; Returns: { success: boolean } | { error: string }; };
        remove_property_member: { Args: { p_property_member_id: string }; Returns: { success: boolean } | { error: string }; };
    };
    Enums: {
      member_role: MemberRoleType;
      maintenance_status: MaintenanceStatusType;
      maintenance_priority: MaintenancePriorityType;
      expense_category: ExpenseCategoryType;
      recurring_expense_category: RecurringExpenseCategoryType;
      recurring_expense_frequency: FrequencyType;
      expense_split_method: SplitMethodType;
      booking_status: BookingStatusType;
      document_category: DocumentCategoryType;
      expense_split_status: SplitStatusType;
    };
    CompositeTypes: { [_ in never]: never };
  };
}