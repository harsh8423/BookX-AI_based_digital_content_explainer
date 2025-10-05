"use client";
import React, { useCallback, useRef, useState } from "react";
import { loadVAD, mergeFloat32, downsampleFloat32, encodeWavPCM16, rms } from "../lib/audio";

export default function MicSpeakingUI({ connected, onSend, onWarn, onStartStop, onExplanationOnly, isRecording, setIsRecording, explanationOnlyMode }) {
  const [audioLevel, setAudioLevel] = useState(0);
  const ctxRef = useRef(null);
  const srcRef = useRef(null);
  const procRef = useRef(null);
  const streamRef = useRef(null);
  const buffersRef = useRef([]);
  const inputRateRef = useRef(16000);

  const startRecording = useCallback(async () => {
    if (!connected) {
      onWarn?.("[not connected] click Connect first");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 48000 });
      inputRateRef.current = ctx.sampleRate;
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      src.connect(proc);
      proc.connect(ctx.destination);
      buffersRef.current = [];
      
      proc.onaudioprocess = (ev) => {
        const ch0 = ev.inputBuffer.getChannelData(0);
        buffersRef.current.push(new Float32Array(ch0));
        // Compute instantaneous RMS level for waveform animation
        let sumSquares = 0;
        for (let i = 0; i < ch0.length; i++) {
          const v = ch0[i];
          sumSquares += v * v;
        }
        const rmsLevel = Math.sqrt(sumSquares / ch0.length);
        setAudioLevel((prev) => prev * 0.85 + rmsLevel * 0.15);
      };
      
      ctxRef.current = ctx; 
      srcRef.current = src; 
      procRef.current = proc;
      setIsRecording(true);
    } catch (error) {
      onWarn?.(`[microphone error] ${error.message}`);
    }
  }, [connected, onWarn]);

  const stopRecording = useCallback(async () => {
    try {
      procRef.current?.disconnect();
      srcRef.current?.disconnect();
      await ctxRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    
    const merged = mergeFloat32(buffersRef.current);
    buffersRef.current = [];

    let trimmed = merged;
    try {
      const mod = await loadVAD();
      if (mod && mod.trimBuffer) {
        trimmed = await mod.trimBuffer(merged, inputRateRef.current, { aggressiveness: 2 });
      } else {
        const energy = rms(merged);
        if (energy < 0.001) {
          onWarn?.("[discarded: silence]");
          setIsRecording(false);
          return;
        }
      }
    } catch {
      const energy = rms(merged);
      if (energy < 0.001) {
        onWarn?.("[discarded: silence]");
        setIsRecording(false);
        return;
      }
    }
    
    const ds = downsampleFloat32(trimmed, inputRateRef.current, 16000);
    const wavBuf = encodeWavPCM16(ds, 16000);
    onSend?.(wavBuf);
    setAudioLevel(0);
    setIsRecording(false);
  }, [onSend, onWarn]);

  const handleMouseDown = useCallback(() => {
    startRecording();
  }, [startRecording]);

  const handleMouseUp = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return (
    <div className="flex items-center space-x-6">
      {/* Mic Speaking UI */}
      <div className="relative">
        <div className="relative w-32 h-32 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full flex items-center justify-center shadow-2xl">
          {/* Animated waves */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`absolute rounded-full border-2 ${
                  isRecording 
                    ? 'border-blue-400 animate-pulse' 
                    : 'border-gray-600'
                }`}
                style={{
                  width: `${60 + i * 8}px`,
                  height: `${60 + i * 8}px`,
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </div>
          
          {/* Mic icon - Push to Talk Button */}
          <button
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={(e) => { e.preventDefault(); handleMouseDown(); }}
            onTouchEnd={(e) => { e.preventDefault(); handleMouseUp(); }}
            className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording 
                ? 'bg-gradient-to-br from-red-400 via-red-500 to-red-600 scale-110' 
                : 'bg-gradient-to-br from-yellow-400 via-orange-500 to-purple-600 hover:scale-105'
            } ${!connected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            disabled={!connected}
            style={{ cursor: connected ? 'pointer' : 'not-allowed' }}
          >
            <svg 
              className="w-8 h-8 text-white" 
              fill="currentColor" 
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>
        </div>
        
        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full animate-pulse">
            <div className="w-full h-full bg-red-500 rounded-full animate-ping"></div>
          </div>
        )}
        
        {/* Push to Talk Label */}
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center">
          <p className="text-xs text-gray-600 font-medium">
            {isRecording ? 'Release to Send' : connected ? 'Hold to Talk' : 'Connect First'}
          </p>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-col space-y-3">
        <button
          onClick={onExplanationOnly}
          className={`px-6 py-3 font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${
            explanationOnlyMode 
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700' 
              : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700'
          }`}
        >
          {explanationOnlyMode ? 'Explain Only ✓' : 'Explain Only'}
        </button>
        
        <button
          onClick={onStartStop}
          className={`px-6 py-3 font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${
            connected 
              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700' 
              : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700'
          }`}
        >
          {connected ? 'Stop' : 'Start'}
        </button>
      </div>

    </div>
  );
}
