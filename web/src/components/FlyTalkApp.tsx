'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlyStage } from './FlyStage';
import { GestureCamera } from './GestureCamera';
import { useSimulation } from './useSimulation';
import { Dialogue } from '../dialogue/responses';
import { GESTURE_LABELS, STIMULI } from '../simulation/stimuli';
import { CHANNELS, GESTURES, type Gesture, type GestureEvent, type SimulationSnapshot } from '../simulation/types';

const CHANNEL_COLORS: Record<string, string> = {
  escape: '#ef4444', retreat: '#f59e0b', left: '#3b82f6', right: '#8b5cf6', approach: '#22c55e',
};
const CHANNEL_EMOJI: Record<string, string> = {
  escape: '🚨', retreat: '🔙', left: '⬅️', right: '➡️', approach: '🫶',
};

interface ChatMessage {
  id: number;
  text: string;
  behavior: string;
  gesture: string;
  timestamp: number;
}

export default function FlyTalkApp() {
  const { graph, snapshot, ready, error, stimulate, reset, retry } = useSimulation();
  const dialogue = useMemo(() => new Dialogue(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgId, setMsgId] = useState(0);
  const prevBehavior = useRef('IDLE');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Track behavior changes and generate dialogue
  useEffect(() => {
    if (!snapshot) return;
    const state = snapshot.behavior.state;
    if (state !== prevBehavior.current && state !== 'IDLE' && state !== 'STOP') {
      prevBehavior.current = state;
      const text = dialogue.next(state);
      setMsgId(prev => {
        const id = prev + 1;
        setMessages(msgs => [...msgs.slice(-19), { id, text, behavior: state, gesture: snapshot.stimulus, timestamp: Date.now() }]);
        return id;
      });
    } else {
      prevBehavior.current = state;
    }
  }, [snapshot?.behavior.state, snapshot?.stimulus, dialogue]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleGesture = useCallback((event: GestureEvent) => {
    stimulate(event);
  }, [stimulate]);

  const handleButton = useCallback((gesture: Gesture) => {
    stimulate({ gesture, timestamp: Date.now(), source: 'button' });
  }, [stimulate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const gesture = GESTURES.find(g => GESTURE_LABELS[g].key === e.key);
      if (gesture) { e.preventDefault(); handleButton(gesture); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); reset(); setMessages([]); prevBehavior.current = 'IDLE'; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleButton, reset]);

  // Error/loading states
  if (error) {
    return (
      <div className="ft-root">
        <div className="ft-error">
          <h2>⚠️ Simulation Error</h2>
          <p>{error}</p>
          <button onClick={retry} type="button">Retry</button>
        </div>
      </div>
    );
  }

  if (!ready || !snapshot || !graph) {
    return (
      <div className="ft-root">
        <div className="ft-loading">
          <div className="ft-spinner" />
          <h2>Loading Connectome…</h2>
          <p>Preparing {graph ? `${graph.manifest.neuronCount.toLocaleString()} neurons` : 'the real Drosophila brain'}…</p>
        </div>
      </div>
    );
  }

  const topChannel = CHANNELS.reduce((best, ch) => snapshot.scores[ch] > snapshot.scores[best] ? ch : best, CHANNELS[0]);

  return (
    <div className="ft-root">
      {/* Header */}
      <header className="ft-header">
        <div className="ft-brand">
          <span className="ft-logo">🪰</span>
          <div>
            <h1>FlyTalk</h1>
            <span className="ft-subtitle">Talk shit to a real connectome</span>
          </div>
        </div>
        <div className="ft-stats-bar">
          <span className="ft-stat"><em>{graph.manifest.neuronCount.toLocaleString()}</em> neurons</span>
          <span className="ft-stat-sep">·</span>
          <span className="ft-stat"><em>{graph.manifest.edgeCount.toLocaleString()}</em> synapses</span>
          <span className="ft-stat-sep">·</span>
          <span className="ft-stat"><em>{snapshot.activeNeurons.toLocaleString()}</em> active</span>
        </div>
        <button className="ft-reset-btn" onClick={() => { reset(); setMessages([]); prevBehavior.current = 'IDLE'; }} type="button" title="Reset simulation (R)">↻ Reset</button>
      </header>

      {/* Main content */}
      <div className="ft-main">
        {/* Left: Camera */}
        <div className="ft-left">
          <GestureCamera onGesture={handleGesture} enabled={ready} />
          {/* Gesture buttons */}
          <div className="ft-gesture-grid">
            {GESTURES.map(g => {
              const label = GESTURE_LABELS[g];
              return (
                <button key={g} className="ft-gesture-btn" onClick={() => handleButton(g)} type="button" title={`${label.hint} [${label.key}]`}>
                  <span className="gesture-emoji">{label.emoji}</span>
                  <span className="gesture-name">{label.label}</span>
                  <kbd>{label.key}</kbd>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Fly */}
        <div className="ft-center">
          <FlyStage behavior={snapshot.behavior} ready={ready} />
          {/* Status badge */}
          <div className="ft-behavior-badge" data-state={snapshot.behavior.state.toLowerCase()}>
            <span className="badge-state">{snapshot.behavior.state}</span>
            {snapshot.stimulusActive && <span className="badge-stimulus">⚡ {snapshot.stimulus}</span>}
          </div>
        </div>

        {/* Right: Activity + Chat */}
        <div className="ft-right">
          {/* Activity panel */}
          <div className="ft-activity">
            <h3>Neural Activity</h3>
            <div className="ft-channels">
              {CHANNELS.map(ch => (
                <div key={ch} className={`ft-channel ${ch === topChannel && snapshot.scores[ch] > 0.15 ? 'leading' : ''}`}>
                  <div className="channel-label">
                    <span>{CHANNEL_EMOJI[ch]}</span>
                    <span className="channel-name">{ch}</span>
                    <span className="channel-value">{(snapshot.scores[ch] * 100).toFixed(0)}%</span>
                  </div>
                  <div className="channel-bar-bg">
                    <div className="channel-bar-fill" style={{ width: `${Math.min(100, snapshot.scores[ch] * 100)}%`, backgroundColor: CHANNEL_COLORS[ch] }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="ft-sim-info">
              <span>t = {(snapshot.time / 1000).toFixed(1)}s</span>
              <span>{snapshot.stepMs.toFixed(1)}ms/step</span>
            </div>
          </div>

          {/* Chat */}
          <div className="ft-chat">
            <h3>🪰 Fly Says</h3>
            <div className="ft-messages">
              {messages.length === 0 && (
                <div className="ft-empty-chat">
                  <p>Make a gesture to provoke the fly…</p>
                  <p className="ft-empty-hint">Use the buttons below the camera or press keys 1-8</p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className="ft-msg" data-behavior={msg.behavior.toLowerCase()}>
                  <span className="msg-fly">🪰</span>
                  <div className="msg-content">
                    <p>{msg.text}</p>
                    <span className="msg-meta">{msg.behavior} · {msg.gesture}</span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
