import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { Calendar, TrendingUp, AlertCircle } from 'lucide-react'

const WeeklyReview = () => {
  const [goals, setGoals] = useState([])
  const [reviews, setReviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const today = new Date()
  const isSunday = today.getDay() === 0
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 }) // Sunday

  useEffect(() => {
    if (isSunday) {
      fetchWeeklyData()
    } else {
      setLoading(false)
    }
  }, [isSunday])

  const fetchWeeklyData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch active goals
      const { data: goalsData } = await supabase
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

      // Fetch existing reviews for this week
      const { data: reviewsData } = await supabase
        .from('weekly_reviews')
        .select('*')
        .eq('user_id', user.id)
        .eq('review_date', format(today, 'yyyy-MM-dd'))

      const reviewsMap = {}
      reviewsData?.forEach(review => {
        reviewsMap[review.goal_id] = review
      })

      setGoals(goalsData || [])
      setReviews(reviewsMap)
    } catch (error) {
      console.error('Error fetching weekly data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateWeeklyStats = (goal) => {
    if (!goal.tasks || goal.tasks.length === 0) {
      return { completed: 0, total: 0, score: 0, weeklyScore: 0 }
    }

    // Advanced weekly progress calculation with deadline awareness
    const now = new Date()
    const goalStartDate = new Date(goal.created_at)
    const goalDeadline = new Date(goal.deadline)
    const totalGoalDays = Math.max(1, Math.ceil((goalDeadline - goalStartDate) / (1000 * 60 * 60 * 24)))
    const daysElapsed = Math.max(0, Math.ceil((now - goalStartDate) / (1000 * 60 * 60 * 24)))
    
    // Timeline progress and deadline pressure
    const timelineProgress = Math.min(1, daysElapsed / totalGoalDays)
    const deadlinePressure = timelineProgress > 0.5 ? 
      Math.pow((timelineProgress - 0.5) * 2, 1.5) : 0
    
    let weekCompleted = 0
    let weekTotal = 0
    let weekScore = 0
    let weekWeight = 0
    let timelineAdjustment = 0
    
    // Collect week's task logs
    const weekLogs = []
    goal.tasks.forEach(task => {
      if (task.task_logs) {
        const weekTaskLogs = task.task_logs.filter(log => {
          const logDate = new Date(log.due_date)
          return logDate >= weekStart && logDate <= weekEnd
        })
        weekLogs.push(...weekTaskLogs.map(log => ({
          ...log,
          taskId: task.id,
          taskTitle: task.title
        })))
      }
    })
    
    // Sort by date
    weekLogs.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    
    weekTotal = weekLogs.length
    
    if (weekTotal === 0) {
      return { completed: 0, total: 0, score: 0, weeklyScore: 0 }
    }
    
    // Calculate expected weekly performance based on timeline
    const expectedWeeklyCompletionRate = 0.8 // Expect 80% completion for neutral
    const weekTimelinePosition = timelineProgress
    const expectedWeeklyScore = (weekTimelinePosition * expectedWeeklyCompletionRate * 2) - 1
    
    // Calculate weighted scores for the week with deadline pressure
    weekLogs.forEach((log, index) => {
      const logDate = new Date(log.due_date)
      const dayOfWeek = logDate.getDay()
      
      // Weight later days in the week slightly more, amplified by deadline pressure
      const dayWeight = 1 + (index / weekLogs.length) * 0.2
      const pressureMultiplier = 1 + (deadlinePressure * 1.2) // Less aggressive than daily calculation
      
      let taskScore = 0
      if (log.status === 'completed') {
        taskScore = 1.0 * (deadlinePressure > 0.3 ? pressureMultiplier * 0.9 : 1.0)
        weekCompleted++
      } else if (log.status === 'missed') {
        taskScore = -1.0 * pressureMultiplier
      } else if (log.status === 'pending' && logDate < now) {
        taskScore = -0.6 * pressureMultiplier
      }
      
      weekScore += taskScore * dayWeight
      weekWeight += dayWeight
    })
    
    // Calculate actual vs expected weekly performance
    const actualWeeklyPerformance = weekWeight > 0 ? (weekScore / weekWeight) : 0
    const weeklyPerformanceGap = actualWeeklyPerformance - expectedWeeklyScore
    
    // Timeline adjustment for weekly performance
    if (timelineProgress > 0.1) { // Apply after 10% through goal
      if (weeklyPerformanceGap > 0.3) {
        timelineAdjustment = Math.min(12, weeklyPerformanceGap * 20) // Bonus for exceeding weekly expectations
      } else if (weeklyPerformanceGap < -0.2) {
        const urgencyMultiplier = deadlinePressure > 0 ? (1 + deadlinePressure * 1.5) : 1
        timelineAdjustment = Math.max(-25, weeklyPerformanceGap * 35 * urgencyMultiplier) // Penalty for underperforming, amplified near deadline
      }
    }
    
    // Calculate streak within the week with deadline pressure
    let weekStreak = 0
    let currentWeekStreak = 0
    let missedStreak = 0
    
    weekLogs.forEach(log => {
      if (log.status === 'completed') {
        currentWeekStreak++
        weekStreak = Math.max(weekStreak, currentWeekStreak)
        missedStreak = 0
      } else if (log.status === 'missed') {
        currentWeekStreak = 0
        missedStreak++
      }
    })
    
    // Apply streak bonus for the week with deadline awareness
    let streakBonus = 0
    const weeklyStreakMultiplier = 1 + (deadlinePressure * 0.4)
    
    if (weekStreak >= 5) {
      streakBonus = Math.min(18, weekStreak * 2.2 * weeklyStreakMultiplier) // Enhanced bonus near deadline
    } else if (weekStreak >= 3) {
      streakBonus = weekStreak * 1.3 * weeklyStreakMultiplier
    } else if (missedStreak >= 3) {
      streakBonus = -Math.min(20, missedStreak * 3.5 * weeklyStreakMultiplier) // Harsher penalty near deadline
    } else if (missedStreak >= 1 && deadlinePressure > 0.8) {
      streakBonus = -Math.min(12, missedStreak * 6) // Critical penalty very near deadline
    }
    
    // Calculate base weekly performance
    const baseWeeklyPerformance = actualWeeklyPerformance
    
    // Apply all weekly adjustments
    const adjustedWeeklyScore = baseWeeklyPerformance + 
                               (streakBonus / 100) + 
                               (timelineAdjustment / 100)
    
    // Convert to score (-100 to +100 scale)
    const weeklyScore = Math.max(-100, Math.min(100, adjustedWeeklyScore * 50))
    
    return { 
      completed: weekCompleted, 
      total: weekTotal, 
      score: Math.round(weeklyScore),
      weeklyScore: adjustedWeeklyScore
    }
  }

  const generateSuggestions = (stats) => {
    const { score, weeklyScore } = stats
    
    // Get deadline pressure context for suggestions
    const now = new Date()
    const goalDeadline = new Date() // This would need to be passed from goal data
    // For now, we'll use score-based suggestions with deadline awareness built into the scoring
    
    if (score >= 60) {
      return "Outstanding weekly performance! You're excelling beyond expectations. With this momentum, consider adding more challenging lead measures or increasing frequency to maximize your goal achievement."
    } else if (score >= 30) {
      return "Great weekly execution! You're performing well above the baseline. Focus on maintaining this consistency and look for small optimizations to reach elite performance (60%+)."
    } else if (score >= 10) {
      return "Good weekly progress! You're slightly above neutral. Focus on building consistency to create momentum. Identify what's working well and double down on those strategies."
    } else if (score >= -10) {
      return "Neutral weekly performance. You're maintaining the baseline but not progressing. This week, identify the main obstacles preventing forward movement and address them systematically."
    } else if (score >= -40) {
      return "Below baseline weekly performance. You're sliding backwards this week. Consider simplifying your lead measures, reducing frequency, or addressing any external factors that may be interfering with execution."
    } else {
      return "Significant weekly regression detected. You're well below baseline. This week, focus on just 1-2 simple, achievable tasks to rebuild consistency and confidence. Consider if your current approach needs fundamental changes."
    }
  }

  const handleReviewSubmit = async (goalId, reviewData) => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const stats = calculateWeeklyStats(goals.find(g => g.id === goalId))
      const suggestions = generateSuggestions(stats)

      const reviewPayload = {
        user_id: user.id,
        goal_id: goalId,
        review_date: format(today, 'yyyy-MM-dd'),
        stayed_on_track: reviewData.stayedOnTrack,
        reflection_text: reviewData.reflection,
        improvement_notes: reviewData.improvement,
        auto_suggestions: suggestions
      }

      const { error } = await supabase
        .from('weekly_reviews')
        .upsert([reviewPayload])

      if (error) throw error

      setReviews(prev => ({
        ...prev,
        [goalId]: { ...reviewPayload, ...reviewData }
      }))
    } catch (error) {
      console.error('Error saving review:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!isSunday) {
    return (
      <div className="container page-content">
        <div className="glass card text-center py-12">
          <Calendar className="mx-auto mb-4 text-white/50" size={48} />
          <h2 className="mb-2">Weekly Review</h2>
          <p className="text-white/70 mb-4">
            Weekly reviews are only available on Sundays.
          </p>
          <p className="text-sm text-white/60">
            Come back on Sunday to reflect on your week and plan improvements.
          </p>
        </div>
      </div>
    )
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
      <div className="text-center">
        <h1>Weekly Review</h1>
        <p className="text-white/70">
          Week of {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </p>
      </div>

      {goals.length === 0 ? (
        <div className="glass card text-center py-8">
          <AlertCircle className="mx-auto mb-4 text-orange-400" size={48} />
          <h3 className="mb-2">No Goals to Review</h3>
          <p className="text-white/70">
            Create some goals first to start your weekly review process.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {goals.map((goal) => {
            const stats = calculateWeeklyStats(goal)
            const existingReview = reviews[goal.id]
            
            return (
              <GoalReviewCard
                key={goal.id}
                goal={goal}
                stats={stats}
                existingReview={existingReview}
                onSubmit={(reviewData) => handleReviewSubmit(goal.id, reviewData)}
                saving={saving}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

const GoalReviewCard = ({ goal, stats, existingReview, onSubmit, saving }) => {
  const [formData, setFormData] = useState({
    stayedOnTrack: existingReview?.stayed_on_track ?? null,
    reflection: existingReview?.reflection_text ?? '',
    improvement: existingReview?.improvement_notes ?? ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const suggestions = existingReview?.auto_suggestions || 
    (stats.score >= 60 ? "Excellent execution! Consider adding more challenging lead measures." :
     stats.score >= 30 ? "Good progress! Look for small optimizations to reach elite consistency." :
     stats.score >= -10 ? "Room for improvement. Consider simplifying your lead measures." :
     "Significant improvement needed. You might be overcommitting - try focusing on fewer tasks.")

  return (
    <div className="glass card">
      <div className="mb-4">
        <h3 className="font-semibold mb-1">{goal.title}</h3>
        <p className="text-sm text-white/70">{goal.category}</p>
      </div>

      {/* Weekly Stats */}
      <div className="mb-6 p-4 rounded-lg bg-white/5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={16} className="text-blue-400" />
          <span className="font-medium">This Week's Performance</span>
        </div>
        <div className="goal-progress-info">
          <span className="text-sm text-white/70">
            {stats.completed} of {stats.total} tasks completed
          </span>
          <span className={`goal-progress-percentage ${
            stats.score < -10 ? 'losing' :
            stats.score <= 10 ? 'neutral' : 'winning'
          }`}>
            {stats.score > 0 ? '+' : ''}{stats.score}
          </span>
        </div>
        <div className="progress-bar mt-2">
          <div 
            className="progress-fill" 
            style={{ width: `${Math.max(0, Math.min(100, ((stats.score + 100) / 2)))}%` }}
          ></div>
        </div>
        <div className="goal-progress-status mt-2">
          <span className={`${
            stats.score <= -50 ? 'struggling' :
            stats.score < -10 ? 'struggling' :
            stats.score <= 10 ? 'maintaining' : 'excelling'
          }`}>
            {stats.score <= -50 ? 'Struggling This Week' :
             stats.score < -10 ? 'Falling Behind This Week' :
             stats.score <= 10 ? 'Maintaining This Week' : 
             stats.score <= 50 ? 'Progressing This Week' : 'Excelling This Week'}
          </span>
        </div>
      </div>

      {/* Auto Suggestions */}
      <div className="mb-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
        <h4 className="font-medium mb-2 text-orange-400">AI Suggestions</h4>
        <p className="text-sm text-white/80">{suggestions}</p>
      </div>

      {/* Review Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-group">
          <label className="form-label">Did you stay on track this week?</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`track-${goal.id}`}
                value="true"
                checked={formData.stayedOnTrack === true}
                onChange={() => setFormData({ ...formData, stayedOnTrack: true })}
                className="text-green-400"
              />
              <span className="text-green-400">Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`track-${goal.id}`}
                value="false"
                checked={formData.stayedOnTrack === false}
                onChange={() => setFormData({ ...formData, stayedOnTrack: false })}
                className="text-red-400"
              />
              <span className="text-red-400">No</span>
            </label>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">What went well? What was challenging?</label>
          <textarea
            value={formData.reflection}
            onChange={(e) => setFormData({ ...formData, reflection: e.target.value })}
            className="form-input form-textarea"
            placeholder="Reflect on your week..."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label className="form-label">What could improve next week?</label>
          <textarea
            value={formData.improvement}
            onChange={(e) => setFormData({ ...formData, improvement: e.target.value })}
            className="form-input form-textarea"
            placeholder="Ideas for improvement..."
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={saving || formData.stayedOnTrack === null}
          className="btn btn-primary w-full"
        >
          {saving ? 'Saving...' : existingReview ? 'Update Review' : 'Save Review'}
        </button>
      </form>
    </div>
  )
}

export default WeeklyReview 