'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { authService } from '../../../lib/auth'
import ReadingExplanation from '../../../components/ReadingExplanation'

function ExplainPageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pdf, setPdf] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generatedContent, setGeneratedContent] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const generatingRef = useRef(false)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  // Get section info from URL params
  const startPage = parseInt(searchParams.get('start_page')) || 1
  const endPage = parseInt(searchParams.get('end_page')) || startPage + 2
  const topic = searchParams.get('topic') || 'General Topic'
  const sectionTitle = searchParams.get('section_title') || ''
  const subsectionTitle = searchParams.get('subsection_title') || ''

  useEffect(() => {
    if (params.id) {
      fetchPDFDetails()
    }
  }, [params.id])

  useEffect(() => {
    if (pdf && startPage && endPage && topic) {
      generateContent()
    }
  }, [pdf, startPage, endPage, topic])

  // Fetch PDF pages URL for display
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfImages, setPdfImages] = useState([])
  const [useImages, setUseImages] = useState(true) // Toggle between images and PDF
  
  useEffect(() => {
    if (pdf && startPage && endPage) {
      if (useImages) {
        // Fetch PDF pages as images
        fetchPDFPagesAsImages()
      } else {
        const token = authService.getToken()
        const pagesUrl = `${API_BASE_URL}/pdfs/${params.id}/pages?start_page=${startPage}&end_page=${endPage}`
        fetchPDFPages(pagesUrl, token)
      }
    }
  }, [pdf, startPage, endPage, useImages])

  const fetchPDFPagesAsImages = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/pdfs/${params.id}/pages/images?start_page=${startPage}&end_page=${endPage}&zoom=2.0`,
        {
          headers: {
            ...authService.getAuthHeaders(),
          },
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch PDF pages as images')
      }

      const data = await response.json()
      setPdfImages(data.pages || [])
    } catch (error) {
      console.error('Error fetching PDF pages as images:', error)
      // Fallback to PDF view
      setUseImages(false)
    }
  }

  const fetchPDFPages = async (url, token) => {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch PDF pages')
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      setPdfUrl(blobUrl)
    } catch (error) {
      console.error('Error fetching PDF pages:', error)
    }
  }

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [pdfUrl])

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

  const generateContent = async () => {
    // Prevent duplicate requests
    if (generatingRef.current) {
      return
    }
    
    try {
      generatingRef.current = true
      setIsGenerating(true)
      setGeneratedContent(null)

      // Use new explanation endpoint
      const response = await fetch(`${API_BASE_URL}/api/pdfs/${params.id}/explain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify({
          start_page: startPage,
          end_page: endPage,
          topic: topic,
          section_title: sectionTitle || null,
          subsection_title: subsectionTitle || null
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate explanation')
      }

      const data = await response.json()
      // data contains: text_content, audio_url, topic, start_page, end_page, cached
      setGeneratedContent({
        content: data.text_content,
        audio_url: data.audio_url,
        topic: data.topic,
        cached: data.cached
      })
    } catch (error) {
      console.error('Error generating explanation:', error)
      setError(error.message)
    } finally {
      setIsGenerating(false)
      generatingRef.current = false
    }
  }

  if (isLoading || isGenerating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-green-500"></div>
            <div className="absolute inset-0 animate-pulse rounded-full h-20 w-20 border-4 border-transparent border-t-green-200"></div>
          </div>
          <p className="mt-6 text-gray-600 font-medium">
            {isLoading ? 'Loading PDF...' : 'Generating explanation...'}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push(`/pdf/${params.id}/chat`)}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-medium rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Chat
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-lg border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-6">
              <button
                onClick={() => router.push(`/pdf/${params.id}/chat`)}
                className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200 font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
              <div className="h-8 w-px bg-gray-200"></div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Explanation: {topic}
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Split Layout */}
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
          {/* Left Side - PDF Viewer */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Toggle Button */}
            <div className="flex justify-end p-2 border-b border-gray-200">
              <button
                onClick={() => setUseImages(!useImages)}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title={useImages ? "Switch to PDF view" : "Switch to image view"}
              >
                {useImages ? "📄 PDF View" : "🖼️ Image View"}
              </button>
            </div>
            
            {/* Content Area */}
            <div className="flex-1 overflow-y-auto" style={{ height: 'calc(100vh - 250px)', minHeight: '600px' }}>
              {useImages ? (
                pdfImages.length > 0 ? (
                  <div className="p-4 space-y-4">
                    {pdfImages.map((page, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-2 shadow-sm">
                        <div className="text-xs text-gray-500 mb-2 px-2">
                          Page {page.page_number}
                        </div>
                        <img
                          src={`data:image/png;base64,${page.image_base64}`}
                          alt={`Page ${page.page_number}`}
                          className="w-full h-auto rounded border border-gray-200"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-green-500 mx-auto"></div>
                      <p className="mt-4 text-gray-600">Loading PDF pages as images...</p>
                    </div>
                  </div>
                )
              ) : (
                pdfUrl ? (
                  <div className="w-full h-full">
                    <iframe
                      src={pdfUrl}
                      className="w-full h-full border-0"
                      title={`PDF Pages ${startPage}-${endPage}`}
                      style={{ minHeight: '600px' }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-green-500 mx-auto"></div>
                      <p className="mt-4 text-gray-600">Loading PDF pages...</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right Side - Explanation Content */}
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-100 min-h-[500px] p-6">
            <ReadingExplanation
              generatedContent={generatedContent}
              contentType="explain"
              isGenerating={isGenerating}
              topic={topic}
              pdfId={params.id}
              startPage={startPage}
              endPage={endPage}
              sectionTitle={sectionTitle}
              subsectionTitle={subsectionTitle}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ExplainPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-green-500"></div>
      </div>
    }>
      <ExplainPageContent />
    </Suspense>
  )
}

