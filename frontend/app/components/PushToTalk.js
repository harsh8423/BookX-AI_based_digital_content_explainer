"use client";
import React, { useCallback, useRef, useState } from "react";
import { loadVAD, mergeFloat32, downsampleFloat32, encodeWavPCM16, rms } from "../lib/audio";

export default function PushToTalk({ connected, onSend, onWarn }) {
  const [recording, setRecording] = useState(false);
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
    if (recording) return;
    
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
      setRecording(true);
    } catch (error) {
      onWarn?.(`[microphone error] ${error.message}`);
    }
  }, [connected, recording, onWarn]);

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    
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
          setRecording(false);
          return;
        }
      }
    } catch {
      const energy = rms(merged);
      if (energy < 0.001) {
        onWarn?.("[discarded: silence]");
        setRecording(false);
        return;
      }
    }
    
    const ds = downsampleFloat32(trimmed, inputRateRef.current, 16000);
    const wavBuf = encodeWavPCM16(ds, 16000);
    onSend?.(wavBuf);
    setRecording(false);
    setAudioLevel(0);
  }, [recording, onSend, onWarn]);

  return (
    <div style={{ textAlign: 'center' }}>
      {/* Main Voice Button */}
      <div style={{ marginBottom: '24px' }} className="ptt-wrapper">
        <div className="ptt-rings">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
          className={`ptt-button-core ${recording ? 'recording' : ''}`}
          disabled={!connected}
          style={{ cursor: connected ? 'pointer' : 'not-allowed' }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 10,
            position: 'relative',
            zIndex: 1
          }}>
            <div style={{ fontSize: 28 }}>{recording ? '🔴' : '🎤'}</div>
            <div className="ptt-label">
              {recording ? 'Release to Send' : connected ? 'Hold to Talk' : 'Disconnected'}
            </div>
          </div>
        </button>
      </div>

      {/* Live Waveform */}
      <div className={`waveform free colorful ${recording ? 'recording' : connected ? 'idle' : ''}`} style={{ marginBottom: 16 }}>
        {Array.from({ length: 28 }).map((_, index) => {
          // Shape the bar height based on current audioLevel and index falloff
          const positionFactor = 1 - Math.abs((index - 14) / 14); // center bars taller
          const leveled = Math.min(1, audioLevel * 3);
          const heightPct = 8 + (leveled * 60 + positionFactor * 20);
          // Premium colorful hue across bars
          const totalBars = 28;
          const hueStart = recording ? 350 : 190;
          const hueRange = recording ? 80 : 140;
          const hue = (hueStart + (index / (totalBars - 1)) * hueRange) % 360;
          const saturation = 85;
          const lightness = 55 + Math.min(10, leveled * 10);
          const gradTop = `hsla(${hue}, ${saturation}%, ${Math.min(100, lightness + 5)}%, 1)`;
          const gradBottom = `hsla(${(hue + 10) % 360}, ${saturation}%, ${Math.max(0, lightness - 6)}%, 1)`;
          return (
            <span
              key={index}
              className="wave-bar"
              style={{ 
                height: `${heightPct}%`, 
                animationDelay: `${index * 40}ms`,
                background: `linear-gradient(180deg, ${gradTop}, ${gradBottom})`,
                boxShadow: `0 0 10px hsla(${hue}, ${saturation}%, 60%, ${recording ? 0.45 : 0.3})`
              }}
            />
          );
        })}
      </div>


      {/* Status Indicator */}
      <div style={{ marginTop: '24px' }}>
        <div className={`status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`}>
          <div className={`pulse-dot ${connected ? 'pulse-dot-green' : 'pulse-dot-red'}`}></div>
          <span className="font-medium">{connected ? 'Ready to Record' : 'Connect First'}</span>
          {connected && (
            <div className="flex items-center ml-2">
              <div className="w-1 h-1 bg-current rounded-full animate-ping" style={{ animationDelay: '0ms' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-ping ml-1" style={{ animationDelay: '150ms' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-ping ml-1" style={{ animationDelay: '300ms' }}></div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .ptt-wrapper {
          position: relative;
          display: inline-block;
        }

        .ptt-rings {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 200px;
          height: 200px;
        }

        .ptt-rings span {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border: 2px solid rgba(59, 130, 246, 0.3);
          border-radius: 50%;
          animation: ripple 2s infinite;
        }

        .ptt-rings span:nth-child(1) {
          width: 200px;
          height: 200px;
          animation-delay: 0s;
        }

        .ptt-rings span:nth-child(2) {
          width: 250px;
          height: 250px;
          animation-delay: 0.5s;
        }

        .ptt-rings span:nth-child(3) {
          width: 300px;
          height: 300px;
          animation-delay: 1s;
        }

        @keyframes ripple {
          0% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 0;
          }
        }

        .ptt-button-core {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          position: relative;
          z-index: 10;
        }

        .ptt-button-core:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
        }

        .ptt-button-core:active {
          transform: translateY(0);
        }

        .ptt-button-core.recording {
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }

        .ptt-label {
          font-size: 12px;
          font-weight: 500;
          text-align: center;
        }

        .waveform {
          display: flex;
          align-items: end;
          justify-content: center;
          gap: 2px;
          height: 60px;
          padding: 0 20px;
        }

        .wave-bar {
          width: 3px;
          background: linear-gradient(180deg, #667eea, #764ba2);
          border-radius: 2px;
          transition: height 0.1s ease;
          animation: wave 1.5s ease-in-out infinite;
        }

        .waveform.recording .wave-bar {
          animation: wave-recording 0.8s ease-in-out infinite;
        }

        @keyframes wave {
          0%, 100% { height: 8%; }
          50% { height: 20%; }
        }

        @keyframes wave-recording {
          0%, 100% { height: 15%; }
          50% { height: 80%; }
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .status-connected {
          color: #10b981;
        }

        .status-disconnected {
          color: #ef4444;
        }

        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          animation: pulse-dot 2s infinite;
        }

        .pulse-dot-green {
          background: #10b981;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
          animation: pulse-green 2s infinite;
        }

        .pulse-dot-red {
          background: #ef4444;
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
          animation: pulse-red 2s infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes pulse-green {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 10px rgba(16, 185, 129, 0);
          }
          
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }

        @keyframes pulse-red {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          }
          
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
          }
          
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }
      `}</style>
    </div>
  );
}