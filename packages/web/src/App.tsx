import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ReviewPage from './pages/ReviewPage'
import ApprovalPage from './pages/ApprovalPage'
import CodeReviewPage from './pages/CodeReviewPage'
import HomePage from './pages/HomePage'
import FormReviewPage from './pages/FormReviewPage'
import SelectionPage from './pages/SelectionPage'

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, setDark] as const
}

function DarkModeToggle() {
  const [dark, setDark] = useDarkMode()
  return (
    <button
      onClick={() => setDark(d => !d)}
      className="fixed top-3 right-3 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shadow-sm transition-colors"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? '☀' : '☽'}
    </button>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <DarkModeToggle />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/approval/:id" element={<ApprovalPage />} />
        <Route path="/code-review/:id" element={<CodeReviewPage />} />
        <Route path="/form-review/:id" element={<FormReviewPage />} />
        <Route path="/selection/:id" element={<SelectionPage />} />
      </Routes>
    </BrowserRouter>
  )
}
