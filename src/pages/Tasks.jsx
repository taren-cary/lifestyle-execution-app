import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, CheckSquare, Clock, AlertCircle } from 'lucide-react'

const Tasks = () => {
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [todaysTasks, setTodaysTasks] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    title: '',
    goal_id: '',
    frequency: 'daily',
    custom_days: 1,
    start_date: format(new Date(), 'yyyy-MM-dd')
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch goals
      const { data: goalsData } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('title')

      // Fetch tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select(`
          *,
          goals (
            title,
            category
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      // Fetch today's task logs
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: todaysTasksData } = await supabase
        .from('task_logs')
        .select(`
          *,
          tasks (
            title,
            frequency,
            goals (
              title,
              category
            )
          )
        `)
        .eq('due_date', today)
        .order('created_at')

      setGoals(goalsData || [])
      setTasks(tasksData || [])
      setTodaysTasks(todaysTasksData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const taskData = {
        ...formData,
        custom_days: formData.frequency === 'custom' ? parseInt(formData.custom_days) : null
      }

      const { error } = await supabase
        .from('tasks')
        .insert([taskData])

      if (error) throw error

      setFormData({
        title: '',
        goal_id: '',
        frequency: 'daily',
        custom_days: 1,
        start_date: format(new Date(), 'yyyy-MM-dd')
      })
      setShowForm(false)
      fetchData()
    } catch (error) {
      console.error('Error creating task:', error)
    }
  }

  const markTaskComplete = async (taskLogId) => {
    try {
      const { error } = await supabase
        .from('task_logs')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', taskLogId)

      if (error) throw error
      fetchData()
    } catch (error) {
      console.error('Error marking task complete:', error)
    }
  }

  const getFrequencyText = (frequency, customDays) => {
    switch (frequency) {
      case 'daily': return 'Daily'
      case 'every_2_days': return 'Every 2 days'
      case 'weekly': return 'Weekly'
      case 'custom': return `Every ${customDays} days`
      default: return frequency
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'status-completed'
      case 'missed': return 'status-missed'
      case 'pending': return 'status-pending'
      default: return 'status-pending'
    }
  }

  if (loading) {
    return (
      <div className="container py-8">
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="container page-content space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1>Tasks</h1>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
          disabled={goals.length === 0}
        >
          <Plus size={20} />
          New Task
        </button>
      </div>

      {goals.length === 0 && (
        <div className="glass card text-center py-8">
          <AlertCircle className="mx-auto mb-4 text-orange-400" size={48} />
          <h3 className="mb-2">No Goals Available</h3>
          <p className="text-white/70">
            You need to create at least one goal before adding tasks.
          </p>
        </div>
      )}

      {/* Task Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="glass-strong w-full max-w-md p-6">
            <h2 className="mb-4">Create New Task</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Task Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="form-input"
                  placeholder="e.g., Morning workout, Read 30 minutes"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Goal *</label>
                <select
                  value={formData.goal_id}
                  onChange={(e) => setFormData({ ...formData, goal_id: e.target.value })}
                  className="form-input form-select"
                  required
                >
                  <option value="">Select a goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title} ({goal.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Frequency *</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className="form-input form-select"
                  required
                >
                  <option value="daily">Daily</option>
                  <option value="every_2_days">Every 2 days</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {formData.frequency === 'custom' && (
                <div className="form-group">
                  <label className="form-label">Every X Days</label>
                  <input
                    type="number"
                    value={formData.custom_days}
                    onChange={(e) => setFormData({ ...formData, custom_days: e.target.value })}
                    className="form-input"
                    min="1"
                    max="30"
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Start Date *</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="form-input"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button type="submit" className="btn btn-primary flex-1">
                  Create Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Today's Tasks */}
      <div className="glass card">
        <h2 className="mb-4">Today's Tasks</h2>
        {todaysTasks.length === 0 ? (
          <p className="text-white/70 text-center py-4">
            No tasks scheduled for today. Enjoy your free time!
          </p>
        ) : (
          <div className="space-y-3">
            {todaysTasks.map((taskLog) => (
              <div 
                key={taskLog.id} 
                className={`p-4 rounded-lg border transition-all ${getStatusColor(taskLog.status)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium">{taskLog.tasks?.title}</h3>
                    <p className="text-sm opacity-70">
                      {taskLog.tasks?.goals?.title} • {taskLog.tasks?.goals?.category}
                    </p>
                    <p className="text-xs opacity-60 mt-1">
                      {getFrequencyText(taskLog.tasks?.frequency, taskLog.tasks?.custom_days)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {taskLog.status === 'pending' && (
                      <button
                        onClick={() => markTaskComplete(taskLog.id)}
                        className="btn btn-success"
                      >
                        Complete
                      </button>
                    )}
                    {taskLog.status === 'completed' && (
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckSquare size={20} />
                        <span className="text-sm">Completed</span>
                      </div>
                    )}
                    {taskLog.status === 'missed' && (
                      <div className="flex items-center gap-2 text-red-400">
                        <Clock size={20} />
                        <span className="text-sm">Missed</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Tasks */}
      <div className="glass card">
        <h2 className="mb-4">All Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-white/70 text-center py-4">
            No tasks created yet. Add your first lead measure to get started!
          </p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium">{task.title}</h3>
                    <p className="text-sm text-white/70">
                      {task.goals?.title} • {task.goals?.category}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-white/60">
                      <span>{getFrequencyText(task.frequency, task.custom_days)}</span>
                      <span>Started: {format(new Date(task.start_date), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Tasks 