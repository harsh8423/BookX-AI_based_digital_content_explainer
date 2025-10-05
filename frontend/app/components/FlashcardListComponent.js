'use client'

import { useState, useEffect } from 'react'
import { authService } from '../lib/auth'
import FlashcardComponent from './FlashcardComponent'

export default function FlashcardListComponent({ pdfId, selectedSection, generatedMaterial }) {
  const [flashcards, setFlashcards] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedFlashcard, setSelectedFlashcard] = useState(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    fetchFlashcards()
  }, [pdfId])

  useEffect(() => {
    // If we have a generated material, add it to the list and select it
    if (generatedMaterial) {
      setFlashcards(prev => [generatedMaterial, ...prev])
      setSelectedFlashcard(generatedMaterial)
    }
  }, [generatedMaterial])

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

  const handleViewFlashcard = (flashcard) => {
    setSelectedFlashcard(flashcard)
  }

  const handleRegenerateFlashcard = async (flashcard) => {
    try {
      // This will trigger the generation in the FlashcardComponent
      setSelectedFlashcard({
        ...flashcard,
        regenerate: true
      })
    } catch (error) {
      console.error('Error regenerating flashcard:', error)
      setError(error.message)
    }
  }

  const handleBackToList = () => {
    setSelectedFlashcard(null)
  }

  const groupFlashcardsBySection = (flashcards) => {
    const grouped = {}
    flashcards.forEach(flashcard => {
      const sectionKey = flashcard.section_title || 'General'
      const subsectionKey = flashcard.subsection_title || 'Main'
      
      if (!grouped[sectionKey]) {
        grouped[sectionKey] = {}
      }
      if (!grouped[sectionKey][subsectionKey]) {
        grouped[sectionKey][subsectionKey] = []
      }
      grouped[sectionKey][subsectionKey].push(flashcard)
    })
    return grouped
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
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

  // If a specific flashcard is selected, show the component
  if (selectedFlashcard) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBackToList}
            className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span className="mr-2">←</span>
            Back to List
          </button>
          <div className="text-sm text-gray-600">
            {selectedFlashcard.section_title}
            {selectedFlashcard.subsection_title && ` • ${selectedFlashcard.subsection_title}`}
          </div>
        </div>
        <FlashcardComponent
          pdfId={pdfId}
          startPage={selectedFlashcard.start_page}
          endPage={selectedFlashcard.end_page}
          topic={selectedFlashcard.topic}
          sectionTitle={selectedFlashcard.section_title}
          subsectionTitle={selectedFlashcard.subsection_title}
          existingFlashcards={selectedFlashcard.regenerate ? null : selectedFlashcard}
        />
      </div>
    )
  }

  const groupedFlashcards = groupFlashcardsBySection(flashcards)

  if (flashcards.length === 0) {
    return (
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-center">
          <div className="text-blue-500 text-4xl mb-4">🎴</div>
          <h3 className="text-blue-800 font-medium mb-2">No Flashcards Yet</h3>
          <p className="text-blue-600 text-sm mb-4">
            Generate flashcards from the Index Content tab to start studying
          </p>
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
            {flashcards.length} flashcard sets
          </p>
        </div>
        <button
          onClick={fetchFlashcards}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Flashcards Section */}
      {Object.keys(groupedFlashcards).length > 0 && (
        <div className="space-y-4">
          {Object.entries(groupedFlashcards).map(([sectionTitle, subsections]) => (
            <div key={sectionTitle} className="bg-white rounded-lg border border-gray-200 p-4">
              <h5 className="font-medium text-gray-900 mb-3">{sectionTitle}</h5>
              {Object.entries(subsections).map(([subsectionTitle, materials]) => (
                <div key={subsectionTitle} className="ml-4 mb-3 last:mb-0">
                  {subsectionTitle !== 'Main' && (
                    <h6 className="text-sm font-medium text-gray-700 mb-2">{subsectionTitle}</h6>
                  )}
                  <div className="space-y-2">
                    {materials.map((material) => (
                      <div key={material.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">{material.topic}</span>
                            <span className="text-xs text-gray-500">
                              {material.flashcards.length} cards
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Pages {material.start_page}-{material.end_page} • {formatDate(material.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewFlashcard(material)}
                            className="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleRegenerateFlashcard(material)}
                            className="px-3 py-1 text-xs bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
                          >
                            Regenerate
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}