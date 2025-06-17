import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, endOfWeek, subDays, parseISO } from 'date-fns'
import { Target, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { ensureTaskLogsUpToDate } from '../lib/taskUtils'

const Dashboard = () => {
  const [goals, setGoals] = useState([])
  const [todaysTasks, setTodaysTasks] = useState([])
  const [stats, setStats] = useState({
    totalGoals: 0,
    completedToday: 0,
    weeklyCompletion: 0,
    currentStreak: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Generate task logs for today and mark overdue tasks as missed
      await ensureTaskLogsUpToDate()

      // Fetch goals with progress
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
        .order('created_at', { ascending: false })

      // Fetch today's tasks
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: tasksData } = await supabase
        .from('task_logs')
        .select(`
          *,
          tasks (
            title,
            goals (
              title,
              category
            )
          )
        `)
        .eq('due_date', today)
        .order('created_at', { ascending: true })

      // Fetch all task logs for calculations
      const { data: allTaskLogs } = await supabase
        .from('task_logs')
        .select(`
          *,
          tasks (
            goals (
              user_id
            )
          )
        `)
        .eq('tasks.goals.user_id', user.id)
        .order('due_date', { ascending: true })

      // Calculate stats
      const totalGoals = goalsData?.length || 0
      const completedToday = tasksData?.filter(task => task.status === 'completed').length || 0
      const weeklyCompletion = calculateWeeklyCompletion(allTaskLogs || [])
      const currentStreak = calculateCurrentStreak(allTaskLogs || [])
      
      setGoals(goalsData || [])
      setTodaysTasks(tasksData || [])
      setStats({
        totalGoals,
        completedToday,
        weeklyCompletion,
        currentStreak
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateWeeklyCompletion = (taskLogs) => {
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 }) // Sunday
    
    // Filter task logs for this week
    const thisWeekLogs = taskLogs.filter(log => {
      const logDate = parseISO(log.due_date)
      return logDate >= weekStart && logDate <= weekEnd
    })
    
    if (thisWeekLogs.length === 0) return 0
    
    const completedThisWeek = thisWeekLogs.filter(log => log.status === 'completed').length
    return Math.round((completedThisWeek / thisWeekLogs.length) * 100)
  }

  const calculateCurrentStreak = (taskLogs) => {
    if (taskLogs.length === 0) return 0
    
    // Group task logs by date
    const logsByDate = {}
    taskLogs.forEach(log => {
      const date = log.due_date
      if (!logsByDate[date]) {
        logsByDate[date] = []
      }
      logsByDate[date].push(log)
    })
    
    // Calculate daily completion rates
    const dailyRates = {}
    Object.keys(logsByDate).forEach(date => {
      const dayLogs = logsByDate[date]
      const completed = dayLogs.filter(log => log.status === 'completed').length
      const total = dayLogs.length
      dailyRates[date] = total > 0 ? (completed / total) : 0
    })
    
    // Calculate streak (days with 100% completion)
    const sortedDates = Object.keys(dailyRates).sort().reverse() // Most recent first
    let streak = 0
    
    for (const date of sortedDates) {
      if (dailyRates[date] === 1) { // 100% completion
        streak++
      } else {
        break // Streak broken
      }
    }
    
    return streak
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
      
      // Ensure task logs are up to date after completing a task
      await ensureTaskLogsUpToDate()
      
      // Refresh data
      fetchDashboardData()
    } catch (error) {
      console.error('Error marking task complete:', error)
    }
  }

  const calculateGoalProgress = (goal) => {
    if (!goal.tasks || goal.tasks.length === 0) return 0 // Start at neutral when no tasks
    
    const now = new Date()
    const goalStartDate = new Date(goal.created_at)
    const goalDeadline = new Date(goal.deadline)
    const totalGoalDays = Math.max(1, Math.ceil((goalDeadline - goalStartDate) / (1000 * 60 * 60 * 24)))
    const daysElapsed = Math.max(0, Math.ceil((now - goalStartDate) / (1000 * 60 * 60 * 24)))
    
    // Timeline progress (0 to 1)
    const timelineProgress = Math.min(1, daysElapsed / totalGoalDays)
    
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
    
    // Calculate overall completion rate
    const completed = allLogs.filter(log => log.status === 'completed').length
    const missed = allLogs.filter(log => log.status === 'missed').length
    const total = allLogs.length
    const actualCompletionRate = total > 0 ? completed / total : 0
    
    // Expected score based on timeline progress
    // If timeline is 50% complete and you have 100% completion rate, you should have +50 points
    const expectedMaxScore = timelineProgress * 100 // Maximum possible at this point in timeline
    const actualScore = actualCompletionRate * expectedMaxScore // Your actual performance relative to timeline
    
    // Base score (what you've earned so far relative to where you should be)
    let baseScore = actualScore
    
    // Adjust for completion rate expectations
    if (actualCompletionRate >= 0.9) {
      // 90%+ completion: You're exceeding expectations
      baseScore = actualScore + (timelineProgress * 10) // Small bonus
    } else if (actualCompletionRate >= 0.8) {
      // 80-89% completion: Right on track  
      baseScore = actualScore // No adjustment
    } else if (actualCompletionRate >= 0.7) {
      // 70-79% completion: Slightly behind
      baseScore = actualScore - (timelineProgress * 10) // Small penalty
    } else {
      // Below 70%: Concerning performance
      baseScore = actualScore - (timelineProgress * 20) // Larger penalty
    }
    
    // Recent performance adjustment (last 7 days)
    const recentLogs = allLogs
      .filter(log => {
        const logDate = new Date(log.due_date)
        const daysAgo = Math.ceil((now - logDate) / (1000 * 60 * 60 * 24))
        return daysAgo <= 7
      })
      .sort((a, b) => new Date(b.due_date) - new Date(a.due_date))
    
    let recentAdjustment = 0
    if (recentLogs.length >= 3) {
      const recentCompleted = recentLogs.filter(log => log.status === 'completed').length
      const recentTotal = recentLogs.length
      const recentRate = recentCompleted / recentTotal
      const overallRate = actualCompletionRate
      
      // Boost or penalize based on recent trend
      const trendDifference = recentRate - overallRate
      recentAdjustment = trendDifference * 15 // Small adjustment for recent performance
    }
    
    // Consecutive miss penalty (no streak bonuses)
    let consecutiveMissAdjustment = 0
    let consecutiveMisses = 0
    
    // Check recent logs for consecutive misses
    for (const log of recentLogs.slice(0, 5)) { // Check last 5 task instances
      if (log.status === 'missed') {
        consecutiveMisses++
      } else {
        break
      }
    }
    
    // Apply penalties for consecutive misses only
    if (consecutiveMisses >= 3) {
      consecutiveMissAdjustment = -15 // Routine breakdown
    } else if (consecutiveMisses === 2) {
      consecutiveMissAdjustment = -8 // Concerning pattern  
    } else if (consecutiveMisses === 1) {
      consecutiveMissAdjustment = -3 // Minor disruption
    }
    
    // Combine all factors
    const finalScore = baseScore + recentAdjustment + consecutiveMissAdjustment
    
    // Return capped score (-100 to +100)
    return Math.max(-100, Math.min(100, Math.round(finalScore)))
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
      <div className="text-center lg:text-left">
        <h1>Dashboard</h1>
        <p className="text-slate-600">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="glass card text-center">
          <Target className="mx-auto mb-2 text-orange-500" size={24} />
          <div className="text-2xl font-bold text-slate-800">{stats.totalGoals}</div>
          <div className="text-sm text-slate-600">Active Goals</div>
        </div>
        
        <div className="glass card text-center">
          <CheckCircle className="mx-auto mb-2 text-green-500" size={24} />
          <div className="text-2xl font-bold text-slate-800">{stats.completedToday}</div>
          <div className="text-sm text-slate-600">Completed Today</div>
        </div>
        
        <div className="glass card text-center">
          <TrendingUp className="mx-auto mb-2 text-blue-500" size={24} />
          <div className="text-2xl font-bold text-slate-800">{stats.weeklyCompletion}%</div>
          <div className="text-sm text-slate-600">This Week</div>
        </div>
        
        <div className="glass card text-center">
          <Clock className="mx-auto mb-2 text-purple-500" size={24} />
          <div className="text-2xl font-bold text-slate-800">{stats.currentStreak}</div>
          <div className="text-sm text-slate-600">Perfect Days</div>
        </div>
      </div>

      {/* Desktop Two Column Layout */}
      <div className="desktop-two-col space-y-6 lg:space-y-0">
        {/* Goals Progress */}
        <div className="glass card">
          <h2 className="mb-4">Goal Progress</h2>
          {goals.length === 0 ? (
            <div className="text-center py-8">
              <Target className="mx-auto mb-4 text-slate-400" size={48} />
              <p className="text-slate-600 mb-4">
                No active goals. Create your first goal to get started!
              </p>
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
                  <div key={goal.id} className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="goal-progress-container">
                      <div className="goal-progress-info">
                        <div>
                          <h3 className="font-medium text-slate-800">{goal.title}</h3>
                          <p className="text-sm text-slate-600">{goal.category}</p>
                        </div>
                        <span className={`goal-progress-percentage ${progressClass}`}>
                          {progress > 0 ? '+' : ''}{progress}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${progressBarWidth}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className={`goal-progress-status ${progressStatus.status}`}>
                          {progressStatus.text}
                        </span>
                        <p className="text-xs text-slate-500">
                          Due: {format(new Date(goal.deadline), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Today's Tasks */}
        <div className="glass card">
          <h2 className="mb-4">Today's Tasks</h2>
          {todaysTasks.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="mx-auto mb-4 text-slate-400" size={48} />
              <p className="text-slate-600">
                No tasks for today. Great job staying on track!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysTasks.map((taskLog) => (
                <div 
                  key={taskLog.id} 
                  className={`p-4 rounded-lg border transition-all ${
                    taskLog.status === 'completed' 
                      ? 'status-completed' 
                      : taskLog.status === 'missed'
                      ? 'status-missed'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-slate-800">{taskLog.tasks?.title}</h3>
                      <p className="text-sm text-slate-600">
                        {taskLog.tasks?.goals?.title} • {taskLog.tasks?.goals?.category}
                      </p>
                    </div>
                    {taskLog.status === 'pending' && (
                      <button
                        onClick={() => markTaskComplete(taskLog.id)}
                        className="btn btn-success btn-sm"
                      >
                        Complete
                      </button>
                    )}
                    {taskLog.status === 'completed' && (
                      <CheckCircle className="text-green-500" size={20} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard 