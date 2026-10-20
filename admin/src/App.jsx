import React from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import Home from './Pages/Home.jsx'
import DashboardPage from './Pages/DashboardPage.jsx';
import { useUser } from '@clerk/clerk-react';
import ListPage from './Pages/ListPage.jsx';

import QuizPage from './Pages/QuizPage.jsx';

// To protect the route 
function RequiredAuth({ children }) {
  const {isLoaded, isSignedIn} = useUser();
  const location = useLocation();

  if(!isLoaded) {
    return (
      <div
        className='min-h-screen flex items-center justify-center bg-slate-50'
        role="status"
        aria-live="polite"
      >
        <div className='flex flex-col items-center gap-3'>
          <span
            aria-hidden="true"
            className='h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-indigo-600'
          />
          <span className='text-sm font-medium text-slate-600'>Loading…</span>
        </div>
      </div>
    )
  }

  if(!isSignedIn) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-slate-50 px-4'>
        <div className='w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm'>
          <span className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600'>
            <Lock size={24} aria-hidden="true" />
          </span>
          <h1 className='text-xl font-bold text-slate-900'>
            Admin access required
          </h1>
          <p className='mt-2 text-sm text-slate-600'>
            Please sign in with your admin account to view this page.
          </p>
          <div className='mt-6 flex justify-center'>
            <Link
              to="/"
              state={{from: location}}
              className='inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2'
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return children;
}


const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={
        <RequiredAuth>
          <DashboardPage />
        </RequiredAuth>
      } />
      <Route path="/list" element={
        <RequiredAuth>
          <ListPage />
        </RequiredAuth>
      } />
      <Route path="/quiz/:id" element={
        <RequiredAuth>
          <QuizPage />
        </RequiredAuth>
      } />
    </Routes>

  );
};

export default App
