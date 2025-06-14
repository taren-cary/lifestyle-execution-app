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
        .select('*')
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
          {goals.map((goal) => (
            <div key={goal.id} className="glass card">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{goal.title}</h3>
                  <p className="text-sm text-white/70 mb-2">{goal.category}</p>
                  {goal.description && (
                    <p className="text-sm text-white/60 mb-3">{goal.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
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
          ))}
        </div>
      )}
    </div>
  )
}

export default Goals 