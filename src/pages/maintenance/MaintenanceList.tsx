
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusIcon,
  CheckIcon,
  Clock3Icon,
  XIcon,
  FilterIcon,
  SearchIcon,
  CalendarIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProperty } from "@/contexts/PropertyContext";
import { format } from "date-fns";
import { Database } from '@/integrations/supabase/types';

type MaintenanceTask = Database['public']['Tables']['maintenance_tasks']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface TaskWithAssignee extends MaintenanceTask {
  assignee?: Profile;
  creator?: Profile;
}

const MaintenanceList = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedProperty, propertyMembers } = useProperty();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [editingTask, setEditingTask] = useState<TaskWithAssignee | null>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    assignee_id: "",
    due_date: "",
    estimated_cost: "",
  });

  // Fetch tasks for the selected property
  useEffect(() => {
    const fetchTasks = async () => {
      if (!selectedProperty) {
        setTasks([]);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase
          .from('maintenance_tasks')
          .select('*')
          .eq('property_id', selectedProperty.id);
          
        if (error) throw error;
        
        // Fetch profiles for assignees and creators
        const userIds = Array.from(new Set(
          (data || []).flatMap(task => [
            task.assignee_id, 
            task.created_by
          ]).filter(Boolean) as string[]
        ));
        
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);
          
        if (profilesError && userIds.length > 0) throw profilesError;
        
        // Build profiles lookup map
        const profilesMap: Record<string, Profile> = {};
        (profilesData || []).forEach(profile => {
          profilesMap[profile.id] = profile;
        });
        
        setProfiles(profilesMap);
        
        // Merge tasks with assignee profiles
        const tasksWithProfiles: TaskWithAssignee[] = (data || []).map(task => {
          return {
            ...task,
            assignee: task.assignee_id ? profilesMap[task.assignee_id] : undefined,
            creator: task.created_by ? profilesMap[task.created_by] : undefined,
          };
        });
        
        setTasks(tasksWithProfiles);
      } catch (error: any) {
        console.error("Error fetching tasks:", error);
        toast({
          title: "Error",
          description: "Failed to load maintenance tasks",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTasks();
  }, [selectedProperty]);
  
  // Reset form when dialog closes
  useEffect(() => {
    if (!isDialogOpen) {
      setEditingTask(null);
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        assignee_id: "",
        due_date: "",
        estimated_cost: "",
      });
    }
  }, [isDialogOpen]);
  
  // Set form data when editing a task
  useEffect(() => {
    if (editingTask) {
      setFormData({
        title: editingTask.title,
        description: editingTask.description,
        priority: editingTask.priority,
        assignee_id: editingTask.assignee_id || "",
        due_date: editingTask.due_date ? format(new Date(editingTask.due_date), 'yyyy-MM-dd') : "",
        estimated_cost: editingTask.estimated_cost ? String(editingTask.estimated_cost) : "",
      });
    }
  }, [editingTask]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Filter tasks based on search and status
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProperty || !user) {
      toast({
        title: "Error",
        description: "Missing property or user information",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const taskData = {
        property_id: selectedProperty.id,
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        assignee_id: formData.assignee_id || null,
        due_date: formData.due_date || null,
        estimated_cost: formData.estimated_cost ? parseFloat(formData.estimated_cost) : null,
        status: editingTask ? editingTask.status : "pending",
        created_by: editingTask ? editingTask.created_by : user.id,
      };
      
      if (editingTask) {
        // Update existing task
        const { error } = await supabase
          .from('maintenance_tasks')
          .update(taskData)
          .eq('id', editingTask.id);
          
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Task has been updated successfully.",
        });
      } else {
        // Insert new task
        const { error } = await supabase
          .from('maintenance_tasks')
          .insert(taskData);
          
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Task has been added successfully.",
        });
      }
      
      // Refresh tasks
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .eq('property_id', selectedProperty.id);
        
      if (!error && data) {
        // Update user profiles if needed
        const userIds = Array.from(new Set(
          data.flatMap(task => [
            task.assignee_id, 
            task.created_by
          ]).filter(Boolean) as string[]
        ));
        
        // Check if we need to fetch new profiles
        const missingProfileIds = userIds.filter(id => !profiles[id]);
        
        if (missingProfileIds.length > 0) {
          const { data: newProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', missingProfileIds);
            
          const updatedProfiles = { ...profiles };
          newProfiles?.forEach(profile => {
            updatedProfiles[profile.id] = profile;
          });
          
          setProfiles(updatedProfiles);
        }
        
        // Merge tasks with profiles
        const tasksWithProfiles = data.map(task => ({
          ...task,
          assignee: task.assignee_id ? profiles[task.assignee_id] : undefined,
          creator: task.created_by ? profiles[task.created_by] : undefined,
        }));
        
        setTasks(tasksWithProfiles);
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  
  const handleUpdateTaskStatus = async (task: TaskWithAssignee, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('maintenance_tasks')
        .update({ status: newStatus })
        .eq('id', task.id);
        
      if (error) throw error;
      
      // Update task in local state
      setTasks(tasks.map(t => 
        t.id === task.id ? { ...t, status: newStatus } : t
      ));
      
      toast({
        title: "Success",
        description: `Task marked as ${newStatus}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteTask = async (task: TaskWithAssignee) => {
    if (!window.confirm("Are you sure you want to delete this task?")) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('maintenance_tasks')
        .delete()
        .eq('id', task.id);
        
      if (error) throw error;
      
      // Remove task from local state
      setTasks(tasks.filter(t => t.id !== task.id));
      
      toast({
        title: "Success",
        description: "Task has been deleted",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckIcon className="mr-2 h-4 w-4 text-green-500" />;
      case "in-progress":
        return <Clock3Icon className="mr-2 h-4 w-4 text-blue-500" />;
      case "pending":
        return <Clock3Icon className="mr-2 h-4 w-4 text-yellow-500" />;
      case "cancelled":
        return <XIcon className="mr-2 h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in-progress":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600";
      case "urgent":
        return "text-red-700 font-bold";
      case "medium":
        return "text-amber-600";
      case "low":
        return "text-green-600";
      default:
        return "";
    }
  };
  
  const getUserName = (userId?: string | null) => {
    if (!userId) return "Unassigned";
    
    const profile = profiles[userId];
    if (profile) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    
    if (userId === user?.id) {
      return "You";
    }
    
    return "Unknown User";
  };

  if (!selectedProperty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-xl font-serif font-medium mb-2">
            No Property Selected
          </h3>
          <p className="text-muted-foreground mb-6">
            Please select or create a property to manage maintenance tasks
          </p>
          <Button 
            onClick={() => window.location.href = "/properties"}
            className="bg-navy-900 hover:bg-navy-800"
          >
            Go to Properties
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-serif font-bold text-navy-900">
          Maintenance & Tasks
        </h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-navy-900 hover:bg-navy-800">
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="font-serif">
                {editingTask ? "Edit Task" : "Add New Task"}
              </DialogTitle>
              <DialogDescription>
                {editingTask
                  ? "Update the task details"
                  : "Enter the details of the maintenance task or issue"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleTaskSubmit}>
              <div className="grid gap-6 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="e.g., Fix leaking faucet"
                    value={formData.title}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Provide details about the task or issue"
                    value={formData.description}
                    onChange={handleInputChange}
                    required
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => handleSelectChange("priority", value)}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="assignee_id">Assign To</Label>
                    <Select
                      value={formData.assignee_id}
                      onValueChange={(value) => handleSelectChange("assignee_id", value)}
                    >
                      <SelectTrigger id="assignee_id">
                        <SelectValue placeholder="Select person" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {propertyMembers
                          .filter(member => member.property_id === selectedProperty.id)
                          .map(member => {
                            const memberProfile = profiles[member.user_id];
                            const displayName = memberProfile
                              ? `${memberProfile.first_name} ${memberProfile.last_name}`
                              : member.user_id === user?.id
                                ? "You"
                                : "Unknown User";
                            
                            return (
                              <SelectItem key={member.user_id} value={member.user_id}>
                                {displayName}
                              </SelectItem>
                            );
                          })
                        }
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="due_date">Due Date</Label>
                    <div className="relative">
                      <Input
                        id="due_date"
                        name="due_date"
                        type="date"
                        value={formData.due_date}
                        onChange={handleInputChange}
                      />
                      <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="estimated_cost">Estimated Cost</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="estimated_cost"
                        name="estimated_cost"
                        type="number"
                        min="0"
                        step="0.01"
                        className="pl-8"
                        placeholder="0.00"
                        value={formData.estimated_cost}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-navy-900 hover:bg-navy-800">
                  {editingTask ? "Update Task" : "Add Task"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px] flex-shrink-0">
                <FilterIcon className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Maintenance Tasks</CardTitle>
          <CardDescription>
            View and manage maintenance tasks for {selectedProperty.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="border rounded-lg p-4 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTasks.length > 0 ? (
            <div className="space-y-4">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium">{task.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {task.description}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs font-medium flex items-center whitespace-nowrap",
                        getStatusClass(task.status)
                      )}
                    >
                      {getStatusIcon(task.status)}
                      {task.status}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Assignee:</span>{" "}
                      <span className="font-medium">
                        {getUserName(task.assignee_id)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Due:</span>{" "}
                      <span className="font-medium">
                        {task.due_date 
                          ? format(new Date(task.due_date), 'MMM d, yyyy') 
                          : "Not set"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Priority:</span>{" "}
                      <span className={cn("font-medium capitalize", getPriorityClass(task.priority))}>
                        {task.priority}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Est. Cost:</span>{" "}
                      <span className="font-medium">
                        {task.estimated_cost 
                          ? `$${parseFloat(task.estimated_cost.toString()).toFixed(2)}` 
                          : "$0.00"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Task Actions */}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        setEditingTask(task);
                        setIsDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    
                    {task.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={() => handleUpdateTaskStatus(task, 'in-progress')}
                      >
                        Start Task
                      </Button>
                    )}
                    
                    {task.status === 'in-progress' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-green-200 text-green-700 hover:bg-green-50"
                        onClick={() => handleUpdateTaskStatus(task, 'completed')}
                      >
                        Mark Complete
                      </Button>
                    )}
                    
                    {(task.status === 'pending' || task.status === 'in-progress') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => handleUpdateTaskStatus(task, 'cancelled')}
                      >
                        Cancel
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteTask(task)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || statusFilter !== "all" 
                ? "No tasks matching your filters." 
                : "No maintenance tasks found. Click \"Add Task\" to create your first task."}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance History */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Completed Maintenance</CardTitle>
          <CardDescription>
            View completed maintenance for your property
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-navy-900 rounded-full border-t-transparent"></div>
            </div>
          ) : tasks.filter(task => task.status === 'completed').length > 0 ? (
            <div className="space-y-3">
              {tasks
                .filter(task => task.status === 'completed')
                .map((task) => (
                  <div
                    key={task.id}
                    className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{task.title}</h4>
                        <p className="text-xs text-muted-foreground">
                          Completed by {getUserName(task.assignee_id)}
                        </p>
                      </div>
                      {task.estimated_cost && (
                        <div className="text-sm font-medium">
                          ${parseFloat(task.estimated_cost.toString()).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No completed maintenance tasks found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MaintenanceList;
