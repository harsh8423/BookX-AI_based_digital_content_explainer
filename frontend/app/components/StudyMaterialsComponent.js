'use client'

import { useState, useEffect } from 'react'
import { authService } from '../lib/auth'
import FlashcardComponent from './FlashcardComponent'
import QuizComponent from './QuizComponent'

export default function StudyMaterialsComponent({ pdfId }) {
  const [flashcards, setFlashcards] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [materialType, setMaterialType] = useState(null) // 'flashcard' or 'quiz'

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    fetchStudyMaterials()
  }, [pdfId])

  const fetchStudyMaterials = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [flashcardsResponse, quizzesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/pdfs/${pdfId}/flashcards`, {
          headers: {
            ...authService.getAuthHeaders(),
          },
        }),
        fetch(`${API_BASE_URL}/pdfs/${pdfId}/quizzes`, {
          headers: {
            ...authService.getAuthHeaders(),
          },
        })
      ])

      if (!flashcardsResponse.ok || !quizzesResponse.ok) {
        throw new Error('Failed to fetch study materials')
      }

      const flashcardsData = await flashcardsResponse.json()
      const quizzesData = await quizzesResponse.json()

      setFlashcards(flashcardsData)
      setQuizzes(quizzesData)
    } catch (error) {
      console.error('Error fetching study materials:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewMaterial = (material, type) => {
    setSelectedMaterial(material)
    setMaterialType(type)
  }

  const handleRegenerateMaterial = async (material, type) => {
    try {
      // This will trigger the generation in the respective component
      setSelectedMaterial({
        ...material,
        regenerate: true
      })
      setMaterialType(type)
    } catch (error) {
      console.error('Error regenerating material:', error)
      setError(error.message)
    }
  }

  const handleBackToList = () => {
    setSelectedMaterial(null)
    setMaterialType(null)
  }

  const groupMaterialsBySection = (materials) => {
    const grouped = {}
    materials.forEach(material => {
      const sectionKey = material.section_title || 'General'
      const subsectionKey = material.subsection_title || 'Main'
      
      if (!grouped[sectionKey]) {
        grouped[sectionKey] = {}
      }
      if (!grouped[sectionKey][subsectionKey]) {
        grouped[sectionKey][subsectionKey] = []
      }
      grouped[sectionKey][subsectionKey].push(material)
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
        <span className="ml-2 text-gray-600">Loading study materials...</span>
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
          onClick={fetchStudyMaterials}
          className="mt-3 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  // If a specific material is selected, show the component
  if (selectedMaterial && materialType) {
    if (materialType === 'flashcard') {
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
              {selectedMaterial.section_title}
              {selectedMaterial.subsection_title && ` • ${selectedMaterial.subsection_title}`}
            </div>
          </div>
          <FlashcardComponent
            pdfId={pdfId}
            startPage={selectedMaterial.start_page}
            endPage={selectedMaterial.end_page}
            topic={selectedMaterial.topic}
            sectionTitle={selectedMaterial.section_title}
            subsectionTitle={selectedMaterial.subsection_title}
            existingFlashcards={selectedMaterial.regenerate ? null : selectedMaterial}
          />
        </div>
      )
    } else if (materialType === 'quiz') {
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
              {selectedMaterial.section_title}
              {selectedMaterial.subsection_title && ` • ${selectedMaterial.subsection_title}`}
            </div>
          </div>
          <QuizComponent
            pdfId={pdfId}
            startPage={selectedMaterial.start_page}
            endPage={selectedMaterial.end_page}
            topic={selectedMaterial.topic}
            sectionTitle={selectedMaterial.section_title}
            subsectionTitle={selectedMaterial.subsection_title}
            existingQuiz={selectedMaterial.regenerate ? null : selectedMaterial}
          />
        </div>
      )
    }
  }

  const groupedFlashcards = groupMaterialsBySection(flashcards)
  const groupedQuizzes = groupMaterialsBySection(quizzes)

  const totalMaterials = flashcards.length + quizzes.length

  if (totalMaterials === 0) {
    return (
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-center">
          <div className="text-blue-500 text-4xl mb-4">📚</div>
          <h3 className="text-blue-800 font-medium mb-2">No Study Materials Yet</h3>
          <p className="text-blue-600 text-sm mb-4">
            Generate flashcards and quizzes from the Index Content tab to start studying
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
          <h3 className="text-lg font-semibold text-gray-900">Study Materials</h3>
          <p className="text-sm text-gray-600">
            {flashcards.length} flashcards • {quizzes.length} quizzes
          </p>
        </div>
        <button
          onClick={fetchStudyMaterials}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Flashcards Section */}
      {Object.keys(groupedFlashcards).length > 0 && (
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-800 flex items-center">
            <span className="mr-2">🎴</span>
            Flashcards
          </h4>
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
                            onClick={() => handleViewMaterial(material, 'flashcard')}
                            className="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleRegenerateMaterial(material, 'flashcard')}
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

      {/* Quizzes Section */}
      {Object.keys(groupedQuizzes).length > 0 && (
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-800 flex items-center">
            <span className="mr-2">🧠</span>
            Quizzes
          </h4>
          {Object.entries(groupedQuizzes).map(([sectionTitle, subsections]) => (
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
                              {material.questions.length} questions
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Pages {material.start_page}-{material.end_page} • {formatDate(material.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewMaterial(material, 'quiz')}
                            className="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleRegenerateMaterial(material, 'quiz')}
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