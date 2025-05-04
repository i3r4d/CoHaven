// src/contexts/MaintenanceContext.tsx
// v2 - Removed explicit setting of 'updated_at' in updateTask payload.

import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
  ReactNode,
  useMemo,
} from 'react';
import { supabase } from '../integrations/supabase/client';
import * as Types from '@/integrations/supabase/types';
import { useAuth } from './AuthContext';
import { useProperty } from './PropertyContext';
import { PostgrestError } from '@supabase/supabase-js';

const MaintenanceContext = createContext<Types.MaintenanceContextType | undefined>(
  undefined
);

// Helper function mapRowToMaintenanceTask (No Changes)
const mapRowToMaintenanceTask = (
  row: Types.MaintenanceTaskRow,
  members: Types.PropertyMemberWithProfile[]
): Types.MaintenanceTask => {
  const assigneeProfile = members.find(m => m.user_id === row.assignee_id)?.profile || null;
  // Corrected DB column name based on schema: created_by (was reported_by)
  const reportedByProfile = members.find(m => m.user_id === row.created_by)?.profile || null;

  return {
    ...row,
    status: row.status as Types.MaintenanceTaskStatus,
    priority: row.priority as Types.MaintenanceTaskPriority,
    assignee_profile: assigneeProfile ? {
        id: assigneeProfile.id,
        first_name: assigneeProfile.first_name,
        last_name: assigneeProfile.last_name,
        avatar_url: assigneeProfile.avatar_url,
        email: assigneeProfile.email,
    } : null,
    reported_by_profile: reportedByProfile ? {
         id: reportedByProfile.id,
         first_name: reportedByProfile.first_name,
         last_name: reportedByProfile.last_name,
         avatar_url: reportedByProfile.avatar_url,
         email: reportedByProfile.email,
    } : null,
    linked_expense: null, // Placeholder for future logic
  };
};

