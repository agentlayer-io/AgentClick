import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ReviewPage from './pages/ReviewPage'
import HomePage from './pages/HomePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  )
}
