'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authService } from '../lib/auth'

export default function PDFList() {
  const router = useRouter()
  const [pdfs, setPdfs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    fetchPDFs()
  }, [])

  const fetchPDFs = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/pdfs/`, {
        headers: {
          ...authService.getAuthHeaders(),
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          authService.logout()
          window.location.reload()
          return
        }
        throw new Error('Failed to fetch PDFs')
      }

      const data = await response.json()
      setPdfs(data)
    } catch (error) {
      console.error('Error fetching PDFs:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getAnalysisStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100'
      case 'analyzing':
        return 'text-blue-600 bg-blue-100'
      case 'failed':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-yellow-600 bg-yellow-100'
    }
  }

  const getAnalysisStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'analyzing':
        return 'Analyzing...'
      case 'failed':
        return 'Failed'
      default:
        return 'Analysis Pending'
    }
  }

  const handleDeletePDF = async (pdfId) => {
    if (!confirm('Are you sure you want to delete this PDF?')) {
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/pdfs/${pdfId}`, {
        method: 'DELETE',
        headers: {
          ...authService.getAuthHeaders(),
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete PDF')
      }

      // Remove from local state
      setPdfs(pdfs.filter(pdf => pdf.id !== pdfId))
    } catch (error) {
      console.error('Error deleting PDF:', error)
      alert('Failed to delete PDF. Please try again.')
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading PDFs...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center py-8">
          <div className="text-red-500 mb-2">⚠️</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchPDFs}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (pdfs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4 text-4xl">📄</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No PDFs yet</h3>
          <p className="text-gray-600">Upload your first PDF to get started with AI-powered analysis</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="px-6 py-4 border-b">
        <h3 className="text-lg font-medium text-gray-900">Your PDFs ({pdfs.length})</h3>
      </div>
      
      <div className="divide-y divide-gray-200">
        {pdfs.map((pdf) => (
          <div key={pdf.id} className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-red-600 font-medium text-sm">PDF</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-lg font-medium text-gray-900 truncate">
                      {pdf.title || pdf.filename}
                    </h4>
                    <p className="text-sm text-gray-500 truncate">{pdf.filename}</p>
                  </div>
                </div>
                
                {pdf.description && (
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {pdf.description}
                  </p>
                )}
                
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>📏 {formatFileSize(pdf.size)}</span>
                  <span>📅 {formatDate(pdf.created_at)}</span>
                  {pdf.metadata?.pages && (
                    <span>📄 {pdf.metadata.pages} pages</span>
                  )}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAnalysisStatusColor(pdf.analysis_status || 'pending')}`}>
                    {getAnalysisStatusText(pdf.analysis_status || 'pending')}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => router.push(`/pdf/${pdf.id}`)}
                  className="px-3 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
                >
                  Details
                </button>
                <a
                  href={pdf.cloudinary_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors"
                >
                  View
                </a>
                <button
                  onClick={() => handleDeletePDF(pdf.id)}
                  className="px-3 py-1 text-xs font-medium text-red-600 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}