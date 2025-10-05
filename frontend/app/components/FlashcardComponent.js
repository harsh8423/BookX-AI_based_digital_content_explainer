'use client'

import { useState, useEffect } from 'react'
import { authService } from '../lib/auth'

export default function FlashcardComponent({ pdfId, startPage, endPage, topic, sectionTitle, subsectionTitle, existingFlashcards }) {
  const [flashcards, setFlashcards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    if (existingFlashcards) {
      setFlashcards([existingFlashcards])
      setCurrentIndex(0)
      setIsFlipped(false)
    } else if (sectionTitle && subsectionTitle) {
      // If we have section info but no existing flashcards, generate new ones
      generateFlashcards()
    } else {
      fetchFlashcards()
    }
  }, [pdfId, existingFlashcards, sectionTitle, subsectionTitle])

  const fetchFlashcards = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/pdfs/${pdfId}/flashcards`, {
        headers: {
          ...authService.getAuthHeaders(),
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch flashcards')
      }

      const data = await response.json()
      setFlashcards(data)
    } catch (error) {
      console.error('Error fetching flashcards:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const generateFlashcards = async () => {
    try {
      setIsGenerating(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/pdfs/${pdfId}/flashcards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify({
          start_page: parseInt(startPage) || 1,
          end_page: parseInt(endPage) || parseInt(startPage) || 1,
          topic: topic || 'General Topic',
          type: 'flashcards',
          section_title: sectionTitle || '',
          subsection_title: subsectionTitle || '',
          regenerate: false // Don't regenerate by default, create new ones
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate flashcards')
      }

      const data = await response.json()
      
      if (data.success && data.flashcards) {
        setFlashcards([data.flashcards])
        setCurrentIndex(0)
        setIsFlipped(false)
      } else {
        throw new Error(data.error || 'Failed to generate flashcards')
      }
    } catch (error) {
      console.error('Error generating flashcards:', error)
      setError(error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const nextCard = () => {
    if (currentIndex < flashcards[0]?.flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setIsFlipped(false)
    }
  }

  const prevCard = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setIsFlipped(false)
    }
  }

  const flipCard = () => {
    setIsFlipped(!isFlipped)
  }

  const resetCards = () => {
    setCurrentIndex(0)
    setIsFlipped(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-600">Loading flashcards...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center">
          <div className="text-red-500 mr-2">⚠️</div>
          <div>
            <h3 className="text-red-800 font-medium">Error</h3>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
        <button
          onClick={fetchFlashcards}
          className="mt-3 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (flashcards.length === 0) {
    return (
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-center">
          <div className="text-blue-500 text-4xl mb-4">🎴</div>
          <h3 className="text-blue-800 font-medium mb-2">No Flashcards Yet</h3>
          <p className="text-blue-600 text-sm mb-4">
            Generate flashcards for this topic to test your knowledge
          </p>
          <button
            onClick={generateFlashcards}
            disabled={isGenerating}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center mx-auto"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <span className="mr-2">🎴</span>
                Generate Flashcards
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  const currentFlashcardSet = flashcards[0]
  const currentCard = currentFlashcardSet?.flashcards?.[currentIndex]
  
  // Debug logging
  console.log('Current flashcard set:', currentFlashcardSet)
  console.log('Current card:', currentCard)
  console.log('Current index:', currentIndex)
  console.log('Flashcards array:', flashcards)
  console.log('Current card question:', currentCard?.question)
  console.log('Current card answer:', currentCard?.answer)

  // Safety check - only show error if we have flashcards but no valid card
  if (flashcards.length > 0 && (!currentFlashcardSet || !currentCard)) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h3 className="text-red-800 font-medium mb-2">Flashcard Data Error</h3>
          <p className="text-red-600 text-sm mb-4">
            Unable to load flashcard content. Please try generating new flashcards.
          </p>
          <button
            onClick={generateFlashcards}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          >
            Generate New Flashcards
          </button>
        </div>
      </div>
    )
  }

  // Additional check for empty question/answer
  if (currentCard && (!currentCard.question || !currentCard.answer)) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
          <h3 className="text-yellow-800 font-medium mb-2">Incomplete Flashcard Data</h3>
          <p className="text-yellow-600 text-sm mb-4">
            This flashcard is missing question or answer content.
          </p>
          <div className="text-xs text-gray-500 mb-4">
            Question: "{currentCard.question || 'Missing'}"<br/>
            Answer: "{currentCard.answer || 'Missing'}"
          </div>
          <button
            onClick={generateFlashcards}
            className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors"
          >
            Generate New Flashcards
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Flashcards</h3>
          <p className="text-sm text-gray-600">
            Topic: {currentFlashcardSet.topic}
            {currentFlashcardSet.section_title && ` • ${currentFlashcardSet.section_title}`}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={resetCards}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={generateFlashcards}
            disabled={isGenerating}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {isGenerating ? 'Generating...' : 'New Set'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Card {currentIndex + 1} of {currentFlashcardSet.flashcards.length}</span>
        <div className="w-32 bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / currentFlashcardSet.flashcards.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Flashcard */}
      <div className="relative w-full max-w-4xl mx-auto">
        {/* Card side indicator */}
        <div className="absolute top-4 right-4 z-10">
          <div className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
            isFlipped 
              ? 'bg-green-500 text-white' 
              : 'bg-blue-500 text-white'
          }`}>
            {isFlipped ? 'Answer' : 'Question'}
          </div>
        </div>
        
        <div
          className="relative w-full h-96 cursor-pointer transition-all duration-300 hover:scale-[1.02]"
          onClick={flipCard}
        >
          {/* Front of card - Question */}
          <div
            className={`absolute inset-0 w-full h-full rounded-2xl shadow-2xl border-2 transition-all duration-500 ${
              isFlipped ? 'opacity-0 rotateY-180' : 'opacity-100 rotateY-0'
            }`}
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              borderColor: '#e2e8f0'
            }}
          >
            <div className="flex flex-col h-full p-8">
              {/* Question Header */}
              <div className="flex items-center justify-center mb-6">
                <div className="bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold">
                  Question
                </div>
              </div>
              
              {/* Question Content */}
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-800 text-xl leading-relaxed font-medium max-w-3xl">
                    {currentCard.question || 'No question available'}
                  </p>
                </div>
              </div>
              
              {/* Click instruction */}
              <div className="text-center">
                <div className="inline-flex items-center text-gray-500 text-sm bg-gray-100 px-4 py-2 rounded-full">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  Click to reveal answer
                </div>
              </div>
            </div>
          </div>

          {/* Back of card - Answer */}
          <div
            className={`absolute inset-0 w-full h-full rounded-2xl shadow-2xl border-2 transition-all duration-500 ${
              isFlipped ? 'opacity-100 rotateY-0' : 'opacity-0 rotateY-180'
            }`}
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
              borderColor: '#0ea5e9'
            }}
          >
            <div className="flex flex-col h-full p-8">
              {/* Answer Header */}
              <div className="flex items-center justify-center mb-6">
                <div className="bg-green-500 text-white px-4 py-2 rounded-lg font-semibold">
                  Answer
                </div>
              </div>
              
              {/* Answer Content */}
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-800 text-lg leading-relaxed max-w-3xl">
                    {currentCard.answer || 'No answer available'}
                  </p>
                </div>
              </div>
              
              {/* Click instruction */}
              <div className="text-center">
                <div className="inline-flex items-center text-gray-500 text-sm bg-gray-100 px-4 py-2 rounded-full">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  Click to see question
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <button
          onClick={prevCard}
          disabled={currentIndex === 0}
          className="flex items-center px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>

        <div className="flex items-center space-x-3">
          {currentFlashcardSet.flashcards.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setCurrentIndex(index)
                setIsFlipped(false)
              }}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                index === currentIndex ? 'bg-blue-500 scale-125' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>

        <button
          onClick={nextCard}
          disabled={currentIndex === currentFlashcardSet.flashcards.length - 1}
          className="flex items-center px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
        >
          Next
          <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Completion message */}
      {currentIndex === currentFlashcardSet.flashcards.length - 1 && isFlipped && (
        <div className="max-w-4xl mx-auto p-6 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center justify-center">
            <div className="text-green-500 mr-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-green-800 font-semibold text-lg">Excellent work!</h4>
              <p className="text-green-600">You've completed all flashcards for this topic.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}