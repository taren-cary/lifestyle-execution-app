import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  LayoutDashboard, 
  Target, 
  CheckSquare, 
  Calendar,
  LogOut,
  Menu,
  X,
  User
} from 'lucide-react'

const Layout = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      navigate('/auth')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/goals', icon: Target, label: 'Goals' },
    { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/weekly-review', icon: Calendar, label: 'Weekly Review' }
  ]

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="app">
      {/* Desktop Navbar */}
      <nav className="desktop-navbar">
        <div className="navbar-container">
          {/* Logo/Brand */}
          <div className="navbar-brand">
            <Target className="text-orange-500" size={24} />
            <span className="font-bold text-slate-800">Lifestyle Execution</span>
          </div>

          {/* Navigation Links */}
          <div className="navbar-nav">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`navbar-link ${isActive(item.path) ? 'active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* User Menu */}
          <div className="navbar-user">
            <button
              onClick={handleSignOut}
              className="navbar-signout"
              title="Sign Out"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <header className="mobile-header">
        <div className="mobile-header-container">
          {/* Logo */}
          <div className="mobile-brand">
            <Target className="text-orange-500" size={20} />
            <span className="font-semibold text-slate-800">Lifestyle Execution</span>
          </div>

          {/* Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-menu-button"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="mobile-dropdown">
            <div className="mobile-dropdown-content">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`mobile-nav-link ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
              
              <div className="mobile-nav-divider"></div>
              
              <button
                onClick={() => {
                  handleSignOut()
                  setMobileMenuOpen(false)
                }}
                className="mobile-nav-link mobile-signout"
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

export default Layout 