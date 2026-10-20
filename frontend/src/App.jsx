import React from 'react'
import {Routes, Route, Navigate} from 'react-router-dom'
import Home from './pages/Home.jsx'
import { useAuth, SignedIn, SignedOut } from '@clerk/clerk-react'
import MyResultPage from './pages/MyResultPage.jsx'

const App = () => {
  const { isLoaded } = useAuth()

  // Clerk still resolving: a token-styled announced placeholder instead of a
  // blank page (the old `return null` left nothing at all on screen).
  if (!isLoaded)
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-canvas px-4"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-medium text-ink-2">Loading…</p>
      </div>
    )

  return (
   <Routes>
    <Route path='/' element={<Home/>}/>
    <Route path='/result' element={
      <>
      <SignedIn>
        <MyResultPage />
      </SignedIn>
      <SignedOut>
        <Navigate to="/" />
      </SignedOut>
      </>
    }/>
   </Routes>
  )
}

export default App
