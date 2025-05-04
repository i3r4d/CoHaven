// src/hooks/useActionableMaintenance.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
    MaintenanceTask,
    MaintenanceTaskStatus,
    MaintenanceTaskPriority,
    Profile // Keep Profile type for potential future use if needed
} from '@/integrations/supabase/types';
import { useProperty } from '@/contexts/PropertyContext';
import { useAuth } from '@/contexts/AuthContext';
import { PostgrestError } from '@supabase/supabase-js';

interface UseActionableMaintenanceResult {
    actionableTasks: MaintenanceTask[];
    isLoading: boolean;
    error: PostgrestError | null;
    refetch: () => void;
}

// Raw query result type - remove profile fields
type RawTaskQueryResult = Omit<MaintenanceTask, 'status' | 'priority' | 'assignee_profile' | 'created_by_profile' | 'linked_expense'> & {
    status: string;
    priority: string;
};

// Cache stores MaintenanceTask[]
let cache = {
    data: [] as MaintenanceTask[],
    timestamp: 0,
    propertyId: '',
};
const CACHE_DURATION = 60 * 1000;

// Hook takes only limit as confirmed by previous error
export const useActionableMaintenance = (limit: number = 5): UseActionableMaintenanceResult => {
    const { selectedProperty } = useProperty();
    const { user } = useAuth();
    const [actionableTasks, setActionableTasks] = useState<MaintenanceTask[]>(cache.data);
    const [isLoading, setIsLoading] = useState<boolean>(!cache.data.length);
    const [error, setError] = useState<PostgrestError | null>(null);

    const fetchActionableTasks = useCallback(async () => {
        // Get property ID inside callback to ensure it's fresh
        const currentPropertyId = selectedProperty?.id;

        if (!currentPropertyId || !user) {
            setActionableTasks([]);
            setIsLoading(false);
            setError(null);
            cache = { data: [], timestamp: 0, propertyId: '' };
            return;
        }

        const now = Date.now();
        if (cache.propertyId === currentPropertyId && (now - cache.timestamp < CACHE_DURATION)) {
             console.log("useActionableMaintenance: Using cached data");
             if (JSON.stringify(actionableTasks) !== JSON.stringify(cache.data)) {
                 setActionableTasks(cache.data);
             }
             setIsLoading(false); setError(null); return;
        }

        console.log("useActionableMaintenance: Fetching actionable tasks for property:", currentPropertyId);
        setIsLoading(true); setError(null);

        try {
            // --- CORRECTED: Removed profile joins from select ---
            const { data: rawData, error: fetchError } = await supabase
                .from('maintenance_tasks')
                .select('*') // Fetch all direct columns
                .eq('property_id', currentPropertyId)
                .neq('status', 'Completed')
                .neq('status', 'Cancelled')
                .not('scheduled_date_start', 'is', null)
                .order('scheduled_date_start', { ascending: true })
                .limit(limit);

            if (fetchError) { throw fetchError; }

            // Map raw data to MaintenanceTask type
            const mappedTasks: MaintenanceTask[] = (rawData || []).map((rawTask: RawTaskQueryResult) => {
                 // Assignee_profile and created_by_profile will be undefined/null here
                 // as they are not selected. The MaintenanceTask type allows them to be optional.
                return {
                    ...rawTask, // Spread raw columns
                    status: rawTask.status as MaintenanceTaskStatus, // Cast enums
                    priority: rawTask.priority as MaintenanceTaskPriority,
                    assignee_profile: null, // Explicitly set to null as not fetched
                    created_by_profile: null, // Explicitly set to null as not fetched
                };
            });

            console.log("useActionableMaintenance: Mapped tasks:", mappedTasks.length);
            setActionableTasks(mappedTasks);

            cache = { data: mappedTasks, timestamp: Date.now(), propertyId: currentPropertyId };

        } catch (err: any) {
            console.error("Error fetching/mapping actionable maintenance tasks:", err);
            setError(err as PostgrestError);
            setActionableTasks([]);
            cache = { data: [], timestamp: 0, propertyId: '' };
        } finally { setIsLoading(false); }
    // Depend on selectedProperty object itself to refetch when it changes
    }, [selectedProperty, user, limit, actionableTasks]); // Keep actionableTasks to sync state? Review if causes loops. Maybe remove.

    // Refetch when property changes
    useEffect(() => {
        fetchActionableTasks();
    }, [selectedProperty?.id, fetchActionableTasks]); // Depend on ID and callback

    const refetch = useCallback(() => {
        cache.timestamp = 0;
        fetchActionableTasks();
    }, [fetchActionableTasks]);

    return { actionableTasks, isLoading, error, refetch };
};