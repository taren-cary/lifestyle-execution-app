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
    
    // Advanced progress calculation with deadline awareness
    const now = new Date()
    const goalStartDate = new Date(goal.created_at)
    const goalDeadline = new Date(goal.deadline)
    const totalGoalDays = Math.max(1, Math.ceil((goalDeadline - goalStartDate) / (1000 * 60 * 60 * 24)))
    const daysElapsed = Math.max(0, Math.ceil((now - goalStartDate) / (1000 * 60 * 60 * 24)))
    const daysRemaining = Math.max(0, Math.ceil((goalDeadline - now) / (1000 * 60 * 60 * 24)))
    
    // Timeline progress (0 to 1)
    const timelineProgress = Math.min(1, daysElapsed / totalGoalDays)
    const timelineRemaining = Math.max(0, 1 - timelineProgress)
    
    // Deadline pressure factor (increases as deadline approaches)
    const deadlinePressure = timelineProgress > 0.5 ? 
      Math.pow((timelineProgress - 0.5) * 2, 1.5) : 0 // Exponential increase after 50%
    
    let totalScore = 0
    let totalWeight = 0
    let recentPerformance = 0
    let recentWeight = 0
    let streakBonus = 0
    let consistencyFactor = 1
    let timelineAdjustment = 0
    
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
    
    // Sort logs by date
    allLogs.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    
    if (allLogs.length === 0) return 0 // Start at neutral when no logs
    
    // Calculate expected progress based on timeline
    const totalTasksExpected = allLogs.length
    const expectedCompletionRate = 0.8 // Expect 80% completion for neutral progress
    const expectedScore = (timelineProgress * expectedCompletionRate * 2) - 1 // Scale to -1 to +1
    
    // Calculate time-weighted performance scores
    allLogs.forEach((log, index) => {
      const logDate = new Date(log.due_date)
      const daysFromStart = Math.max(0, Math.ceil((logDate - goalStartDate) / (1000 * 60 * 60 * 24)))
      const daysFromNow = Math.max(0, Math.ceil((now - logDate) / (1000 * 60 * 60 * 24)))
      const logTimelinePosition = daysFromStart / totalGoalDays
      
      // Time decay factor - recent tasks matter more, especially near deadline
      const baseDecay = Math.exp(-daysFromNow / 14) // 14-day half-life
      const deadlineDecay = deadlinePressure > 0 ? Math.exp(-daysFromNow / 7) : baseDecay // 7-day half-life near deadline
      const timeDecay = Math.max(baseDecay, deadlineDecay * deadlinePressure)
      
      // Position weight - later tasks matter more, amplified by deadline pressure
      const basePositionWeight = Math.min(2, 1 + logTimelinePosition)
      const deadlinePositionWeight = deadlinePressure > 0 ? 
        Math.min(3, basePositionWeight * (1 + deadlinePressure)) : basePositionWeight
      
      // Calculate base score for this task with deadline pressure
      let taskScore = 0
      const basePenalty = 1.0
      const baseReward = 1.0
      
      // Deadline pressure multiplier (1.0 to 2.5x)
      const pressureMultiplier = 1 + (deadlinePressure * 1.5)
      
      if (log.status === 'completed') {
        taskScore = baseReward * (deadlinePressure > 0.3 ? pressureMultiplier * 0.8 : 1.0) // Bonus for completing under pressure
      } else if (log.status === 'missed') {
        taskScore = -basePenalty * pressureMultiplier // Heavier penalty for missing under pressure
      } else if (log.status === 'pending' && logDate < now) {
        taskScore = -0.6 * pressureMultiplier // Escalating penalty for overdue tasks
      }
      
      const weight = timeDecay * deadlinePositionWeight
      totalScore += taskScore * weight
      totalWeight += weight
      
      // Track recent performance with deadline awareness
      const recentDays = deadlinePressure > 0.5 ? 3 : 7 // Shorter window near deadline
      if (daysFromNow <= recentDays) {
        recentPerformance += taskScore * timeDecay
        recentWeight += timeDecay
      }
    })
    
    // Calculate actual vs expected performance
    const actualPerformance = totalWeight > 0 ? (totalScore / totalWeight) : 0
    const performanceGap = actualPerformance - expectedScore
    
    // Timeline adjustment based on expected vs actual progress
    if (timelineProgress > 0.2) { // Only apply after 20% through goal
      if (performanceGap > 0.3) {
        timelineAdjustment = Math.min(15, performanceGap * 25) // Bonus for being ahead
      } else if (performanceGap < -0.2) {
        const urgencyMultiplier = deadlinePressure > 0 ? (1 + deadlinePressure * 2) : 1
        timelineAdjustment = Math.max(-30, performanceGap * 40 * urgencyMultiplier) // Penalty for being behind, amplified near deadline
      }
    }
    
    // Calculate streak bonus with deadline awareness
    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    let missedStreak = 0
    
    // Calculate streaks from most recent backwards
    const recentLogs = [...allLogs].reverse()
    for (let i = 0; i < recentLogs.length; i++) {
      const log = recentLogs[i]
      if (log.status === 'completed') {
        if (i === 0) currentStreak++
        tempStreak++
        longestStreak = Math.max(longestStreak, tempStreak)
        missedStreak = 0
      } else if (log.status === 'missed') {
        if (i === 0) {
          currentStreak = 0
          missedStreak++
        }
        tempStreak = 0
      }
    }
    
    // Streak bonus/penalty with deadline pressure
    const streakMultiplier = 1 + (deadlinePressure * 0.5)
    if (currentStreak >= 5) {
      streakBonus = Math.min(25, currentStreak * 3 * streakMultiplier) // Enhanced bonus near deadline
    } else if (currentStreak >= 3) {
      streakBonus = currentStreak * 2 * streakMultiplier
    } else if (missedStreak >= 3) {
      streakBonus = -Math.min(35, missedStreak * 5 * streakMultiplier) // Harsher penalty near deadline
    } else if (missedStreak >= 1 && deadlinePressure > 0.7) {
      streakBonus = -Math.min(15, missedStreak * 8) // Any miss is critical very near deadline
    }
    
    // Consistency factor with deadline consideration
    if (allLogs.length >= 5) {
      const completionRates = []
      const windowSize = Math.min(5, Math.max(3, Math.floor(allLogs.length / 3)))
      
      for (let i = 0; i <= allLogs.length - windowSize; i++) {
        const window = allLogs.slice(i, i + windowSize)
        const completed = window.filter(log => log.status === 'completed').length
        const missed = window.filter(log => log.status === 'missed').length
        const rate = (completed - missed) / windowSize
        completionRates.push(rate)
      }
      
      if (completionRates.length > 1) {
        const mean = completionRates.reduce((a, b) => a + b, 0) / completionRates.length
        const variance = completionRates.reduce((acc, rate) => acc + Math.pow(rate - mean, 2), 0) / completionRates.length
        const stdDev = Math.sqrt(variance)
        
        // Reward consistency more near deadline
        const consistencyImportance = 1 + (deadlinePressure * 0.3)
        consistencyFactor = Math.max(0.6, (1 - stdDev * 0.5) * consistencyImportance)
      }
    }
    
    // Calculate base performance score
    const basePerformance = actualPerformance
    
    // Recent performance weight (more important near deadline)
    const recentWeight_factor = deadlinePressure > 0.3 ? 0.7 : 0.4
    const recentPerformanceScore = recentWeight > 0 ? (recentPerformance / recentWeight) : basePerformance
    
    // Combine factors with deadline-aware weights
    const combinedScore = (basePerformance * (1 - recentWeight_factor)) + (recentPerformanceScore * recentWeight_factor)
    
    // Apply all adjustments
    const adjustedScore = (combinedScore * consistencyFactor) + 
                         (streakBonus / 100) + 
                         (timelineAdjustment / 100)
    
    // Convert to progress score (-100 to +100 scale)
    const progressScore = Math.max(-100, Math.min(100, adjustedScore * 50))
    
    return Math.round(progressScore)
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