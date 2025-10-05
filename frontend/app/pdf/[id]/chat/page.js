'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authService } from '../../../lib/auth'
import IndexContent from '../../../components/IndexContent'
import ReadingExplanation from '../../../components/ReadingExplanation'
import AboutDocument from '../../../components/AboutDocument'
import NotesTab from '../../../components/NotesTab'
import FlashcardComponent from '../../../components/FlashcardComponent'
import QuizComponent from '../../../components/QuizComponent'
import FlashcardListComponent from '../../../components/FlashcardListComponent'
import QuizListComponent from '../../../components/QuizListComponent'

export default function PDFChatPage() {
  const params = useParams()
  const router = useRouter()
  const [pdf, setPdf] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('index-content')
  
  // Content state
  const [generatedContent, setGeneratedContent] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [contentType, setContentType] = useState(null) // 'read' or 'explain'
  const [currentTopic, setCurrentTopic] = useState('')
  
  // Flashcard and Quiz state
  const [selectedSection, setSelectedSection] = useState(null)
  const [isGeneratingContent, setIsGeneratingContent] = useState(false)
  const [generatingType, setGeneratingType] = useState(null) // 'flashcard' or 'quiz'
  const [generatedStudyMaterial, setGeneratedStudyMaterial] = useState(null) // Store generated flashcard/quiz

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

  const handleContentRequest = async (request) => {
    try {
      setIsGenerating(true)
      setContentType(request.type)
      setGeneratedContent(null)

      const response = await fetch(`${API_BASE_URL}/pdfs/${params.id}/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        throw new Error('Failed to generate content')
      }

      const data = await response.json()
      setGeneratedContent(data)
      setCurrentTopic(request.topic)
      
      // Switch to reading-explanation tab to show the content
      setActiveTab('reading-explanation')
      
    } catch (error) {
      console.error('Error generating content:', error)
      setError(error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePlayNote = (note) => {
    // Set the note content as generated content and switch to reading-explanation tab
    setGeneratedContent({
      content: note.text_content,
      audio_url: note.audio_url
    })
    setContentType('explain')
    setCurrentTopic(note.topic)
    setActiveTab('reading-explanation')
  }

  const generateStudyMaterial = async (section) => {
    const endpoint = section.action === 'flashcard' ? 'flashcards' : 'quizzes'
    
    const response = await fetch(`${API_BASE_URL}/pdfs/${params.id}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authService.getAuthHeaders(),
      },
      body: JSON.stringify({
        start_page: parseInt(section.start_pdf_page) || 1,
        end_page: parseInt(section.end_pdf_page) || parseInt(section.start_pdf_page) || 1,
        topic: section.section_title || 'General Topic',
        type: section.action,
        section_title: section.section_title || '',
        subsection_title: section.subsection_title || '',
        regenerate: false
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to generate ${section.action}`)
    }

    const data = await response.json()
    
    if (data.success) {
      return section.action === 'flashcard' ? data.flashcards : data.quiz
    } else {
      throw new Error(data.error || `Failed to generate ${section.action}`)
    }
  }

  const handleSectionSelect = async (section) => {
    // Clear any existing selected section first
    setSelectedSection(null)
    setGeneratedStudyMaterial(null)
    
    // Set the new section
    setSelectedSection(section)
    
    // If it's flashcard or quiz, generate content first before switching tabs
    if (section.action === 'flashcard' || section.action === 'quiz') {
      setIsGeneratingContent(true)
      setGeneratingType(section.action)
      
      try {
        const generatedMaterial = await generateStudyMaterial(section)
        setGeneratedStudyMaterial(generatedMaterial)
        
        // Only switch to the tab after generation is complete
        if (section.action === 'flashcard') {
          setActiveTab('flashcards')
        } else if (section.action === 'quiz') {
          setActiveTab('quiz')
        }
      } catch (error) {
        console.error('Error generating study material:', error)
        // Still switch to the tab to show error state
        if (section.action === 'flashcard') {
          setActiveTab('flashcards')
        } else if (section.action === 'quiz') {
          setActiveTab('quiz')
        }
      } finally {
        setIsGeneratingContent(false)
      }
    } else {
      // For other actions, switch to reading explanation immediately
      setActiveTab('reading-explanation')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-primary-500"></div>
            <div className="absolute inset-0 animate-pulse rounded-full h-20 w-20 border-4 border-transparent border-t-primary-200"></div>
          </div>
          <p className="mt-6 text-gray-600 font-medium">Loading your PDF...</p>
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
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push(`/pdf/${params.id}`)}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to PDF
          </button>
        </div>
      </div>
    )
  }

  // Show generation loading state
  if (isGeneratingContent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-500"></div>
            <div className="absolute inset-0 animate-pulse rounded-full h-20 w-20 border-4 border-transparent border-t-blue-200"></div>
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">
            Generating {generatingType === 'flashcard' ? 'Flashcards' : 'Quiz'}...
          </h2>
          <p className="mt-2 text-gray-600">
            Extracting content from pages {selectedSection?.start_pdf_page || 1}-{selectedSection?.end_pdf_page || selectedSection?.start_pdf_page || 1} and generating {generatingType === 'flashcard' ? 'study cards' : 'quiz questions'}
          </p>
          <div className="mt-4 text-sm text-gray-500">
            Topic: {selectedSection?.section_title || 'General Topic'}
          </div>
        </div>
      </div>
    )
  }

  if (!pdf) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">PDF not found</h1>
          <p className="text-gray-600 mb-6">The document you're looking for doesn't exist or you don't have permission to access it.</p>
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to Home
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
                onClick={() => router.push(`/pdf/${params.id}`)}
                className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200 font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to PDF
              </button>
              <div className="h-8 w-px bg-gray-200"></div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                PDF Content Explorer
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {isGenerating && (
                <div className="inline-flex items-center px-6 py-2 bg-blue-100 text-blue-700 rounded-lg">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Generating content...
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-100 h-[calc(100vh-6rem)] min-h-[500px] sm:min-h-[600px] flex flex-col hover:bg-white/80 transition-all duration-300">
          
          {/* Tab Navigation */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex space-x-1">
              {[
                { id: 'index-content', label: 'Index Content', icon: '📋' },
                { id: 'reading-explanation', label: 'Content View', icon: '📖' },
                { id: 'notes', label: 'Notes', icon: '📝' },
                { id: 'flashcards', label: 'Flashcards', icon: '🎴' },
                { id: 'quiz', label: 'Quiz', icon: '🧠' },
                { id: 'about-document', label: 'About Document', icon: '📄' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'index-content' && (
              <IndexContent 
                pdf={pdf} 
                onContentRequest={handleContentRequest}
                onSectionSelect={handleSectionSelect}
              />
            )}
            {activeTab === 'reading-explanation' && (
              <ReadingExplanation
                generatedContent={generatedContent}
                contentType={contentType}
                isGenerating={isGenerating}
                topic={currentTopic}
              />
            )}
            {activeTab === 'notes' && (
              <NotesTab 
                pdf={pdf} 
                onPlayNote={handlePlayNote}
              />
            )}
            {activeTab === 'flashcards' && (
              <div className="h-full overflow-y-auto p-6">
                <FlashcardListComponent 
                  pdfId={params.id} 
                  selectedSection={selectedSection} 
                  generatedMaterial={generatedStudyMaterial}
                />
              </div>
            )}
            {activeTab === 'quiz' && (
              <div className="h-full overflow-y-auto p-6">
                <QuizListComponent 
                  pdfId={params.id} 
                  selectedSection={selectedSection} 
                  generatedMaterial={generatedStudyMaterial}
                />
              </div>
            )}
            {activeTab === 'about-document' && <AboutDocument pdf={pdf} />}
          </div>
        </div>
      </main>
    </div>
  )
}