'use client'

import { useState, useEffect } from 'react'
import { authService } from '../lib/auth'

export default function QuizComponent({ pdfId, startPage, endPage, topic, sectionTitle, subsectionTitle, existingQuiz }) {
  const [quizzes, setQuizzes] = useState([])
  const [currentQuiz, setCurrentQuiz] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [quizResults, setQuizResults] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [quizCompleted, setQuizCompleted] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [completionTime, setCompletionTime] = useState(0)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    if (existingQuiz) {
      setQuizzes([existingQuiz])
      startQuiz(existingQuiz)
    } else {
      fetchQuizzes()
    }
  }, [pdfId, existingQuiz])

  const fetchQuizzes = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/pdfs/${pdfId}/quizzes`, {
        headers: {
          ...authService.getAuthHeaders(),
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch quizzes')
      }

      const data = await response.json()
      setQuizzes(data)
    } catch (error) {
      console.error('Error fetching quizzes:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const generateQuiz = async () => {
    try {
      setIsGenerating(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/pdfs/${pdfId}/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify({
          start_page: parseInt(startPage) || 1,
          end_page: parseInt(endPage) || parseInt(startPage) || 1,
          topic: topic || 'General Topic',
          type: 'quiz',
          section_title: sectionTitle || '',
          subsection_title: subsectionTitle || '',
          regenerate: true
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate quiz')
      }

      const data = await response.json()
      
      if (data.success && data.quiz) {
        setQuizzes([data.quiz])
        startQuiz(data.quiz)
      } else {
        throw new Error(data.error || 'Failed to generate quiz')
      }
    } catch (error) {
      console.error('Error generating quiz:', error)
      setError(error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const startQuiz = (quiz) => {
    setCurrentQuiz(quiz)
    setCurrentQuestionIndex(0)
    setSelectedOption(null)
    setShowExplanation(false)
    setQuizResults([])
    setQuizCompleted(false)
    setStartTime(Date.now())
  }

  const selectOption = (optionIndex) => {
    if (showExplanation) return
    
    setSelectedOption(optionIndex)
    setShowExplanation(true)
    
    const currentQuestion = currentQuiz.questions[currentQuestionIndex]
    const isCorrect = currentQuestion.options[optionIndex].is_correct
    
    setQuizResults(prev => [...prev, {
      question_index: currentQuestionIndex,
      selected_option: optionIndex,
      is_correct: isCorrect,
      time_taken: (Date.now() - startTime) / 1000
    }])
  }

  const nextQuestion = () => {
    if (currentQuestionIndex < currentQuiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedOption(null)
      setShowExplanation(false)
    } else {
      completeQuiz()
    }
  }

  const completeQuiz = async () => {
    try {
      setIsSubmitting(true)
      setCompletionTime((Date.now() - startTime) / 1000)
      
      const response = await fetch(`${API_BASE_URL}/quizzes/${currentQuiz.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify({
          results: quizResults,
          completion_time: completionTime
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit quiz results')
      }

      setQuizCompleted(true)
    } catch (error) {
      console.error('Error submitting quiz:', error)
      setError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetQuiz = () => {
    setCurrentQuiz(null)
    setCurrentQuestionIndex(0)
    setSelectedOption(null)
    setShowExplanation(false)
    setQuizResults([])
    setQuizCompleted(false)
    setStartTime(null)
    setCompletionTime(0)
  }

  const getOptionColor = (optionIndex) => {
    if (!showExplanation) {
      return selectedOption === optionIndex 
        ? 'bg-blue-100 border-blue-500' 
        : 'bg-white border-gray-200 hover:bg-gray-50'
    }

    const option = currentQuiz.questions[currentQuestionIndex].options[optionIndex]
    if (option.is_correct) {
      return 'bg-green-100 border-green-500 text-green-800'
    } else if (selectedOption === optionIndex) {
      return 'bg-red-100 border-red-500 text-red-800'
    } else {
      return 'bg-gray-100 border-gray-300 text-gray-600'
    }
  }

  const getScore = () => {
    return quizResults.filter(result => result.is_correct).length
  }

  const getScorePercentage = () => {
    return Math.round((getScore() / quizResults.length) * 100)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-600">Loading quizzes...</span>
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
          onClick={fetchQuizzes}
          className="mt-3 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (quizzes.length === 0) {
    return (
      <div className="p-6 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="text-center">
          <div className="text-purple-500 text-4xl mb-4">🧠</div>
          <h3 className="text-purple-800 font-medium mb-2">No Quiz Yet</h3>
          <p className="text-purple-600 text-sm mb-4">
            Generate a quiz for this topic to test your knowledge
          </p>
          <button
            onClick={generateQuiz}
            disabled={isGenerating}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center mx-auto"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <span className="mr-2">🧠</span>
                Generate Quiz
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  if (quizCompleted) {
    const score = getScore()
    const totalQuestions = quizResults.length
    const percentage = getScorePercentage()
    
    return (
      <div className="space-y-6">
        <div className="text-center p-8 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
          <div className="text-6xl mb-4">
            {percentage >= 80 ? '🎉' : percentage >= 60 ? '👍' : '📚'}
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Quiz Completed!</h3>
          <div className="text-4xl font-bold text-blue-600 mb-2">
            {score}/{totalQuestions}
          </div>
          <div className="text-lg text-gray-600 mb-4">
            {percentage}% Correct
          </div>
          <div className="text-sm text-gray-500 mb-6">
            Completed in {Math.round(completionTime)} seconds
          </div>
          
          <div className="flex justify-center space-x-4">
            <button
              onClick={resetQuiz}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Take Again
            </button>
            <button
              onClick={generateQuiz}
              disabled={isGenerating}
              className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
            >
              New Quiz
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentQuiz) {
    const latestQuiz = quizzes[0]
    
    // Safety check for undefined quiz
    if (!latestQuiz) {
      return (
        <div className="p-6 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="text-center">
            <div className="text-purple-500 text-4xl mb-4">🧠</div>
            <h3 className="text-purple-800 font-medium mb-2">No Quiz Available</h3>
            <p className="text-purple-600 text-sm mb-4">
              No quiz has been generated for this topic yet.
            </p>
            <button
              onClick={generateQuiz}
              disabled={isGenerating}
              className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center mx-auto"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </>
              ) : (
                <>
                  <span className="mr-2">🧠</span>
                  Generate Quiz
                </>
              )}
            </button>
          </div>
        </div>
      )
    }
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Quiz</h3>
            <p className="text-sm text-gray-600">
              Topic: {latestQuiz.topic}
              {latestQuiz.section_title && ` • ${latestQuiz.section_title}`}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => startQuiz(latestQuiz)}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              Start Quiz
            </button>
            <button
              onClick={generateQuiz}
              disabled={isGenerating}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {isGenerating ? 'Generating...' : 'New Quiz'}
            </button>
          </div>
        </div>

        <div className="p-6 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="text-center">
            <div className="text-purple-500 text-4xl mb-4">🧠</div>
            <h4 className="text-purple-800 font-medium mb-2">Ready to Test Your Knowledge?</h4>
            <p className="text-purple-600 text-sm mb-4">
              This quiz has {latestQuiz.questions.length} multiple choice questions about "{latestQuiz.topic}".
            </p>
            <p className="text-purple-600 text-sm">
              Take your time and read each question carefully!
            </p>
          </div>
        </div>
      </div>
    )
  }

  const currentQuestion = currentQuiz.questions[currentQuestionIndex]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Quiz</h3>
          <p className="text-sm text-gray-600">
            Topic: {currentQuiz.topic}
            {currentQuiz.section_title && ` • ${currentQuiz.section_title}`}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={resetQuiz}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Exit Quiz
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Question {currentQuestionIndex + 1} of {currentQuiz.questions.length}</span>
        <div className="w-32 bg-gray-200 rounded-full h-2">
          <div
            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Question */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">
          {currentQuestion.question}
        </h4>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => selectOption(index)}
              disabled={showExplanation}
              className={`w-full p-4 text-left border-2 rounded-lg transition-all duration-200 ${getOptionColor(index)}`}
            >
              <div className="flex items-center">
                <div className={`w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center ${
                  showExplanation 
                    ? option.is_correct 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : selectedOption === index 
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-gray-300 border-gray-300 text-gray-600'
                    : selectedOption === index
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-white border-gray-300'
                }`}>
                  {showExplanation && option.is_correct && '✓'}
                  {showExplanation && selectedOption === index && !option.is_correct && '✗'}
                  {!showExplanation && selectedOption === index && '●'}
                </div>
                <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
                <span>{option.text}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Explanation */}
        {showExplanation && (
          <div className={`mt-4 p-4 rounded-lg ${
            currentQuestion.options[selectedOption].is_correct 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-start">
              <div className={`text-lg mr-2 ${
                currentQuestion.options[selectedOption].is_correct ? 'text-green-500' : 'text-red-500'
              }`}>
                {currentQuestion.options[selectedOption].is_correct ? '✓' : '✗'}
              </div>
              <div>
                <h5 className={`font-medium ${
                  currentQuestion.options[selectedOption].is_correct ? 'text-green-800' : 'text-red-800'
                }`}>
                  {currentQuestion.options[selectedOption].is_correct ? 'Correct!' : 'Incorrect'}
                </h5>
                <p className={`text-sm mt-1 ${
                  currentQuestion.options[selectedOption].is_correct ? 'text-green-700' : 'text-red-700'
                }`}>
                  {currentQuestion.explanation}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {showExplanation && (
        <div className="flex justify-end">
          <button
            onClick={nextQuestion}
            disabled={isSubmitting}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
          >
            {currentQuestionIndex === currentQuiz.questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
          </button>
        </div>
      )}
    </div>
  )
}