import { supabase } from './supabase'

/**
 * Generate task logs for the current date and mark overdue tasks as missed
 * This should be called whenever the user visits pages that display today's tasks
 */
export const ensureTaskLogsUpToDate = async () => {
  try {
    console.log('Generating task logs for today and marking overdue tasks...')
    
    // Generate task logs for today
    const { error: generateError } = await supabase.rpc('generate_task_logs_for_date')
    if (generateError) {
      console.error('Error generating task logs:', generateError)
      throw generateError
    }

    // Mark overdue tasks as missed
    const { error: markError } = await supabase.rpc('mark_overdue_tasks_as_missed')
    if (markError) {
      console.error('Error marking overdue tasks:', markError)
      throw markError
    }

    console.log('Task logs updated successfully')
  } catch (error) {
    console.error('Failed to update task logs:', error)
    // Don't throw the error to prevent blocking the UI
  }
}

/**
 * Generate task logs for a specific date
 * @param {string} targetDate - Date in YYYY-MM-DD format
 */
export const generateTaskLogsForDate = async (targetDate) => {
  try {
    const { error } = await supabase.rpc('generate_task_logs_for_date', {
      target_date: targetDate
    })
    if (error) throw error
    console.log(`Task logs generated for ${targetDate}`)
  } catch (error) {
    console.error(`Error generating task logs for ${targetDate}:`, error)
    throw error
  }
} 