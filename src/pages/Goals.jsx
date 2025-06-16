import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, Target, Calendar, Archive, Edit2, Trash2 } from 'lucide-react'

const Goals = () => {
  const [goals, setGoals] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    deadline: ''
  })

  useEffect(() => {
    fetchGoals()
  }, [])

  const fetchGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('goals')
        .select(`
          *,
          tasks (
            id,
            title,
            task_logs (
              status,
              due_date
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      setGoals(data || [])
    } catch (error) {
      console.error('Error fetching goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateGoalProgress = (goal) => {
    if (!goal.tasks || goal.tasks.length === 0) return 0 // Start at neutral when no tasks
    
    const now = new Date()
    const goalStartDate = new Date(goal.created_at)
    const goalDeadline = new Date(goal.deadline)
    const totalGoalDays = Math.max(1, Math.ceil((goalDeadline - goalStartDate) / (1000 * 60 * 60 * 24)))
    const daysElapsed = Math.max(0, Math.ceil((now - goalStartDate) / (1000 * 60 * 60 * 24)))
    
    // Collect all task logs for this goal
    const allLogs = []
    goal.tasks.forEach(task => {
      if (task.task_logs) {
        task.task_logs.forEach(log => {
          allLogs.push({
            ...log,
            taskId: task.id,
            taskTitle: task.title
          })
        })
      }
    })
    
    if (allLogs.length === 0) return 0 // Start at neutral when no logs
    
    // Sort logs by date
    allLogs.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    
    // Calculate basic completion rate
    const completed = allLogs.filter(log => log.status === 'completed').length
    const missed = allLogs.filter(log => log.status === 'missed').length
    const pending = allLogs.filter(log => log.status === 'pending').length
    const total = allLogs.length
    
    if (total === 0) return 0
    
    // Base score from completion rate (0-100 scale)
    const completionRate = completed / total
    let baseScore = (completionRate * 100) - 50 // Scale to -50 to +50, with 50% completion = 0
    
    // Early goal grace period - be much more forgiving in the first week
    const isEarlyStage = daysElapsed <= 7
    const isVeryEarly = daysElapsed <= 3
    
    if (isVeryEarly) {
      // In first 3 days, focus only on positive progress
      if (completed > 0) {
        baseScore = Math.max(0, (completed / Math.max(completed + missed, 1)) * 30) // Max +30 in first 3 days
      } else if (missed === 0 && pending > 0) {
        baseScore = 0 // Neutral if no misses yet
      } else {
        baseScore = Math.max(-15, baseScore) // Cap negative impact in first 3 days
      }
    } else if (isEarlyStage) {
      // In first week, be more forgiving
      baseScore = baseScore * 0.6 // Reduce impact by 40%
      if (completed > missed) {
        baseScore = Math.max(baseScore, 5) // Slight positive bias if more completed than missed
      }
    }
    
    // Streak bonus/penalty (but lighter in early stages)
    let streakAdjustment = 0
    let currentStreak = 0
    let currentMissStreak = 0
    
    // Calculate current streak from most recent
    const recentLogs = [...allLogs].reverse()
    for (const log of recentLogs) {
      if (log.status === 'completed') {
        currentStreak++
        break
      } else if (log.status === 'missed') {
        currentMissStreak++
      } else {
        break // Stop at pending
      }
    }
    
    // Streak bonuses (reduced in early stages)
    const streakMultiplier = isEarlyStage ? 0.5 : 1.0
    if (currentStreak >= 3) {
      streakAdjustment = Math.min(20, currentStreak * 3) * streakMultiplier
    } else if (currentMissStreak >= 2 && !isVeryEarly) {
      streakAdjustment = -Math.min(15, currentMissStreak * 4) * streakMultiplier
    }
    
    // Timeline awareness (only after first week)
    let timelineAdjustment = 0
    if (!isEarlyStage && total >= 7) {
      const timelineProgress = daysElapsed / totalGoalDays
      const expectedCompletionRate = 0.7 // Expect 70% for neutral (more realistic)
      const actualRate = completionRate
      const progressGap = actualRate - expectedCompletionRate
      
      // Only apply significant timeline pressure after 25% through goal
      if (timelineProgress > 0.25) {
        if (progressGap > 0.2) {
          timelineAdjustment = Math.min(15, progressGap * 30) // Bonus for being ahead
        } else if (progressGap < -0.3) {
          // More gradual penalty, increasing with timeline progress
          const urgency = Math.min(1, timelineProgress)
          timelineAdjustment = Math.max(-25, progressGap * 25 * urgency)
        }
      }
    }
    
    // Recent performance weight (last 7 days)
    let recentAdjustment = 0
    if (total >= 3) {
      const recent = allLogs.slice(-7) // Last 7 task logs
      const recentCompleted = recent.filter(log => log.status === 'completed').length
      const recentMissed = recent.filter(log => log.status === 'missed').length
      const recentTotal = recent.length
      
      if (recentTotal > 0) {
        const recentRate = recentCompleted / recentTotal
        const overallRate = completionRate
        const recentTrend = recentRate - overallRate
        
        // Small adjustment based on recent trend
        recentAdjustment = recentTrend * 10
      }
    }
    
    // Combine all factors
    const finalScore = baseScore + streakAdjustment + timelineAdjustment + recentAdjustment
    
    // Return capped score
    return Math.max(-100, Math.min(100, Math.round(finalScore)))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (editingGoal) {
        const { error } = await supabase
          .from('goals')
          .update(formData)
          .eq('id', editingGoal.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('goals')
          .insert([{ ...formData, user_id: user.id }])
        
        if (error) throw error
      }

      setFormData({ title: '', description: '', category: '', deadline: '' })
      setShowForm(false)
      setEditingGoal(null)
      fetchGoals()
    } catch (error) {
      console.error('Error saving goal:', error)
    }
  }

  const handleEdit = (goal) => {
    setEditingGoal(goal)
    setFormData({
      title: goal.title,
      description: goal.description || '',
      category: goal.category,
      deadline: goal.deadline
    })
    setShowForm(true)
  }

  const handleArchive = async (goalId) => {
    try {
      const { error } = await supabase
        .from('goals')
        .update({ is_archived: true })
        .eq('id', goalId)

      if (error) throw error
      fetchGoals()
    } catch (error) {
      console.error('Error archiving goal:', error)
    }
  }

  const handleDelete = async (goalId) => {
    if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', goalId)

      if (error) throw error
      fetchGoals()
    } catch (error) {
      console.error('Error deleting goal:', error)
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
        <h1>Goals</h1>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
        >
          <Plus size={20} />
          New Goal
        </button>
      </div>

      {/* Goal Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="glass-strong w-full max-w-md p-6">
            <h2 className="mb-4">{editingGoal ? 'Edit Goal' : 'Create New Goal'}</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="form-input"
                  placeholder="Enter goal title"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-input form-textarea"
                  placeholder="Describe your goal"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category *</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="form-input"
                  placeholder="e.g., Health, Business, Finance"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Deadline *</label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="form-input"
                  required
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>

              <div className="flex gap-3">
                <button type="submit" className="btn btn-primary flex-1">
                  {editingGoal ? 'Update Goal' : 'Create Goal'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditingGoal(null)
                    setFormData({ title: '', description: '', category: '', deadline: '' })
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <div className="glass card text-center py-12">
          <Target className="mx-auto mb-4 text-white/50" size={48} />
          <h3 className="mb-2">No Goals Yet</h3>
          <p className="text-white/70 mb-6">
            Create your first Wildly Important Goal to start your execution journey.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary"
          >
            <Plus size={20} />
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((goal) => {
            const progress = calculateGoalProgress(goal)
            
            // Convert -100 to +100 scale to 0-100% for progress bar width
            const progressBarWidth = Math.max(0, Math.min(100, ((progress + 100) / 2)))
            
            const getProgressStatus = (score) => {
              if (score <= -50) return { status: 'struggling', text: 'Struggling' }
              if (score < -10) return { status: 'struggling', text: 'Falling Behind' }
              if (score <= 10) return { status: 'maintaining', text: 'Maintaining' }
              if (score <= 50) return { status: 'excelling', text: 'Progressing' }
              return { status: 'excelling', text: 'Excelling' }
            }
            
            const getProgressClass = (score) => {
              if (score < -10) return 'losing'
              if (score <= 10) return 'neutral'
              return 'winning'
            }
            
            const progressStatus = getProgressStatus(progress)
            const progressClass = getProgressClass(progress)
            
            return (
              <div key={goal.id} className="glass card">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="goal-progress-container">
                      <div className="goal-progress-info mb-2">
                        <div>
                          <h3 className="font-semibold mb-1">{goal.title}</h3>
                          <p className="text-sm text-white/70">{goal.category}</p>
                        </div>
                        <span className={`goal-progress-percentage ${progressClass}`}>
                          {progress > 0 ? '+' : ''}{progress}
                        </span>
                      </div>
                      <div className="progress-bar mb-2">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${progressBarWidth}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`goal-progress-status ${progressStatus.status}`}>
                          {goal.tasks?.length === 0 ? 'No tasks yet' : progressStatus.text}
                        </span>
                        <span className="text-xs text-white/50">
                          {goal.tasks?.length || 0} tasks
                        </span>
                      </div>
                    </div>
                    {goal.description && (
                      <p className="text-sm text-white/60 mb-3">{goal.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleEdit(goal)}
                      className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleArchive(goal.id)}
                      className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
                    >
                      <Archive size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-white/70 hover:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-white/60">
                    <Calendar size={16} />
                    <span>Due: {format(new Date(goal.deadline), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="text-white/50">
                    Created {format(new Date(goal.created_at), 'MMM d')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Goals 