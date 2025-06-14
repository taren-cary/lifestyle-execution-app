import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, endOfWeek, subDays, parseISO } from 'date-fns'
import { Target, CheckCircle, Clock, TrendingUp } from 'lucide-react'

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
      
      // Refresh data
      fetchDashboardData()
    } catch (error) {
      console.error('Error marking task complete:', error)
    }
  }

  const calculateGoalProgress = (goal) => {
    if (!goal.tasks || goal.tasks.length === 0) return 0
    
    const totalLogs = goal.tasks.reduce((acc, task) => acc + (task.task_logs?.length || 0), 0)
    const completedLogs = goal.tasks.reduce((acc, task) => 
      acc + (task.task_logs?.filter(log => log.status === 'completed').length || 0), 0
    )
    
    return totalLogs > 0 ? Math.round((completedLogs / totalLogs) * 100) : 0
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
                return (
                  <div key={goal.id} className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium text-slate-800">{goal.title}</h3>
                        <p className="text-sm text-slate-600">{goal.category}</p>
                      </div>
                      <span className="text-sm font-medium text-orange-600">{progress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Due: {format(new Date(goal.deadline), 'MMM d, yyyy')}
                    </p>
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