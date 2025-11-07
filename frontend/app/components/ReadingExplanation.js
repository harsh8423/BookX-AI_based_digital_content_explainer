'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'

export default function ReadingExplanation({ 
  generatedContent,
  contentType,
  isGenerating,
  topic,
  pdfId,
  startPage,
  endPage,
  sectionTitle,
  subsectionTitle
}) {
  // Main audio playback state
  const [isPlayingMain, setIsPlayingMain] = useState(false)
  const [mainAudioPosition, setMainAudioPosition] = useState(0)
  const [mainAudioDuration, setMainAudioDuration] = useState(0)
  const audioRef = useRef(null)

  // Q&A state
  const [isRecording, setIsRecording] = useState(false)
  const [userQuestion, setUserQuestion] = useState('')
  const [tutorResponse, setTutorResponse] = useState('')
  const [isTutorResponding, setIsTutorResponding] = useState(false)
  const [isPlayingQA, setIsPlayingQA] = useState(false)
  const shouldResumeAfterQA = useRef(false)
  const isPlayingQARef = useRef(false)

  // Audio recording
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  // Q&A audio playback
  const audioContextRef = useRef(null)
  const audioSourceRef = useRef(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  // Initialize main audio when content is loaded
  useEffect(() => {
    if (generatedContent?.audio_url && contentType === 'explain') {
      // Load audio into HTML5 audio element
      if (audioRef.current) {
        audioRef.current.src = generatedContent.audio_url
        audioRef.current.load()
        
        // Wrap the play method to add logging and guards (only once)
        if (!audioRef.current._playWrapped) {
          const originalPlay = audioRef.current.play.bind(audioRef.current)
          audioRef.current.play = function() {
            if (isPlayingQARef.current) {
              console.warn('🚫 BLOCKED: Attempted to play main audio while Q&A is playing')
              console.trace('Stack trace of blocked play call:')
              return Promise.reject(new Error('Cannot play main audio while Q&A is active'))
            }
            console.log('▶️ Playing main explanation audio')
            return originalPlay().catch(err => {
              console.error('Error playing main audio:', err)
              throw err
            })
          }
          audioRef.current._playWrapped = true
        }
      }
    }
  }, [generatedContent?.audio_url, contentType])

  // Audio event handlers
  const handleAudioLoaded = () => {
    if (audioRef.current) {
      setMainAudioDuration(audioRef.current.duration)
    }
  }

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setMainAudioPosition(audioRef.current.currentTime)
    }
  }

  const handleAudioEnded = () => {
    setIsPlayingMain(false)
  }

  const handleAudioPlay = () => {
    // Prevent main audio from playing while Q&A is active
    if (isPlayingQA) {
      console.warn('⚠️ Attempted to play main audio while Q&A is playing - blocking')
      if (audioRef.current) {
        audioRef.current.pause()
      }
      return
    }
    setIsPlayingMain(true)
  }

  const handleAudioPause = () => {
    setIsPlayingMain(false)
  }

  // Main audio controls
  const togglePlayPause = () => {
    if (audioRef.current) {
      // Don't allow manual play/pause while Q&A audio is playing
      if (isPlayingQA) {
        console.log('Cannot toggle main audio while Q&A is playing')
        return
      }
      
      if (isPlayingMain) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }
  }

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setMainAudioPosition(0)
    }
  }

  // Play Q&A audio from base64
  const playQAAudioFromBase64 = async (audioBase64, audioFormat = 'mp3') => {
    try {
      console.log(`Playing Q&A audio from base64 (format: ${audioFormat})`)
      
      // Decode base64 to binary
      const binaryString = atob(audioBase64)
      const audioBytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        audioBytes[i] = binaryString.charCodeAt(i)
      }
      
      console.log(`Decoded audio: ${audioBytes.length} bytes`)

      // Create audio context and play
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext
      
      const audioBuffer = await audioContext.decodeAudioData(audioBytes.buffer)
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      audioSourceRef.current = source
      
      // Set up onended callback BEFORE starting playback
      let hasEnded = false
      source.onended = () => {
        if (hasEnded) {
          console.warn('⚠️ Q&A audio onended called multiple times, ignoring')
          return
        }
        hasEnded = true
        
        console.log('✅ Q&A audio onended callback fired - audio finished playing')
        setIsPlayingQA(false)
        isPlayingQARef.current = false
        setUserQuestion('')
        setTutorResponse('')
        
        // Small delay to ensure audio context is fully done
        setTimeout(() => {
          // Resume main explanation audio if flag is set
          if (shouldResumeAfterQA.current && audioRef.current) {
            const isPaused = audioRef.current.paused
            const isCurrentlyPlaying = !audioRef.current.paused && !audioRef.current.ended
            
            console.log(`Resuming check - paused: ${isPaused}, playing: ${isCurrentlyPlaying}, flag: ${shouldResumeAfterQA.current}`)
            
            if (isPaused && !isCurrentlyPlaying) {
              console.log('✅ Resuming main explanation audio after Q&A')
              audioRef.current.play().catch(err => {
                console.error('Error resuming main audio:', err)
              })
            } else {
              console.log(`⚠️ Main audio state: paused=${isPaused}, playing=${isCurrentlyPlaying} - skipping resume`)
            }
            shouldResumeAfterQA.current = false
          } else {
            console.log('⚠️ Resume conditions not met:', {
              flag: shouldResumeAfterQA.current,
              audioExists: !!audioRef.current
            })
          }
        }, 200) // Small delay to ensure everything is settled
      }
      
      source.connect(audioContext.destination)
      console.log('🎵 Starting Q&A audio playback...')
      source.start()
      
      // Log estimated duration
      if (audioBuffer.duration) {
        console.log(`📊 Q&A audio duration: ${audioBuffer.duration.toFixed(2)} seconds`)
      }
    } catch (error) {
      console.error('Error playing Q&A audio:', error)
      setIsPlayingQA(false)
      isPlayingQARef.current = false
      
      // Still resume if flag is set, even if audio failed
      if (shouldResumeAfterQA.current && audioRef.current && audioRef.current.paused) {
        console.log('Resuming main explanation audio after Q&A error')
        audioRef.current.play().catch(err => console.error('Error resuming:', err))
        shouldResumeAfterQA.current = false
      }
    }
  }

  // Send Q&A request via HTTP
  const sendQARequest = async (audioBlob) => {
    try {
      setIsTutorResponding(true)
      setIsPlayingQA(true)
      isPlayingQARef.current = true
      shouldResumeAfterQA.current = true
      
      // Create FormData
      const formData = new FormData()
      formData.append('audio_file', audioBlob, 'question.webm')
      formData.append('explanation_text', generatedContent?.content || '')
      formData.append('topic', topic || '')
      
      // Get auth headers
      const { authService } = await import('../lib/auth')
      const headers = authService.getAuthHeaders()
      
      // Send HTTP request
      const response = await fetch(`${API_BASE_URL}/api/pdfs/${pdfId}/qa/audio`, {
        method: 'POST',
        headers: {
          ...headers,
          // Don't set Content-Type, let browser set it with boundary for FormData
        },
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`Q&A request failed: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Set question and answer text
      if (data.question_text) {
        setUserQuestion(data.question_text)
      }
      setTutorResponse(data.answer_text)
      setIsTutorResponding(false)
      
      // Play the audio response
      console.log(`Received Q&A response: ${data.answer_text.substring(0, 100)}...`)
      console.log(`Audio format: ${data.audio_format}, base64 length: ${data.audio_base64.length}`)
      
      await playQAAudioFromBase64(data.audio_base64, data.audio_format)
      
    } catch (error) {
      console.error('Error sending Q&A request:', error)
      setIsTutorResponding(false)
      setIsPlayingQA(false)
      isPlayingQARef.current = false
      shouldResumeAfterQA.current = false
      
      // Resume main audio on error
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(err => console.error('Error resuming:', err))
      }
    }
  }

  // Hold to ask question
  const startRecording = async () => {
    // Pause main audio and reset resume flag
    if (audioRef.current && isPlayingMain) {
      console.log('Pausing main audio for Q&A')
      audioRef.current.pause()
      // Reset the resume flag when starting a new question
      shouldResumeAfterQA.current = false
    }

    setIsRecording(true)
    setUserQuestion('')
    setTutorResponse('')
    setIsTutorResponding(false) // Will be set to true when request is sent

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })

      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        
        // Send audio via HTTP
        await sendQARequest(audioBlob)

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current.start()
    } catch (error) {
      console.error('Error starting recording:', error)
      setIsRecording(false)
      setIsTutorResponding(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  // Format time for display
  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Progress bar click handler
  const handleProgressClick = (e) => {
    if (audioRef.current) {
      const progressBar = e.currentTarget
      const clickPosition = (e.clientX - progressBar.getBoundingClientRect().left) / progressBar.offsetWidth
      const newTime = clickPosition * mainAudioDuration
      audioRef.current.currentTime = newTime
      setMainAudioPosition(newTime)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  if (!generatedContent?.content) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">No content available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        onLoadedMetadata={handleAudioLoaded}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleAudioEnded}
        onPlay={handleAudioPlay}
        onPause={handleAudioPause}
        preload="auto"
        onPlayCapture={(e) => {
          // Additional guard - prevent play if Q&A is active
          if (isPlayingQA) {
            console.warn('⚠️ Blocking main audio play (capture phase) - Q&A is active')
            e.preventDefault()
            e.stopPropagation()
            if (audioRef.current) {
              audioRef.current.pause()
            }
          }
        }}
      />

      {/* Audio Controls */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 border border-green-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Audio Explanation</h3>
          {generatedContent.cached && (
            <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full">
              Cached
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div 
          className="w-full h-2 bg-gray-200 rounded-full cursor-pointer mb-2 overflow-hidden"
          onClick={handleProgressClick}
        >
          <div 
            className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-200"
            style={{ width: `${(mainAudioPosition / mainAudioDuration) * 100}%` }}
          />
        </div>

        {/* Time Display */}
        <div className="flex justify-between text-sm text-gray-600 mb-4">
          <span>{formatTime(mainAudioPosition)}</span>
          <span>{formatTime(mainAudioDuration)}</span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center space-x-4">
          <button
            onClick={togglePlayPause}
            className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
          >
            {isPlayingMain ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>

          <button
            onClick={stopAudio}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-4 rounded-full transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hold to Ask Question Button */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Ask Questions</h3>
        
        <div className="text-center">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isPlayingQA}
            className={`inline-flex items-center justify-center px-8 py-4 rounded-full font-semibold text-white shadow-lg transition-all duration-200 transform ${
              isRecording
                ? 'bg-gradient-to-r from-red-500 to-red-600 scale-110 animate-pulse'
                : isPlayingQA
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:scale-105'
            }`}
          >
            {isRecording ? (
              <>
                <svg className="w-6 h-6 mr-2 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14a2 2 0 002-2V6a2 2 0 10-4 0v6a2 2 0 002 2z" />
                  <path d="M17 10a1 1 0 00-2 0v2a5 5 0 01-10 0v-2a1 1 0 00-2 0v2a7 7 0 006 6.92V21H7a1 1 0 000 2h10a1 1 0 000-2h-2v-2.08A7 7 0 0019 12v-2z" />
                </svg>
                Recording... Release to send
              </>
            ) : isPlayingQA ? (
              <>
                <svg className="w-6 h-6 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Playing Response...
              </>
            ) : (
              <>
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Hold to Ask Question
              </>
            )}
          </button>
          <p className="text-sm text-gray-500 mt-2">
            Press and hold to ask a question
          </p>
        </div>

        {/* Q&A Display */}
        {(userQuestion || tutorResponse) && (
          <div className="mt-6 space-y-4">
            {userQuestion && (
              <div className="bg-white p-4 rounded-lg border border-purple-200">
                <p className="text-sm font-semibold text-purple-700 mb-1">Your Question:</p>
                <p className="text-gray-800">{userQuestion}</p>
              </div>
            )}
            
            {tutorResponse && (
              <div className="bg-white p-4 rounded-lg border border-pink-200">
                <p className="text-sm font-semibold text-pink-700 mb-1">
                  Tutor Response: {isTutorResponding && <span className="animate-pulse">●</span>}
                </p>
                <p className="text-gray-800">{tutorResponse}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text Content */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Explanation Text</h3>
        <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
          {generatedContent.content}
        </div>
      </div>
    </div>
  )
}
