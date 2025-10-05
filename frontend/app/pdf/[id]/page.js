'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authService } from '../../lib/auth'

export default function PDFDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [pdf, setPdf] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    if (params.id) {
      fetchPDFDetails()
    }
  }, [params.id])

  const fetchPDFDetails = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/pdfs/${params.id}`, {
        headers: {
          ...authService.getAuthHeaders(),
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          authService.logout()
          router.push('/')
          return
        }
        if (response.status === 404) {
          setError('PDF not found')
          return
        }
        throw new Error('Failed to fetch PDF details')
      }

      const data = await response.json()
      setPdf(data)
    } catch (error) {
      console.error('Error fetching PDF details:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAnalyzeContent = async () => {
    try {
      setIsAnalyzing(true)
      
      const response = await fetch(`${API_BASE_URL}/pdfs/${params.id}/analyze`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
        },
      })

      if (!response.ok) {
        throw new Error('Failed to start analysis')
      }

      const data = await response.json()
      console.log('Analysis started:', data)
      
      // Refresh the PDF details after a short delay
      setTimeout(() => {
        fetchPDFDetails()
      }, 2000)
      
    } catch (error) {
      console.error('Error starting analysis:', error)
      alert('Failed to start analysis. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleRefreshStatus = async () => {
    try {
      setIsRefreshing(true)
      await fetchPDFDetails()
    } catch (error) {
      console.error('Error refreshing status:', error)
    } finally {
      setIsRefreshing(false)
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
      month: 'long',
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
        return 'Analysis Complete'
      case 'analyzing':
        return 'Analyzing Content...'
      case 'failed':
        return 'Analysis Failed'
      default:
        return 'Pending Analysis'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4 text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (!pdf) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">PDF not found</h1>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="text-gray-500 hover:text-gray-700"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">PDF Details</h1>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href={pdf.cloudinary_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                View PDF
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* PDF Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border p-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <span className="text-red-600 font-medium">PDF</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {pdf.filename}
                  </h2>
                  <p className="text-sm text-gray-500">{pdf.title}</p>
                </div>
              </div>

              {pdf.description && (
                <p className="text-gray-600 text-sm mb-4">{pdf.description}</p>
              )}

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">File Size:</span>
                  <span className="text-gray-500 font-medium">{formatFileSize(pdf.size)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Uploaded:</span>
                  <span className="text-gray-500 font-medium">{formatDate(pdf.created_at)}</span>
                </div>
                {pdf.metadata?.pages && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pages:</span>
                    <span className="text-gray-500 font-medium">{pdf.metadata.pages}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Analysis Status:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAnalysisStatusColor(pdf.analysis_status)}`}>
                    {getAnalysisStatusText(pdf.analysis_status)}
                  </span>
                </div>
              </div>

              {pdf.analysis_status === 'pending' && (
                <button
                  onClick={handleAnalyzeContent}
                  disabled={isAnalyzing}
                  className="w-full mt-4 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAnalyzing ? 'Starting Analysis...' : 'Analyze Content'}
                </button>
              )}

              {pdf.analysis_status === 'analyzing' && (
                <div className="w-full mt-4 px-4 py-2 bg-blue-100 text-blue-600 rounded-md text-center">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span>Analyzing content...</span>
                  </div>
                </div>
              )}

              {pdf.analysis_status === 'completed' && (
                <button
                  onClick={() => router.push(`/pdf/${params.id}/chat`)}
                  className="w-full mt-4 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <span>📖</span>
                  <span>Read and Explain</span>
                </button>
              )}

              {pdf.analysis_status !== 'completed' && (
                <button
                  onClick={handleRefreshStatus}
                  disabled={isRefreshing}
                  className="w-full mt-4 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                >
                  {isRefreshing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Refreshing...</span>
                    </>
                  ) : (
                    <>
                      <span>🔄</span>
                      <span>Refresh Status</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Index Content */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">Document Index</h3>
              </div>
              
              <div className="p-6">
                {pdf.analysis_status === 'completed' && pdf.index_content ? (
                  <div>
                    {pdf.index_content.title && (
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">
                        {pdf.index_content.title}
                      </h4>
                    )}
                    
                    {pdf.index_content.index && pdf.index_content.index.length > 0 ? (
                      <div className="space-y-4">
                        {pdf.index_content.index.map((section, index) => (
                          <div key={index} className="border-l-4 border-blue-500 pl-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h5 className="font-medium text-gray-900 mb-1">
                                  {section.section_title}
                                </h5>
                                {section.summary && (
                                  <p className="text-sm text-gray-600 mb-2">
                                    {section.summary}
                                  </p>
                                )}
                                <div className="flex items-center space-x-4 text-xs text-gray-500">
                                  {section.start_pdf_page && (
                                    <span>📄 Page {section.start_pdf_page}</span>
                                  )}
                                  {section.start_document_page && section.start_document_page !== section.start_pdf_page && (
                                    <span>📋 Doc Page {section.start_document_page}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {section.subsections && section.subsections.length > 0 && (
                              <div className="mt-3 ml-4 space-y-2">
                                {section.subsections.map((subsection, subIndex) => (
                                  <div key={subIndex} className="border-l-2 border-gray-200 pl-3">
                                    <h6 className="font-medium text-gray-800 text-sm">
                                      {subsection.subsection_title}
                                    </h6>
                                    {subsection.summary && (
                                      <p className="text-xs text-gray-600 mb-1">
                                        {subsection.summary}
                                      </p>
                                    )}
                                    {subsection.start_pdf_page && (
                                      <span className="text-xs text-gray-500">
                                        📄 Page {subsection.start_pdf_page}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">
                        No index content available for this document.
                      </p>
                    )}
                  </div>
                ) : pdf.analysis_status === 'failed' ? (
                  <div className="text-center py-8">
                    <div className="text-red-500 mb-4 text-4xl">❌</div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Analysis Failed</h4>
                    <p className="text-gray-600 mb-4">
                      There was an error analyzing the PDF content. Please try again.
                    </p>
                    <button
                      onClick={handleAnalyzeContent}
                      disabled={isAnalyzing}
                      className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 transition-colors"
                    >
                      {isAnalyzing ? 'Starting...' : 'Retry Analysis'}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-4 text-4xl">📋</div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">
                      {pdf.analysis_status === 'analyzing' ? 'Analyzing Content...' : 'Content Analysis Pending'}
                    </h4>
                    <p className="text-gray-600">
                      {pdf.analysis_status === 'analyzing' 
                        ? 'Please wait while we analyze the document structure and content.'
                        : 'Click "Analyze Content" to extract the document index and structure.'
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}