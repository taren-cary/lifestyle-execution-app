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
      return { completed: 0, total: 0, percentage: 0 }
    }

    let completed = 0
    let total = 0

    goal.tasks.forEach(task => {
      if (task.task_logs) {
        const weekLogs = task.task_logs.filter(log => {
          const logDate = new Date(log.due_date)
          return logDate >= weekStart && logDate <= weekEnd
        })
        
        total += weekLogs.length
        completed += weekLogs.filter(log => log.status === 'completed').length
      }
    })

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { completed, total, percentage }
  }

  const generateSuggestions = (stats) => {
    if (stats.percentage >= 90) {
      return "Excellent execution! Consider adding more challenging lead measures or increasing frequency."
    } else if (stats.percentage >= 70) {
      return "Good progress! Look for small optimizations to reach 90%+ consistency."
    } else if (stats.percentage >= 50) {
      return "Room for improvement. Consider simplifying your lead measures or adjusting frequency."
    } else {
      return "Significant improvement needed. You might be overcommitting - try focusing on fewer, simpler tasks."
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
    (stats.percentage >= 90 ? "Excellent execution! Consider adding more challenging lead measures." :
     stats.percentage >= 70 ? "Good progress! Look for small optimizations to reach 90%+ consistency." :
     stats.percentage >= 50 ? "Room for improvement. Consider simplifying your lead measures." :
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
        <div className="flex justify-between items-center">
          <span className="text-sm text-white/70">
            {stats.completed} of {stats.total} tasks completed
          </span>
          <span className={`font-bold ${
            stats.percentage >= 80 ? 'text-green-400' :
            stats.percentage >= 60 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {stats.percentage}%
          </span>
        </div>
        <div className="progress-bar mt-2">
          <div 
            className="progress-fill" 
            style={{ width: `${stats.percentage}%` }}
          ></div>
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