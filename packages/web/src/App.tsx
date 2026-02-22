import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ReviewPage from './pages/ReviewPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/" element={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
            openclaw-ui is running.
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
