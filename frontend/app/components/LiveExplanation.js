'use client'
import React, { useState, useEffect, useRef } from 'react'

export default function LiveExplanation({ explanationContent, isExplaining, onStartExplanation, onStopExplanation }) {
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [sentences, setSentences] = useState([])
  const utteranceRef = useRef(null)

  // Split content into sentences
  useEffect(() => {
    if (explanationContent) {
      const sentenceArray = explanationContent
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => s + '.')
      setSentences(sentenceArray)
      setCurrentSentenceIndex(0)
    }
  }, [explanationContent])

  // Handle speech synthesis
  useEffect(() => {
    if (isExplaining && sentences.length > 0 && currentSentenceIndex < sentences.length) {
      if (utteranceRef.current) {
        speechSynthesis.cancel()
      }

      const utterance = new SpeechSynthesisUtterance(sentences[currentSentenceIndex])
      utterance.onend = () => {
        if (currentSentenceIndex < sentences.length - 1) {
          setCurrentSentenceIndex(prev => prev + 1)
        }
      }
      utterance.onerror = () => {
        console.error('Speech synthesis error')
      }

      utteranceRef.current = utterance
      speechSynthesis.speak(utterance)
    }
  }, [isExplaining, currentSentenceIndex, sentences])

  const handleStart = () => {
    onStartExplanation()
  }

  const handleStop = () => {
    speechSynthesis.cancel()
    setCurrentSentenceIndex(0)
    onStopExplanation()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleStart}
              disabled={isExplaining}
              className="inline-flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              Start Explanation
            </button>
            
            {isExplaining && (
              <button
                onClick={handleStop}
                className="inline-flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z"/>
                </svg>
                Stop
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isExplaining ? 'bg-purple-500 animate-pulse' : 'bg-gray-300'}`}></div>
            <span className="text-sm text-gray-600">
              {isExplaining ? 'Explaining' : 'Stopped'}
            </span>
          </div>
        </div>

        {/* Progress */}
        {sentences.length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{currentSentenceIndex + 1} / {sentences.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentSentenceIndex + 1) / sentences.length) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Content Display */}
      <div className="flex-1 overflow-y-auto p-6">
        {sentences.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-purple-100 to-purple-200 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">No Explanation Content</h3>
              <p className="text-gray-600">Ask the assistant to explain specific content from the document.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {sentences.map((sentence, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border transition-all duration-200 ${
                  index === currentSentenceIndex
                    ? 'bg-purple-50 border-purple-200 shadow-md'
                    : index < currentSentenceIndex
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    index === currentSentenceIndex
                      ? 'bg-purple-500 text-white'
                      : index < currentSentenceIndex
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  <p className={`flex-1 leading-relaxed ${
                    index === currentSentenceIndex
                      ? 'text-purple-900 font-medium'
                      : index < currentSentenceIndex
                      ? 'text-green-800'
                      : 'text-gray-700'
                  }`}>
                    {sentence}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