export const MaintenanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session, user } = useAuth();
  const { selectedProperty, propertyMembers = [] } = useProperty();
  const [tasks, setTasks] = useState<Types.MaintenanceTask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // fetchTasks (No Changes)
  const fetchTasks = useCallback(async () => {
    if (!selectedProperty || !session) { setTasks([]); return; }
    console.log("MaintenanceContext: Fetching tasks for property:", selectedProperty.id);
    setIsLoading(true); setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .eq('property_id', selectedProperty.id)
        .order('created_at', { ascending: false });
      if (dbError) throw dbError;
      if (data) {
         const mappedTasks = data.map(row => mapRowToMaintenanceTask(row as Types.MaintenanceTaskRow, propertyMembers));
         setTasks(mappedTasks);
         console.log("MaintenanceContext: Fetched tasks:", mappedTasks.length);
      } else { setTasks([]); console.log("MaintenanceContext: No tasks found."); }
    } catch (err) {
      console.error("Error fetching maintenance tasks:", err);
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch tasks');
      setError(fetchError); setTasks([]);
    } finally { setIsLoading(false); }
  }, [selectedProperty, session, propertyMembers]);

  // useEffect for fetchTasks (No Changes)
  useEffect(() => {
    if (selectedProperty?.id && session) { fetchTasks(); }
    else { setTasks([]); setIsLoading(false); setError(null); }
  }, [selectedProperty?.id, session, fetchTasks]);

  // getTaskById (No Changes)
  const getTaskById = useCallback((taskId: string): Types.MaintenanceTask | undefined => {
      return tasks.find(task => task.id === taskId);
  }, [tasks]);

  // addTask (Corrected usage of created_by)
  const addTask = async (
        taskData: Omit<Types.TablesInsert<'maintenance_tasks'>, 'id' | 'created_at' | 'property_id' | 'created_by'> // Removed updated_at assumption
    ): Promise<Types.DbResult<Types.MaintenanceTask>> => {
    if (!selectedProperty || !session || !user) { /* error handling */ }
    setIsLoading(true); setError(null);
    try {
       // Ensure payload matches DB schema (created_by exists)
       const insertData: Types.TablesInsert<'maintenance_tasks'> = {
         ...taskData,
         property_id: selectedProperty.id,
         created_by: user.id, // Use created_by based on schema
         status: taskData.status || Types.MaintenanceTaskStatus.Pending,
         priority: taskData.priority || Types.MaintenanceTaskPriority.Medium,
         blocks_booking: taskData.blocks_booking ?? false,
         scheduled_date_start: taskData.scheduled_date_start,
         scheduled_date_end: taskData.scheduled_date_end,
         completed_at: taskData.completed_at, // Make sure this matches DB column if used
       };
      console.log("MaintenanceContext: Adding task:", insertData);
      const { data, error: dbError } = await supabase.from('maintenance_tasks').insert(insertData).select('*').single();
      if (dbError) throw dbError;
      if (!data) throw new Error("No data returned after insert.");
      const newTask = mapRowToMaintenanceTask(data as Types.MaintenanceTaskRow, propertyMembers);
      setTasks(prevTasks => [newTask, ...prevTasks]);
      console.log("MaintenanceContext: Task added successfully:", newTask.id);
      setIsLoading(false);
      return { data: newTask, error: null };
    } catch (err) { /* error handling */ }
  };


 // updateTask (REMOVED updated_at line)
 const updateTask = async (
    taskId: string,
    taskData: Partial<Types.TablesUpdate<'maintenance_tasks'>>
 ): Promise<Types.DbResult<Types.MaintenanceTask>> => {

    if (!selectedProperty || !session) {
        const error = new Error("No property selected or user not authenticated.");
        setError(error);
        return { data: null, error };
    }

    // Destructure to get only valid update fields, excluding non-existent 'updated_at' or potentially others
    const {
        id,
        property_id,
        created_at,
        created_by, // Ensure created_by is not in update payload if it shouldn't change
        // Add any other columns from taskData that SHOULD NOT be updated here
        ...updateData // Contains only fields intended for update
    } = taskData;


    if (Object.keys(updateData).length === 0) {
        console.warn("MaintenanceContext: Update task called with no data to update.");
        const existingTask = getTaskById(taskId);
        return existingTask ? { data: existingTask, error: null } : {data: null, error: new Error("Task not found")};
    }

    // REMOVED: This line caused the error as 'updated_at' column doesn't exist
    // updateData.updated_at = new Date().toISOString();

    setIsLoading(true);
    setError(null);

    try {
        console.log("MaintenanceContext: Updating task:", taskId, "with data:", updateData);

        const { data, error: dbError } = await supabase
            .from('maintenance_tasks')
            .update(updateData) // Send only the relevant update data
            .eq('id', taskId)
            .eq('property_id', selectedProperty.id) // Ensure task belongs to property
            .select('*')
            .single();

        if (dbError) throw dbError;
        if (!data) throw new Error("No data returned after update.");

        const updatedTask = mapRowToMaintenanceTask(data as Types.MaintenanceTaskRow, propertyMembers);

        setTasks(prevTasks =>
            prevTasks.map(task => (task.id === taskId ? updatedTask : task))
        );
        console.log("MaintenanceContext: Task updated successfully:", updatedTask.id);
        setIsLoading(false);
        return { data: updatedTask, error: null };

    } catch (err) {
        console.error("Error updating maintenance task:", err);
        // Provide more specific error if available
        const message = err instanceof Error ? err.message : 'Failed to update maintenance task';
        const updateError = new Error(message);
        // If it's a PostgrestError, include details
        if (err && typeof err === 'object' && 'details' in err && err.details) {
             updateError.message += ` (${(err as PostgrestError).details})`;
        }
        setError(updateError);
        setIsLoading(false);
        return { data: null, error: updateError };
    }
 };


 // deleteTask (No Changes)
 const deleteTask = async (taskId: string): Promise<Types.DbResult<null>> => {
    if (!selectedProperty || !session) { /* error handling */ }
    setIsLoading(true); setError(null);
    try {
        console.log("MaintenanceContext: Deleting task:", taskId);
        const { error: dbError } = await supabase.from('maintenance_tasks').delete().eq('id', taskId).eq('property_id', selectedProperty.id);
        if (dbError) throw dbError;
        setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
        console.log("MaintenanceContext: Task deleted successfully:", taskId);
        setIsLoading(false);
        return { data: null, error: null };
    } catch (err) { /* error handling */ }
 };

 // contextValue (No Changes)
 const contextValue = useMemo(() => ({
    tasks, isLoading, error, fetchTasks, getTaskById, addTask, updateTask, deleteTask,
  }), [tasks, isLoading, error, fetchTasks, getTaskById, addTask, updateTask, deleteTask]);

  return (
    <MaintenanceContext.Provider value={contextValue}>
      {children}
    </MaintenanceContext.Provider>
  );
};

// useMaintenance hook (No Changes)
export const useMaintenance = (): Types.MaintenanceContextType => {
  const context = useContext(MaintenanceContext);
  if (context === undefined) {
    throw new Error('useMaintenance must be used within a MaintenanceProvider');
  }
  return context;
};