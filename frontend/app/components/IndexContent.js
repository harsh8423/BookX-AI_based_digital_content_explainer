'use client'
import React, { useState } from 'react'

export default function IndexContent({ pdf, onContentRequest, onSectionSelect }) {
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedSubsection, setSelectedSubsection] = useState(null)

  if (!pdf?.index_content?.index || pdf.index_content.index.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Index Available</h3>
          <p className="text-gray-600">Document structure will be analyzed when you start chatting.</p>
        </div>
      </div>
    )
  }

  const handleActionClick = (action, section, subsection = null) => {
    const targetSection = subsection || section
    const startPage = targetSection.start_pdf_page
    const endPage = targetSection.start_pdf_page + 2 // Default to 3 pages, can be made configurable
    
    if (action === 'flashcard' || action === 'quiz') {
      // For flashcards and quizzes, use onSectionSelect with action type
      if (onSectionSelect) {
        onSectionSelect({
          section_title: section.section_title,
          subsection_title: subsection ? subsection.subsection_title : null,
          start_pdf_page: startPage,
          end_pdf_page: endPage,
          summary: targetSection.summary,
          action: action
        })
      }
    } else if (onContentRequest) {
      // For read and explain, use onContentRequest
      onContentRequest({
        start_page: startPage,
        end_page: endPage,
        topic: targetSection.section_title || targetSection.subsection_title,
        type: action,
        section_title: section.section_title,
        subsection_title: subsection ? subsection.subsection_title : null
      })
    }
  }

  const ActionButtons = ({ section, subsection = null }) => (
    <div className="flex flex-wrap gap-2 mt-3">
      <button
        onClick={() => handleActionClick('read', section, subsection)}
        className="inline-flex items-center px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium rounded-lg transition-colors duration-200"
        title="Read this section"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Read
      </button>
      
      <button
        onClick={() => handleActionClick('explain', section, subsection)}
        className="inline-flex items-center px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-sm font-medium rounded-lg transition-colors duration-200"
        title="Explain this section"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Explain
      </button>
      
      <button
        onClick={() => handleActionClick('flashcard', section, subsection)}
        className="inline-flex items-center px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm font-medium rounded-lg transition-colors duration-200"
        title="Create flashcards for this section"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Flashcard
      </button>
      
      <button
        onClick={() => handleActionClick('quiz', section, subsection)}
        className="inline-flex items-center px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm font-medium rounded-lg transition-colors duration-200"
        title="Take quiz on this section"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Quiz
      </button>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {pdf.index_content?.title || pdf.title || pdf.filename}
          </h2>
          <p className="text-gray-600">Click on any section to explore content</p>
        </div>

        <div className="space-y-4">
          {pdf.index_content.index.map((section, index) => (
            <div 
              key={index} 
              className={`bg-white rounded-xl border transition-all duration-200 hover:shadow-md ${
                selectedSection === index ? 'border-blue-300 shadow-lg' : 'border-gray-200'
              }`}
            >
              <div 
                className="p-6 cursor-pointer"
                onClick={() => {
                  setSelectedSection(selectedSection === index ? null : index)
                  setSelectedSubsection(null)
                }}
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
                      {section.section_title || `Section ${index + 1}`}
                    </h3>
                    {section.summary && (
                      <p className="text-gray-600 mb-3 leading-relaxed">
                        {section.summary}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end space-y-2 ml-4">
                    {section.start_pdf_page && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                        Page {section.start_pdf_page}
                      </span>
                    )}
                    {section.start_document_page && section.start_document_page !== section.start_pdf_page && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                        Doc {section.start_document_page}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons for main section */}
                <ActionButtons section={section} />
              </div>

              {/* Subsections */}
              {section.subsections && section.subsections.length > 0 && selectedSection === index && (
                <div className="px-6 pb-6 border-t border-gray-100">
                  <div className="pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Subsections:</h4>
                    <div className="space-y-3">
                      {section.subsections.map((subsection, subIndex) => (
                        <div 
                          key={subIndex} 
                          className={`bg-gray-50 rounded-lg p-4 transition-all duration-200 ${
                            selectedSubsection === subIndex ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 text-sm mb-1">
                                {subsection.subsection_title}
                              </h5>
                              {subsection.summary && (
                                <p className="text-xs text-gray-600 mb-2">
                                  {subsection.summary}
                                </p>
                              )}
                            </div>
                            {subsection.start_pdf_page && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 ml-2">
                                Page {subsection.start_pdf_page}
                              </span>
                            )}
                          </div>
                          
                          {/* Action buttons for subsection */}
                          <ActionButtons section={section} subsection={subsection} />
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


