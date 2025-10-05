'use client'
import React, { useState, useEffect, useRef } from 'react'

export default function LiveReading({ readingContent, isReading, onStartReading, onPauseReading, onStopReading }) {
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [sentences, setSentences] = useState([])
  const [isPaused, setIsPaused] = useState(false)
  const utteranceRef = useRef(null)

  // Split content into sentences
  useEffect(() => {
    if (readingContent) {
      const sentenceArray = readingContent
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => s + '.')
      setSentences(sentenceArray)
      setCurrentSentenceIndex(0)
    }
  }, [readingContent])

  // Handle speech synthesis
  useEffect(() => {
    if (isReading && sentences.length > 0 && currentSentenceIndex < sentences.length) {
      if (utteranceRef.current) {
        speechSynthesis.cancel()
      }

      const utterance = new SpeechSynthesisUtterance(sentences[currentSentenceIndex])
      utterance.onend = () => {
        if (!isPaused && currentSentenceIndex < sentences.length - 1) {
          setCurrentSentenceIndex(prev => prev + 1)
        }
      }
      utterance.onerror = () => {
        console.error('Speech synthesis error')
      }

      utteranceRef.current = utterance
      speechSynthesis.speak(utterance)
    }
  }, [isReading, currentSentenceIndex, sentences, isPaused])

  const handleStart = () => {
    setIsPaused(false)
    onStartReading()
  }

  const handlePause = () => {
    setIsPaused(true)
    speechSynthesis.pause()
    onPauseReading()
  }

  const handleResume = () => {
    setIsPaused(false)
    speechSynthesis.resume()
  }

  const handleStop = () => {
    setIsPaused(false)
    speechSynthesis.cancel()
    setCurrentSentenceIndex(0)
    onStopReading()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleStart}
              disabled={isReading && !isPaused}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start Reading
            </button>
            
            {isReading && (
              <>
                {isPaused ? (
                  <button
                    onClick={handleResume}
                    className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                    Pause
                  </button>
                )}
                
                <button
                  onClick={handleStop}
                  className="inline-flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z"/>
                  </svg>
                  Stop
                </button>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isReading ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
            <span className="text-sm text-gray-600">
              {isReading ? (isPaused ? 'Paused' : 'Reading') : 'Stopped'}
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
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
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
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">No Reading Content</h3>
              <p className="text-gray-600">Ask the assistant to read specific content from the document.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {sentences.map((sentence, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border transition-all duration-200 ${
                  index === currentSentenceIndex
                    ? 'bg-blue-50 border-blue-200 shadow-md'
                    : index < currentSentenceIndex
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    index === currentSentenceIndex
                      ? 'bg-blue-500 text-white'
                      : index < currentSentenceIndex
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  <p className={`flex-1 leading-relaxed ${
                    index === currentSentenceIndex
                      ? 'text-blue-900 font-medium'
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


