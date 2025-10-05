'use client'

import { useEffect, useState } from 'react'
import { authService } from '../lib/auth'

export default function GoogleSignIn({ onSignIn }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.body.appendChild(script)

    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      })

      window.google.accounts.id.renderButton(
        document.getElementById('google-signin'),
        { 
          theme: 'outline', 
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left'
        }
      )
    }

    return () => {
      // Cleanup script if component unmounts
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [])

  const handleCredentialResponse = async (response) => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('Google credential response received')
      console.log('Credential token length:', response.credential.length)
      console.log('Credential token preview:', response.credential.substring(0, 50) + '...')
      
      const result = await authService.authenticateWithGoogle(response.credential)
      console.log('Authentication successful:', result)
      
      onSignIn(result.user, result.access_token)
    } catch (error) {
      console.error('Error during Google sign-in:', error)
      setError('Sign-in failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Get Started</h2>
        <p className="text-gray-600">Sign in with your Google account to access the PDF Management System</p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          Signing in...
        </div>
      )}

      {/* Google Sign-In Button */}
      <div id="google-signin" className="flex justify-center mb-4" />

      <p className="text-center text-xs text-gray-500">
        Secure sign-in with Google • Your data is protected
      </p>
    </div>
  )
}