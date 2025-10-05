'use client'
import React from 'react'

export default function VoiceConversation({ logs, partial }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center mb-6 shadow-lg">
                <svg className="w-12 h-12 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 36">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h4 className="text-xl font-semibold text-gray-800 mb-2">Ready to Start Chatting</h4>
              <p className="text-gray-600">Use the voice interface to ask questions about your document.</p>
            </div>
          </div>
        ) : (
          logs.map((log, index) => {
            const isUser = log.startsWith('User:');
            const isAssistant = log.startsWith('Assistant:');
            const isSystem = log.startsWith('[');
            
            return (
              <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] ${
                  isUser ? 'ml-8' : isAssistant ? 'mr-8' : ''
                }`}>
                  {isSystem ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 34">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">{log}</span>
                      </div>
                    </div>
                  ) : (
                    <div className={`rounded-2xl shadow-lg border ${
                      isUser 
                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white border-primary-600' 
                        : 'bg-gradient-to-br from-green-50 to-green-100 text-gray-800 border-green-200'
                    }`}>
                      <div className="px-6 py-4">
                        {!isSystem && (
                          <div className="flex items-center mb-2">
                            {isUser ? (
                              <>
                                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mr-3">
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 30">
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                  </svg>
                                </div>
                                <span className="text-sm font-medium opacity-80">You</span>
                              </>
                            ) : (
                              <>
                                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-3">
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 36">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                  </svg>
                                </div>
                                <span className="text-sm font-medium text-green-700">Assistant</span>
                              </>
                            )}
                          </div>
                        )}
                        <p className={`whitespace-pre-wrap leading-relaxed ${
                          isUser ? 'text-white' : 'text-gray-800'
                        }`}>
                          {isUser || isAssistant ? log.replace(/^(User|Assistant): /, '') : log}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        
        {partial && (
          <div className="flex justify-start">
            <div className="max-w-[70%] mr-8">
              <div className="bg-gradient-to-br from-green-50 to-green-100 text-gray-800 border border-green-200 rounded-2xl shadow-lg">
                <div className="px-6 py-4">
                  <div className="flex items-center mb-2">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 36">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-green-700">Assistant</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-gray-800">
                    {partial}
                    <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-1"></span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


