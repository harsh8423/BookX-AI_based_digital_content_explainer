'use client'

import { useState, useRef } from 'react'
import { uploadPdfToCloudinary } from '../lib/cloudinary'
import { authService } from '../lib/auth'

export default function PDFUpload({ onUploadSuccess }) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const fileInputRef = useRef(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        setError('Please select a PDF file')
        return
      }

      // Validate file size (20MB limit)
      if (file.size > 25 * 1024 * 1024) {
        setError('File size must be less than 20MB')
        return
      }

      setError(null)
      setSuccess(null)
      uploadFile(file)
    }
  }

  const uploadFile = async (file) => {
    setIsUploading(true)
    setUploadProgress(0)

    try {
      // Step 1: Upload to Cloudinary
      setUploadProgress(25)
      const cloudinaryResult = await uploadPdfToCloudinary(file, {
        folder: 'bookx-pdfs',
        tags: ['bookx', 'pdf', 'document'],
        context: {
          filename: file.name,
          uploaded_by: 'bookx-app'
        }
      })

      setUploadProgress(50)

      // Step 2: Send to backend for processing
      const response = await fetch(`${API_BASE_URL}/pdfs/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify({
          cloudinary_url: cloudinaryResult.secure_url,
          filename: file.name,
          size: file.size,
          public_id: cloudinaryResult.public_id
        }),
      })

      setUploadProgress(75)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Upload failed')
      }

      const result = await response.json()
      setUploadProgress(100)

      setSuccess('PDF uploaded and analyzed successfully!')
      onUploadSuccess && onUploadSuccess()

      // Reset form
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

    } catch (error) {
      console.error('Upload error:', error)
      setError(error.message || 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
      setTimeout(() => {
        setUploadProgress(0)
        setError(null)
        setSuccess(null)
      }, 3000)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    const files = event.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect({ target: { files: [files[0]] } })
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload PDF</h3>
      
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-500 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <div className="space-y-4">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-900">
              {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              PDF files only (max 25MB, 1000 pages)
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {isUploading && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}
    </div>
  )
}