# 🧠 Lifestyle Execution App – Product Requirements Document (PRD)

## Overview

This app is a personal execution system inspired by *The 4 Disciplines of Execution* and the lifestyle systems of Rockefeller-level excellence. It allows users to define Wildly Important Goals (WIGs), assign Lead Measures (recurring tasks), track execution consistency, and visualize progress through a compelling, elegant dashboard.

---

## 🔧 Tech Stack

- **Frontend**: React (Vite)
- **Backend**: Supabase (PostgreSQL + Auth)
- **Design**: Clean, minimal UI with high visual clarity for scoreboards
- **Deployment**: Vercel / Netlify (optional)

---

## 🧱 Core Features

The app should have seperate pages with tabs at the bottom. The app is for personal use so i'll be deploying it on 
Netlify and saving a link to the site on my Iphone home screen. The app should be mobile-first. The date and time settings should be configured 
for EST time New York.

### 1. 🎯 Goals Page

- Users can:
  - Create new **Goals (WIGs)** with:
    - Title
    - Description
    - Category (Health, Business, Finance, etc.) Goal categories should be free text input with no default categories.
    - Deadline (date)
  - See a list of all active goals with progress bars
  - Archive or mark goals as completed and save completed goals in an archive and hide them.
- Each Goal can link to multiple **Lead Measures**
-Goals without a deadline are not allowed.

### 2. 📌 Lead Measures / Tasks Page

- For each goal, users can:
  - Add **recurring tasks** (lead measures)
    - Task title
    - Frequency (daily, every 2 days(from start date), weekly, custom number of days i.e. every 3 days, every 5 days. It starts from the last completion.)
    - Start date
  - Mark tasks as complete each day
  -Task completion history should be kept for as long as th goal is active.
  -I want a simple list view with today's tasks
  -Overdue/missed tasks should be visually distinct.
  -At midnight if the task is not completed, it should be marked as missed.
  -There is no grace period in streak logic.
  -Users cannot mark task completed for previous days. If a task is not complete on the days its suppose to be it is missed with no edge cases.

### 3. 📊 Dashboard Page (Scoreboard)

- Displays:
  - Progress per goal based on streak consistency (% of assigned tasks completed on time)
  - Weekly task completion rate
  - Graphs of tasks completed vs. missed
  -A simple list view of tasks for today.

### 4. 🗓️ Weekly Review Page (Sunday Only)

- On Sundays:
  - Users are prompted to review each goal:
    - “Did I stay on track?”
    - “What could improve next week?”
  - App auto-generates:
    - Suggestions for improvement (e.g., "Consider simplifying your lead measures.")
    - Summary of last week’s performance
  - Set adjustments for next week (e.g., change task frequency)

---
I just want an email and password login since this app will be for me personally.

## 📁 Database Schema (Supabase)

### `users`
| Field         | Type      |
|---------------|-----------|
| id            | UUID      |
| email         | Text      |
| created_at    | Timestamp |

### `goals`
| Field         | Type      |
|---------------|-----------|
| id            | UUID      |
| user_id       | UUID (FK) |
| title         | Text      |
| description   | Text      |
| category      | Text      |
| deadline      | Date      |
| created_at    | Timestamp |

### `tasks`
| Field         | Type      |
|---------------|-----------|
| id            | UUID      |
| goal_id       | UUID (FK) |
| title         | Text      |
| frequency     | Enum (daily, every_2_days, weekly, custom) |
| custom_days   | JSON (optional, if custom) |
| start_date    | Date      |
| created_at    | Timestamp |

### `task_logs`
| Field         | Type      |
|---------------|-----------|
| id            | UUID      |
| task_id       | UUID (FK) |
| date_completed| Date      |
| status        | Boolean   |

### `weekly_reviews`
| Field         | Type      |
|---------------|-----------|
| id            | UUID      |
| user_id       | UUID (FK) |
| goal_id       | UUID (FK) |
| review_date   | Date      |
| reflections   | Text      |
| suggestions   | Text      |

---

## 🔁 Logic & Calculations

### Goal Progress
- Calculated by:
  -Calculate goal progress in the most advanced way you know how.



### Weekly Suggestions
- Rule-based suggestions:
  - If <60% task completion: "You might be overcommitting."
  - If 100% for 2+ weeks: "Consider increasing challenge level or adding a new measure."

---

## 🖥️ UI/UX Notes

- Use clean, minimalist interface with:
  - Calm typography (e.g., Inter, DM Sans)
  -Glassmorphism style interface for cards, buttons etc with prominent glass effect.
  -Orange to black gradients for backgrounds
  - Soft neutrals and bold color accents for goals/tasks
  - Sunday Review as just a form
- Visual Scoreboard should use:
  - Glassmorphism style Ring charts for % complete
  - Weekly bars

---

## ✅ MVP Feature Checklist

- [ ] User authentication (Supabase)
- [ ] Create & manage goals
- [ ] Assign recurring lead measures
- [ ] Task calendar and check-off interface
- [ ] Task streak logic & stats
- [ ] Dashboard page with visual progress
- [ ] Sunday review logic and prompts
- [ ] Goal completion & archiving
- [ ] Responsive UI

---

## 📈 Future Enhancements (Post-MVP)

- Notifications/reminders for tasks
- AI-generated feedback on weekly reviews
- Mobile PWA support
- Social or shared goals feature

---

