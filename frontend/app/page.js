'use client'

import { useState, useEffect } from 'react'
import { authService } from './lib/auth'
import GoogleSignIn from './components/GoogleSignIn'
import PDFUpload from './components/PDFUpload'
import PDFList from './components/PDFList'

export default function Home() {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is already authenticated
    if (authService.isAuthenticated()) {
      setUser(authService.user)
    }
    setIsLoading(false)
  }, [])

  const handleSignIn = (userData, token) => {
    setUser(userData)
  }

  const handleSignOut = () => {
    authService.logout()
    setUser(null)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <GoogleSignIn onSignIn={handleSignIn} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">BookX</h1>
              <span className="ml-2 text-sm text-gray-500">PDF Management</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <img
                  src={user.picture}
                  alt={user.name}
                  className="h-8 w-8 rounded-full"
                />
                <span className="text-sm font-medium text-gray-700">{user.name}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Your PDF Library</h2>
          <p className="text-gray-600">Upload and manage your PDF documents with AI-powered analysis</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <PDFUpload onUploadSuccess={() => window.location.reload()} />
          </div>

          {/* PDF List Section */}
          <div className="lg:col-span-2">
            <PDFList />
          </div>
        </div>
      </main>
    </div>
  )
}