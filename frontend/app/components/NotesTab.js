'use client'
import React, { useState, useEffect } from 'react'

export default function NotesTab({ pdf, onPlayNote }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSection, setSelectedSection] = useState(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    if (pdf?.id) {
      fetchNotes()
    }
  }, [pdf?.id])

  const fetchNotes = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/pdfs/${pdf.id}/notes/sections`)
      if (!response.ok) {
        throw new Error('Failed to fetch notes')
      }
      const data = await response.json()
      setNotes(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePlayNote = (note) => {
    if (onPlayNote) {
      onPlayNote(note)
    }
  }

  const handleDeleteNote = async (noteId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${noteId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('Failed to delete note')
      }
      // Refresh notes
      await fetchNotes()
    } catch (err) {
      setError(err.message)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getDuration = (audioSize) => {
    // Rough estimation: 24kHz, 16-bit, mono = ~48KB per second
    const estimatedSeconds = Math.round(audioSize / 48000)
    const minutes = Math.floor(estimatedSeconds / 60)
    const seconds = estimatedSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Loading Notes</h3>
          <p className="text-gray-600">Fetching your saved explanations...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Error Loading Notes</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchNotes}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!notes || notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Notes Yet</h3>
          <p className="text-gray-600">Start explaining sections to create your first note!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Notes</h2>
          <p className="text-gray-600">Access your saved explanations organized by sections</p>
        </div>

        <div className="space-y-4">
          {notes.map((section, index) => (
            <div 
              key={index} 
              className={`bg-white rounded-xl border transition-all duration-200 hover:shadow-md ${
                selectedSection === index ? 'border-blue-300 shadow-lg' : 'border-gray-200'
              }`}
            >
              <div 
                className="p-6 cursor-pointer"
                onClick={() => setSelectedSection(selectedSection === index ? null : index)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
                      <svg 
                        className={`w-5 h-5 mr-2 transition-transform duration-200 ${
                          selectedSection === index ? 'rotate-90' : ''
                        }`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {section.section_title}
                      {section.subsection_title && (
                        <span className="text-sm text-gray-500 ml-2">
                          - {section.subsection_title}
                        </span>
                      )}
                    </h3>
                    <p className="text-gray-600 mb-3">
                      {section.total_notes} note{section.total_notes !== 1 ? 's' : ''} available
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                      {section.total_notes} Notes
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes list */}
              {selectedSection === index && (
                <div className="px-6 pb-6 border-t border-gray-100">
                  <div className="pt-4">
                    <div className="space-y-3">
                      {section.notes.map((note, noteIndex) => (
                        <div 
                          key={noteIndex} 
                          className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 text-sm mb-1">
                                {note.topic}
                              </h5>
                              <p className="text-xs text-gray-600 mb-2">
                                Pages {note.start_page}-{note.end_page}
                              </p>
                              <p className="text-xs text-gray-500">
                                Created: {formatDate(note.created_at)}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 ml-2">
                              {note.audio_url && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                  {note.audio_size ? getDuration(note.audio_size) : 'Audio'}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handlePlayNote(note)}
                              className="inline-flex items-center px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-sm font-medium rounded-lg transition-colors duration-200"
                              title="Play this explanation"
                            >
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
                              </svg>
                              Play
                            </button>
                            
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="inline-flex items-center px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-colors duration-200"
                              title="Delete this note"
                            >
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}