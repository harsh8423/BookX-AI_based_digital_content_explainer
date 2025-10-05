'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'

export default function ReadingExplanation({ 
  generatedContent,
  contentType,
  isGenerating,
  topic
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [sentences, setSentences] = useState([])
  const utteranceRef = useRef(null)

  // Interactive explain mode state
  const [isInteractiveMode, setIsInteractiveMode] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [userQuestion, setUserQuestion] = useState('')
  const [tutorResponse, setTutorResponse] = useState('')
  const [isTutorResponding, setIsTutorResponding] = useState(false)
  const [logs, setLogs] = useState([])
  const [currentSentence, setCurrentSentence] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [totalSentences, setTotalSentences] = useState(0)

  // Audio streaming state
  const [isStreamingAudio, setIsStreamingAudio] = useState(false)
  const [audioChunks, setAudioChunks] = useState([])
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [existingNote, setExistingNote] = useState(null)

  // WebSocket refs
  const wsRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioContextRef = useRef(null)
  const audioBufferRef = useRef(null)
  const audioSourceRef = useRef(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
  const wsUrl = `ws://${window.location.hostname}:8000/ws/explain/${window.location.pathname.split('/')[2]}`

  // Handle explain mode - start audio streaming
  useEffect(() => {
    if (generatedContent?.content && contentType === 'explain' && !isInteractiveMode) {
      // Start interactive mode and begin explanation
      setIsInteractiveMode(true)
      connectWebSocket()
    }
  }, [generatedContent, contentType])

  // Show success message for read content saved to notes
  useEffect(() => {
    if (generatedContent?.saved_to_notes && contentType === 'read') {
      console.log('Content saved to notes successfully!')
      // You can add a toast notification here if you have one
    }
  }, [generatedContent, contentType])

  // Handle playing existing audio from notes
  useEffect(() => {
    if (generatedContent?.audio_url && contentType === 'explain') {
      // Play existing audio directly
      playExistingAudio(generatedContent.audio_url)
    }
  }, [generatedContent?.audio_url, contentType])

  const playExistingAudio = async (audioUrl) => {
    try {
      const response = await fetch(audioUrl)
      const audioData = await response.arrayBuffer()
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext
      
      const audioBuffer = await audioContext.decodeAudioData(audioData)
      audioBufferRef.current = audioBuffer
      
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      audioSourceRef.current = source
      
      source.connect(audioContext.destination)
      source.start()
      
      setIsPlayingAudio(true)
      
      source.onended = () => {
        setIsPlayingAudio(false)
        audioContextRef.current = null
        audioBufferRef.current = null
        audioSourceRef.current = null
      }
      
    } catch (error) {
      console.error('Error playing existing audio:', error)
      setIsPlayingAudio(false)
    }
  }

  // WebSocket connection for interactive mode
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
    
    const ws = new WebSocket(wsUrl)
    ws.binaryType = "arraybuffer"
    
    ws.onopen = () => {
      setIsConnected(true)
      setLogs(prev => ["[Connected to Explain Mode]", ...prev])
      
      // Auto-start explanation if we have content
      if (generatedContent?.content && contentType === 'explain') {
        setTimeout(() => {
          startInteractiveExplanation()
        }, 500) // Small delay to ensure connection is stable
      }
    }
    
    ws.onclose = () => {
      setIsConnected(false)
      setLogs(prev => ["[Disconnected from Explain Mode]", ...prev])
    }
    
    ws.onerror = () => {
      setIsConnected(false)
      setLogs(prev => ["[Connection Error]", ...prev])
    }
    
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        console.log('WebSocket message received:', msg)
        console.log('Message type:', msg.type)
        
        if (msg.type === "event") {
          setLogs(prev => [`[${msg.event}] ${msg.text || ""}`, ...prev])
        } else if (msg.type === "explanation_start") {
          setIsPlaying(true)
          setIsPaused(false)
          setIsStreamingAudio(true)
          setAudioChunks([])
          setLogs(prev => ["[Explanation Started]", ...prev])
        } else if (msg.type === "audio_chunk") {
          // Handle audio chunk
          console.log('Received audio chunk, base64 length:', msg.data.length)
          const audioData = atob(msg.data)
          const audioArray = new Uint8Array(audioData.length)
          for (let i = 0; i < audioData.length; i++) {
            audioArray[i] = audioData.charCodeAt(i)
          }
          console.log('Converted audio chunk to Uint8Array, size:', audioArray.length)
          setAudioChunks(prev => [...prev, audioArray])
        } else if (msg.type === "existing_note_found") {
          setExistingNote(msg.note)
          setLogs(prev => [`[Resuming existing note] ${msg.note.topic}`, ...prev])
        } else if (msg.type === "explanation_complete") {
          setIsPlaying(false)
          setIsStreamingAudio(false)
          setLogs(prev => ["[Explanation Completed]", ...prev])
          // Play accumulated audio
          playAccumulatedAudio()
        } else if (msg.type === "explanation_paused") {
          setIsPaused(true)
          pauseAudioPlayback()
          setLogs(prev => ["[Explanation Paused]", ...prev])
        } else if (msg.type === "explanation_resumed") {
          setIsPaused(false)
          resumeAudioPlayback()
          setLogs(prev => ["[Explanation Resumed]", ...prev])
        } else if (msg.type === "tutor_audio_start") {
          setLogs(prev => ["[Tutor Audio Started]", ...prev])
        } else if (msg.type === "tutor_audio_complete") {
          setLogs(prev => ["[Tutor Audio Completed]", ...prev])
        } else if (msg.type === "explanation_stopped") {
          setIsPlaying(false)
          setIsPaused(false)
          stopSpeechSynthesis()
          setLogs(prev => ["[Explanation Stopped]", ...prev])
        } else if (msg.type === "question_received") {
          setUserQuestion(msg.question)
          setLogs(prev => [`[Question Received] ${msg.question}`, ...prev])
        } else if (msg.type === "tutor_response_chunk") {
          setTutorResponse(prev => prev + msg.chunk)
          setIsTutorResponding(true)
        } else if (msg.type === "tutor_response_complete") {
          setIsTutorResponding(false)
          setLogs(prev => [`[Tutor Response] ${msg.response}`, ...prev])
          // Speak the tutor response
          speakSentence(msg.response)
        } else if (msg.type === "transcript") {
          setLogs(prev => [`[Transcript] ${msg.text}`, ...prev])
        } else if (msg.type === "error") {
          setLogs(prev => [`[Error] ${msg.message}`, ...prev])
        }
      } catch (error) {
        console.log('Error parsing WebSocket message:', error)
      }
    }
    
    wsRef.current = ws
  }, [wsUrl])

  // Audio handling functions
  const playAccumulatedAudio = async () => {
    console.log('playAccumulatedAudio called, audioChunks length:', audioChunks.length)
    if (audioChunks.length === 0) return
    
    try {
      // Combine all audio chunks
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      console.log('Total audio length:', totalLength)
      const combinedArray = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of audioChunks) {
        combinedArray.set(chunk, offset)
        offset += chunk.length
      }
      
      console.log('Combined audio array size:', combinedArray.length)
      
      // Create audio context and play
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext
      
      const audioBuffer = await audioContext.decodeAudioData(combinedArray.buffer)
      audioBufferRef.current = audioBuffer
      
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      audioSourceRef.current = source
      
      source.connect(audioContext.destination)
      source.start()
      
      setIsPlayingAudio(true)
      
      source.onended = () => {
        setIsPlayingAudio(false)
        audioContextRef.current = null
        audioBufferRef.current = null
        audioSourceRef.current = null
      }
      
    } catch (error) {
      console.error('Error playing audio:', error)
      setIsPlayingAudio(false)
    }
  }
  
  const pauseAudioPlayback = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend()
    }
  }
  
  const resumeAudioPlayback = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
  }
  
  const stopAudioPlayback = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop()
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    setIsPlayingAudio(false)
    setAudioChunks([])
  }

  // Speech synthesis functions (fallback)
  const speakSentence = (text) => {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel()
      
      const utterance = new SpeechSynthesisUtterance(text)
      utteranceRef.current = utterance
      
      utterance.onend = () => {
        utteranceRef.current = null
        if (isInteractiveMode && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "sentence_complete" }))
        }
      }
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error)
        utteranceRef.current = null
      }
      
      speechSynthesis.speak(utterance)
    }
  }

  const pauseSpeechSynthesis = () => {
    if ("speechSynthesis" in window) {
      speechSynthesis.pause()
    }
  }

  const resumeSpeechSynthesis = () => {
    if ("speechSynthesis" in window) {
      speechSynthesis.resume()
    }
  }

  const stopSpeechSynthesis = () => {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel()
      utteranceRef.current = null
    }
  }

  // Interactive mode functions
  const startInteractiveExplanation = (sectionTitle = "", subsectionTitle = "", startPage = 0, endPage = 0) => {
    console.log('Starting interactive explanation with:', {
      content: generatedContent?.content,
      topic: topic,
      section_title: sectionTitle,
      subsection_title: subsectionTitle,
      start_page: startPage,
      end_page: endPage
    })
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = {
        type: "start_explanation",
        content: generatedContent.content,
        reading_content: generatedContent.reading_content || generatedContent.content, // Pass reading content if available
        topic: topic,
        section_title: sectionTitle,
        subsection_title: subsectionTitle,
        start_page: startPage,
        end_page: endPage,
        user_id: "default_user"
      }
      
      console.log('Sending WebSocket message:', message)
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.error('WebSocket not connected:', wsRef.current?.readyState)
    }
  }

  const pauseExplanation = () => {
    pauseAudioPlayback()
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "pause_explanation" }))
    }
  }

  const resumeExplanation = () => {
    resumeAudioPlayback()
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "resume_explanation" }))
    }
  }

  const stopExplanation = () => {
    stopAudioPlayback()
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop_explanation" }))
    }
  }

  const startRecording = () => {
    pauseSpeechSynthesis()
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          mediaRecorderRef.current = new MediaRecorder(stream)
          audioChunksRef.current = []

          mediaRecorderRef.current.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data)
          }

          mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
            const reader = new FileReader()
            reader.onload = () => {
              const arrayBuffer = reader.result
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(arrayBuffer)
                setLogs(prev => ["[Audio sent to server]", ...prev])
              }
            }
            reader.readAsArrayBuffer(audioBlob)
          }

          mediaRecorderRef.current.start()
          setIsRecording(true)
          setLogs(prev => ["[Recording started - Speech paused]", ...prev])
        })
        .catch(error => {
          console.error('Error accessing microphone:', error)
          setLogs(prev => [`[Error accessing microphone] ${error.message}`, ...prev])
        })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setLogs(prev => ["[Recording stopped]", ...prev])
    }
  }

  const raiseHand = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Regular mode functions
  const handlePlay = () => {
    if (isPaused) {
      setIsPaused(false)
      speechSynthesis.resume()
    } else {
      setIsPlaying(true)
      setIsPaused(false)
      setCurrentSentenceIndex(0)
    }
  }

  const handlePause = () => {
    setIsPaused(true)
    speechSynthesis.pause()
  }

  const handleStop = () => {
    setIsPlaying(false)
    setIsPaused(false)
    speechSynthesis.cancel()
    setCurrentSentenceIndex(0)
  }

  // Handle speech synthesis for regular mode
  useEffect(() => {
    if (isPlaying && !isInteractiveMode && sentences.length > 0 && currentSentenceIndex < sentences.length) {
      if (utteranceRef.current) {
        speechSynthesis.cancel()
      }

      const utterance = new SpeechSynthesisUtterance(sentences[currentSentenceIndex])
      
      utterance.onend = () => {
        if (!isPaused && currentSentenceIndex < sentences.length - 1) {
          setTimeout(() => {
            setCurrentSentenceIndex(prev => prev + 1)
          }, 200)
        } else if (currentSentenceIndex >= sentences.length - 1) {
          setIsPlaying(false)
          setCurrentSentenceIndex(0)
        }
      }
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error)
        if (event.error === 'interrupted') {
          if (currentSentenceIndex < sentences.length - 1) {
            setTimeout(() => {
              setCurrentSentenceIndex(prev => prev + 1)
            }, 200)
          } else {
            setIsPlaying(false)
            setCurrentSentenceIndex(0)
          }
        }
      }

      utteranceRef.current = utterance
      speechSynthesis.speak(utterance)
    }
  }, [isPlaying, currentSentenceIndex, sentences, isPaused, isInteractiveMode])

  // Connect WebSocket when interactive mode is enabled
  useEffect(() => {
    if (isInteractiveMode && contentType === 'explain' && generatedContent && topic) {
      connectWebSocket()
    }
  }, [isInteractiveMode, contentType, generatedContent, topic, connectWebSocket])

  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
      }
      stopSpeechSynthesis()
    }
  }, [])

  const getContentTypeIcon = () => {
    if (contentType === 'read') {
      return (
        <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    } else if (contentType === 'explain') {
      return (
        <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    return null
  }

  const getContentTypeTitle = () => {
    if (contentType === 'read') {
      return 'Reading Content'
    } else if (contentType === 'explain') {
      return 'Explanation Content'
    }
    return 'Content'
  }

  const getContentTypeColor = () => {
    if (contentType === 'read') {
      return 'blue'
    } else if (contentType === 'explain') {
      return 'green'
    }
    return 'gray'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Interactive Mode Toggle for Explain Content */}
            {contentType === 'explain' && (
              <button
                onClick={() => setIsInteractiveMode(!isInteractiveMode)}
                className={`inline-flex items-center px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isInteractiveMode 
                    ? 'bg-purple-500 text-white shadow-md' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {isInteractiveMode ? 'Interactive Mode' : 'Enable Interactive'}
              </button>
            )}

            {/* Regular Controls */}
            {!isGenerating && sentences.length > 0 && !isInteractiveMode && (
              <>
                <button
                  onClick={handlePlay}
                  disabled={isPlaying && !isPaused}
                  className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  {isPaused ? 'Resume' : 'Play'}
                </button>
                
                {isPlaying && (
                  <>
                    {isPaused ? (
                      <button
                        onClick={handlePlay}
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
              </>
            )}

            {/* Interactive Mode Controls */}
            {isInteractiveMode && (
              <>
                {!isPlaying && (
                  <button
                    onClick={startInteractiveExplanation}
                    disabled={!isConnected}
                    className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    Start Explanation
                  </button>
                )}

                {isPlaying && (
                  <>
                    {isPaused ? (
                      <button
                        onClick={resumeExplanation}
                        className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        Resume
                      </button>
                    ) : (
                      <button
                        onClick={pauseExplanation}
                        className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                        </svg>
                        Pause
                      </button>
                    )}
                    
                    <button
                      onClick={stopExplanation}
                      className="inline-flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 6h12v12H6z"/>
                      </svg>
                      Stop
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {/* Status Indicator */}
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                isPlaying ? 'bg-green-500 animate-pulse' : 
                isGenerating ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
              }`}></div>
              <span className="text-sm text-gray-600">
                {isGenerating ? 'Generating...' : 
                 isPlaying ? (isPaused ? 'Paused' : 'Playing') : 'Ready'}
              </span>
            </div>

            {/* Connection Status for Interactive Mode */}
            {isInteractiveMode && (
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        {sentences.length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>
                {isInteractiveMode ? `${currentIndex + 1} / ${totalSentences}` : `${currentSentenceIndex + 1} / ${sentences.length}`}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`bg-${getContentTypeColor()}-500 h-2 rounded-full transition-all duration-300`}
                style={{ 
                  width: `${isInteractiveMode 
                    ? ((currentIndex + 1) / totalSentences) * 100 
                    : ((currentSentenceIndex + 1) / sentences.length) * 100
                  }%` 
                }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Interactive Sidebar */}
        {isInteractiveMode && (
          <div className="w-80 bg-gradient-to-b from-purple-50 to-blue-50 border-r border-gray-200 flex flex-col">
            {/* Raise Hand Section */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-800 mb-3">Ask Questions</h3>
              <button
                onClick={raiseHand}
                disabled={!isConnected || !isPlaying}
                className={`w-full inline-flex items-center justify-center px-6 py-4 rounded-lg font-medium transition-all duration-200 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                    : 'bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                </svg>
                {isRecording ? 'Stop Recording' : 'Raise Hand & Ask'}
              </button>
            </div>

            {/* Current Sentence */}
            {currentSentence && (
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-800 mb-2">Currently Explaining:</h3>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-green-900 text-sm leading-relaxed">{currentSentence}</p>
                </div>
              </div>
            )}

            {/* User Question */}
            {userQuestion && (
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-800 mb-2">Your Question:</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-blue-900 text-sm leading-relaxed">{userQuestion}</p>
                </div>
              </div>
            )}

            {/* Tutor Response */}
            {tutorResponse && (
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-800 mb-2 flex items-center">
                  Tutor Response
                  {isTutorResponding && <span className="ml-2 text-xs text-purple-600">(Typing...)</span>}
                </h3>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-purple-900 text-sm leading-relaxed">{tutorResponse}</p>
                </div>
              </div>
            )}

            {/* Activity Log */}
            <div className="flex-1 p-4 overflow-hidden">
              <h3 className="text-sm font-medium text-gray-800 mb-2">Activity Log:</h3>
              <div className="space-y-1 h-full overflow-y-auto">
                {logs.slice(0, 20).map((log, index) => (
                  <div key={index} className="text-xs text-gray-600 font-mono bg-white rounded p-2">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Content Display */}
        <div className="flex-1 overflow-y-auto p-6">
          {isGenerating ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Generating Content</h3>
                <p className="text-gray-600">Please wait while we process your request...</p>
              </div>
            </div>
          ) : !generatedContent ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">No Content Available</h3>
                <p className="text-gray-600">Select a section from the Index Content tab to generate content.</p>
              </div>
            </div>
          ) : contentType === 'explain' ? (
            <div className="space-y-6">
              {/* Audio Streaming Interface */}
              <div className="text-center">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Audio Explanation</h3>
                <p className="text-gray-600 mb-4">Multi-speaker conversation between tutor and student</p>
                
                {/* Audio Status */}
                <div className="flex items-center justify-center space-x-4 mb-6">
                  <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                    isStreamingAudio ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      isStreamingAudio ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-sm font-medium">
                      {isStreamingAudio ? 'Streaming Audio' : 'Audio Ready'}
                    </span>
                  </div>
                  
                  <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                    isPlayingAudio ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      isPlayingAudio ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-sm font-medium">
                      {isPlayingAudio ? 'Playing' : 'Stopped'}
                    </span>
                  </div>
                </div>

                {/* Existing Note Info */}
                {existingNote && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center space-x-2 mb-2">
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-blue-700">Resuming Previous Note</span>
                    </div>
                    <p className="text-sm text-blue-600">
                      Found existing explanation for "{existingNote.topic}" - playing saved audio
                    </p>
                  </div>
                )}

                {/* Audio Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <button
                    onClick={pauseExplanation}
                    disabled={!isPlaying || !isConnected}
                    className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    ⏸️ Pause
                  </button>
                  
                  <button
                    onClick={resumeExplanation}
                    disabled={!isPaused || !isConnected}
                    className="px-6 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    ▶️ Resume
                  </button>
                  
                  <button
                    onClick={stopExplanation}
                    disabled={!isPlaying || !isConnected}
                    className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    ⏹️ Stop
                  </button>
                </div>

                {/* Progress Indicator */}
                {isStreamingAudio && (
                  <div className="mt-6">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full animate-pulse" style={{width: '100%'}}></div>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">Streaming audio explanation...</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Content Header */}
              <div className="flex items-center">
                {getContentTypeIcon()}
                <h3 className="text-lg font-semibold text-gray-900">
                  {getContentTypeTitle()}
                  {isPlaying && <span className="text-sm text-gray-600 ml-2">(Playing...)</span>}
                </h3>
              </div>

              {/* Success Message for Notes */}
              {generatedContent?.saved_to_notes && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-green-700">Content Saved to Notes</span>
                  </div>
                  <p className="text-sm text-green-600 mt-1">
                    This content has been automatically saved to your notes and will appear in the Notes tab.
                  </p>
                </div>
              )}

              {/* Content Sentences */}
              {sentences.length > 0 ? (
                <div className="space-y-3">
                  {sentences.map((sentence, index) => {
                    const isCurrentSentence = isInteractiveMode 
                      ? index === currentIndex 
                      : index === currentSentenceIndex
                    const isCompleted = isInteractiveMode 
                      ? index < currentIndex 
                      : index < currentSentenceIndex

                    return (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border transition-all duration-200 ${
                          isCurrentSentence
                            ? `bg-${getContentTypeColor()}-50 border-${getContentTypeColor()}-200 shadow-md`
                            : isCompleted
                            ? 'bg-green-50 border-green-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            isCurrentSentence
                              ? `bg-${getContentTypeColor()}-500 text-white`
                              : isCompleted
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-300 text-gray-600'
                          }`}>
                            {index + 1}
                          </div>
                          <p className={`flex-1 leading-relaxed ${
                            isCurrentSentence
                              ? `text-${getContentTypeColor()}-900 font-medium`
                              : isCompleted
                              ? 'text-green-800'
                              : 'text-gray-700'
                          }`}>
                            {sentence}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className={`p-4 bg-${getContentTypeColor()}-50 border border-${getContentTypeColor()}-200 rounded-lg`}>
                  <p className={`text-${getContentTypeColor()}-900 leading-relaxed`}>
                    {generatedContent.content}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}