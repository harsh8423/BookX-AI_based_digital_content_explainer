'use client'
import React from 'react'

export default function AboutDocument({ pdf }) {
  if (!pdf) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Document Information</h3>
          <p className="text-gray-600">Document metadata is not available.</p>
        </div>
      </div>
    )
  }

  const metadata = pdf.metadata || {}
  const indexContent = pdf.index_content || {}

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
        {/* Document Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                {indexContent?.title || pdf.title || pdf.filename}
              </h1>
              <p className="text-gray-600">Document Information & Metadata</p>
            </div>
          </div>
        </div>

        {/* Basic Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">Filename:</span>
                <span className="text-gray-900 font-semibold">{pdf.filename}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">Status:</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  {pdf.analysis_status || 'Ready'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">Upload Date:</span>
                <span className="text-gray-900 font-semibold">
                  {pdf.created_at ? new Date(pdf.created_at).toLocaleDateString() : 'Unknown'}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {metadata.pages && (
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Total Pages:</span>
                  <span className="text-gray-900 font-semibold">{metadata.pages}</span>
                </div>
              )}
              {metadata.title && (
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Document Title:</span>
                  <span className="text-gray-900 font-semibold">{metadata.title}</span>
                </div>
              )}
              {metadata.author && (
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Author:</span>
                  <span className="text-gray-900 font-semibold">{metadata.author}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Document Structure Summary */}
        {indexContent?.index && indexContent.index.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Document Structure Summary
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">Total Sections:</span>
                <span className="text-gray-900 font-semibold">{indexContent.index.length}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">Total Subsections:</span>
                <span className="text-gray-900 font-semibold">
                  {indexContent.index.reduce((total, section) => total + (section.subsections?.length || 0), 0)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">Page Range:</span>
                <span className="text-gray-900 font-semibold">
                  {indexContent.index[0]?.start_pdf_page || 1} - {indexContent.index[indexContent.index.length - 1]?.start_pdf_page || metadata.pages || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Additional Metadata */}
        {Object.keys(metadata).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Additional Metadata
            </h2>
            <div className="space-y-2">
              {Object.entries(metadata).map(([key, value]) => {
                if (['pages', 'title', 'author'].includes(key)) return null
                return (
                  <div key={key} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600 font-medium capitalize">{key.replace(/_/g, ' ')}:</span>
                    <span className="text-gray-900 font-semibold">{String(value)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Cloudinary URL */}
        {pdf.cloudinary_url && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 text-indigo-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Storage Information
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">Storage Provider:</span>
                <span className="text-gray-900 font-semibold">Cloudinary</span>
              </div>
              <div className="py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium block mb-1">File URL:</span>
                <a 
                  href={pdf.cloudinary_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm break-all"
                >
                  {pdf.cloudinary_url}
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


