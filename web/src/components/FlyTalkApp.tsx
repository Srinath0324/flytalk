'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Brain,
  ChevronRight,
  CircleHelp,
  Droplets,
  Eye,
  EyeOff,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { FlyStage, type Quality } from './FlyStage';
import Link from 'next/link';
import { GestureCamera } from './GestureCamera';
import { HandGestureIcon } from './HandGestureIcon';
import { useSimulation } from './useSimulation';
import { ActionDirector } from '../interaction/director';
import {
  CONTROLS,
  type DirectorSnapshot,
  type InteractionEvent,
  type Intent,
  type Point2,
} from '../interaction/types';
import { perchById } from '../interaction/world';
import { HabitatSound } from '../scene/sound';
import {
  CHANNELS,
  type Channel,
  type Manifest,
  type SimulationSnapshot,
} from '../simulation/types';

const PHASES: Record<string, string> = {
  resting: 'Taking it all in',
  anticipation: 'You have its attention',
  flying: 'A little adventure',
  offering: 'Following your nectar',
  landing: 'Coming in to land',
  feeding: 'A very small feast',
  grooming: 'Making a good impression',
  hovering: 'Hanging out with you',
};
const POPULATIONS: Record<Channel, string> = {
  escape: 'DNp01',
  retreat: 'MDN',
  left: 'DNa02 · left drive',
  right: 'DNa02 · right drive',
  approach: 'DNp09',
};

function FlyMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M18 20C8 4 0 11 9 22C12 26 17 26 18 20ZM22 20C32 4 40 11 31 22C28 26 23 26 22 20Z"
        fill="currentColor"
        opacity=".65"
      />
      <ellipse cx="20" cy="24" rx="4" ry="9" fill="currentColor" />
      <circle cx="17" cy="13" r="4" fill="currentColor" />
      <circle cx="23" cy="13" r="4" fill="currentColor" />
      <path
        d="m17 28-6 5m12-5 6 5M17 24l-9 2m15-2 9 2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function NeuralLens({
  snapshot,
  manifest,
  error,
  retry,
  close,
  metrics,
}: {
  snapshot: SimulationSnapshot | null;
  manifest: Manifest | null;
  error: string;
  retry: () => void;
  close: () => void;
  metrics: { fps: number; calls: number; low: boolean };
}) {
  const ids = useMemo(
    () =>
      manifest
        ? Array.from({ length: 84 }, (_, i) =>
            Math.floor((i * (manifest.neuronCount - 1)) / 83),
          )
        : [],
    [manifest],
  );
  return (
    <aside className="neural-drawer" aria-label="Neural Lens">
      <div className="drawer-heading">
        <span className="eyebrow">BENEATH THE BUZZ</span>
        <button
          className="icon-button"
          aria-label="Close Neural Lens"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <h2>
        A little wiring.
        <br />
        <em>A lot of personality.</em>
      </h2>
      <p className="drawer-intro">
        Real fruit-fly connections. Simulated activity. An expressive character
        brought to life through authored motion.
      </p>
      {error ? (
        <div className="neural-error">
          <p>
            Neural data is unavailable. Your companion still responds to every
            gesture.
          </p>
          <button onClick={retry}>Retry neural connection</button>
        </div>
      ) : !manifest || !snapshot ? (
        <p className="neural-loading">Loading and verifying the connectome…</p>
      ) : (
        <>
          <div className="neural-counts">
            <div>
              <strong>{manifest.neuronCount.toLocaleString()}</strong>
              <span>modeled neurons</span>
            </div>
            <div>
              <strong>{manifest.edgeCount.toLocaleString()}</strong>
              <span>retained connections</span>
            </div>
          </div>
          <div className="neural-map">
            <div className="neural-map-heading">
              <span>ACTIVITY SAMPLE</span>
              <span>{snapshot.activeNeurons.toLocaleString()} active</span>
            </div>
            <svg
              viewBox="0 0 336 138"
              aria-label="Activity of 84 sampled neurons, arranged diagrammatically"
            >
              {ids.map((id, i) => {
                const v = snapshot.activity[id] ?? 0;
                return (
                  <circle
                    key={id}
                    cx={12 + (i % 14) * 24}
                    cy={14 + Math.floor(i / 14) * 23}
                    r={2 + v * 5}
                    fill={v > 0.01 ? '#d9bb73' : '#5c7667'}
                    opacity={v > 0.01 ? 0.45 + v * 0.55 : 0.3}
                  />
                );
              })}
            </svg>
            <small>Recorded neuron IDs · diagrammatic arrangement</small>
          </div>
          <div className="neural-channels">
            {CHANNELS.map((ch) => (
              <div className="neural-channel" key={ch}>
                <div>
                  <span>{POPULATIONS[ch]}</span>
                  <strong>
                    {Math.round(snapshot.scores[ch] * 100)}
                    <small>%</small>
                  </strong>
                </div>
                <div className="neural-track">
                  <span style={{ width: `${snapshot.scores[ch] * 100}%` }} />
                </div>
                <small>Raw drive {snapshot.rawScores[ch].toFixed(5)}</small>
              </div>
            ))}
          </div>
          <p className="neural-note">
            Percentages are relative to measured calibration peaks, not
            confidence. The graph-only decoder currently reads{' '}
            <strong>
              {snapshot.behavior.state.toLowerCase().replaceAll('_', ' ')}
            </strong>
            . Actions remain intentionally authored.
          </p>
          <div className="neural-meta">
            <span>
              {manifest.synapseCount.toLocaleString()} represented synapses
            </span>
            <span>
              {snapshot.stepMs.toFixed(1)} ms / neural step ·{' '}
              {metrics.fps || '—'} render fps
            </span>
          </div>
        </>
      )}
      <details className="research-notes">
        <summary>
          How this tiny world works <ChevronRight size={15} />
        </summary>
        <p>
          Eight hand commands inject engineering cues into a simplified,
          nonnegative activity model over a 5,000-neuron subnetwork. Real
          activity can increase secondary motion by up to 20%. Nectar,
          friendship, jokes, and aerial tricks are authored; no taste, emotion,
          or sign-language understanding is claimed.
        </p>
        <p>
          The anatomical avatar is adapted from the female flybody model. Neural
          wiring comes from a separate male specimen in MaleCNS v1.0.
        </p>
        <a
          href="https://male-cns.janelia.org/download/"
          target="_blank"
          rel="noreferrer"
        >
          MaleCNS · CC BY 4.0 <ArrowUpRight size={13} />
        </a>
        <a
          href="https://github.com/TuragaLab/flybody"
          target="_blank"
          rel="noreferrer"
        >
          flybody · anatomical source <ArrowUpRight size={13} />
        </a>
        <a href="/models/fly/credits.json" target="_blank" rel="noreferrer">
          Asset provenance <ArrowUpRight size={13} />
        </a>
      </details>
    </aside>
  );
}

export default function FlyTalkApp() {
  const director = useMemo(() => new ActionDirector(), []);
  const {
    manifest,
    snapshot,
    ready,
    error,
    stimulate,
    reset: resetNeural,
    retry,
    setDetailed,
    setPlayback,
    advancePlayback,
  } = useSimulation();
  const [view, setView] = useState<DirectorSnapshot>(() => ({
    ...director.snapshot,
  }));
  const [lens, setLens] = useState(false),
    [guide, setGuide] = useState(false),
    [settings, setSettings] = useState(false),
    [clean, setClean] = useState(false);
  const [quality, setQuality] = useState<Quality>('auto'),
    [sound, setSound] = useState(false),
    [reducedMotion, setReducedMotion] = useState(false);
  const [cameraKey, setCameraKey] = useState(0),
    [inputReset, setInputReset] = useState(0);
  const [metrics, setMetrics] = useState({ fps: 0, calls: 0, low: false });
  const [notice, setNotice] = useState('');
  const bubbleRef = useRef<HTMLDivElement>(null),
    rootRef = useRef<HTMLElement>(null);
  const manualOffer = useRef<string | null>(null),
    manualTarget = useRef<Point2>({ x: 0.3, y: 0.5 }),
    counter = useRef(0);
  const audio = useRef<HabitatSound | null>(null),
    soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const refresh = useCallback(
    () => setView({ ...director.snapshot }),
    [director],
  );
  const flush = useCallback(() => {
    for (const gesture of director.drainNeuralEvents())
      stimulate({ gesture, timestamp: performance.now(), source: 'button' });
  }, [director, stimulate]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(query.matches);
    change();
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(
    () => director.setReducedMotion(reducedMotion),
    [director, reducedMotion],
  );
  useEffect(() => {
    setDetailed(lens);
  }, [lens, setDetailed]);
  useEffect(() => {
    let frame = 0,
      last = 0,
      paint = 0;
    const tick = (time: number) => {
      if (!document.hidden) {
        const playing = director.snapshot.demo;
        director.update(last ? Math.min((time - last) / 1000, 0.06) : 0);
        if (playing) {
          advancePlayback(director.snapshot.time);
          if (!director.snapshot.demo) setPlayback(false);
        }
        flush();
        if (time - paint > 80) {
          refresh();
          paint = time;
        }
        audio.current?.update(
          director.snapshot.pose.flight,
          director.snapshot.pose.position[0],
          soundRef.current,
        );
      } else audio.current?.update(0, 0, false);
      last = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      audio.current?.dispose();
      audio.current = null;
    };
  }, [director, flush, refresh, advancePlayback, setPlayback]);

  const onCamera = useCallback(
    (event: InteractionEvent) => {
      if (director.snapshot.demo) return;
      if (director.dispatch(event)) {
        manualOffer.current = null;
        flush();
        refresh();
      }
    },
    [director, flush, refresh],
  );
  const command = useCallback(
    (intent: Intent, source: 'keyboard' | 'pointer' = 'pointer') => {
      if (director.snapshot.demo) setPlayback(false);
      setInputReset((n) => n + 1);
      const id = `${source}-${++counter.current}`;
      manualOffer.current = intent === 'OFFER_NECTAR' ? id : null;
      if (intent === 'OFFER_NECTAR') manualTarget.current = { x: 0.3, y: 0.5 };
      director.dispatch({
        id,
        intent,
        phase: 'start',
        time: director.snapshot.time,
        source,
        target: intent === 'OFFER_NECTAR' ? manualTarget.current : undefined,
      });
      flush();
      refresh();
    },
    [director, flush, refresh, setPlayback],
  );
  const moveNectar = useCallback(
    (target: Point2, source: 'keyboard' | 'pointer') => {
      if (!manualOffer.current) return;
      manualTarget.current = {
        x: Math.max(0.05, Math.min(0.95, target.x)),
        y: Math.max(0.05, Math.min(0.95, target.y)),
      };
      director.dispatch({
        id: manualOffer.current,
        intent: 'OFFER_NECTAR',
        phase: 'update',
        time: director.snapshot.time,
        source,
        target: manualTarget.current,
      });
      refresh();
    },
    [director, refresh],
  );
  const commitNectar = useCallback(
    (source: 'keyboard' | 'pointer') => {
      if (!manualOffer.current) return;
      director.dispatch({
        id: manualOffer.current,
        intent: 'OFFER_NECTAR',
        phase: 'commit',
        time: director.snapshot.time,
        source,
        perchId: director.snapshot.nectar?.perchId,
      });
      manualOffer.current = null;
      refresh();
    },
    [director, refresh],
  );
  const reset = useCallback(() => {
    director.reset();
    resetNeural();
    manualOffer.current = null;
    setInputReset((n) => n + 1);
    setCameraKey((n) => n + 1);
    refresh();
  }, [director, resetNeural, refresh]);
  const demo = () => {
    manualOffer.current = null;
    setInputReset((n) => n + 1);
    if (director.snapshot.demo) {
      director.stopDemo();
      setPlayback(false);
    } else {
      setPlayback(true);
      director.startDemo();
    }
    refresh();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      )
        return;
      if (e.repeat && !e.key.startsWith('Arrow')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setLens(false);
        setGuide(false);
        setSettings(false);
        command('STOP', 'keyboard');
        return;
      }
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setClean((v) => !v);
        return;
      }
      if (manualOffer.current) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitNectar('keyboard');
          return;
        }
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          moveNectar(
            {
              x:
                manualTarget.current.x +
                (e.key === 'ArrowRight'
                  ? 0.05
                  : e.key === 'ArrowLeft'
                    ? -0.05
                    : 0),
              y:
                manualTarget.current.y +
                (e.key === 'ArrowDown'
                  ? 0.05
                  : e.key === 'ArrowUp'
                    ? -0.05
                    : 0),
            },
            'keyboard',
          );
          return;
        }
      }
      const control = CONTROLS.find((c) => c.key === e.key);
      if (control) {
        e.preventDefault();
        command(control.intent, 'keyboard');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [command, reset, commitNectar, moveNectar]);
  const toggleSound = async () => {
    if (sound) {
      setSound(false);
      return;
    }
    try {
      audio.current ??= new HabitatSound();
      await audio.current.enable();
      setSound(true);
    } catch {
      setNotice('Sound could not start. Try the sound control again.');
    }
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      setNotice('Use your browser’s fullscreen control to expand the habitat.');
    }
  };
  const vigor =
    ready && snapshot
      ? 1 + 0.2 * Math.max(...Object.values(snapshot.scores))
      : 1;
  const offering = view.nectar && !view.nectar.committed;
  const manualOffering =
    !!offering && /^(keyboard|pointer)-/.test(view.actionId);

  return (
    <main
      ref={rootRef}
      className={`flytalk ${clean ? 'is-clean' : ''}`}
      data-action={view.intent ?? 'IDLE'}
      data-phase={view.phase}
      data-mood={view.mood}
      data-demo={view.demo}
      data-neural={ready ? 'ready' : error ? 'error' : 'loading'}
      data-neural-error={error || undefined}
    >
      <FlyStage
        director={director}
        quality={quality}
        cameraKey={cameraKey}
        reducedMotion={reducedMotion}
        vigor={vigor}
        bubbleRef={bubbleRef}
        onMetrics={setMetrics}
      />
      {manualOffering && (
        <button
          className="nectar-placement"
          aria-label="Place nectar on the selected perch"
          onPointerMove={(e) => {
            const bounds = rootRef.current?.getBoundingClientRect();
            if (!bounds) return;
            moveNectar(
              {
                x: (e.clientX - bounds.left) / bounds.width,
                y: (e.clientY - bounds.top) / bounds.height,
              },
              'pointer',
            );
          }}
          onClick={() => commitNectar('pointer')}
        />
      )}
      <header className="app-header hud">
        <Link className="brand" href="/" aria-label="FlyTalk home">
          <span className="brand-mark">
            <FlyMark />
          </span>
          <span>
            flytalk<span className="brand-dot">.</span>
          </span>
        </Link>
        <span className="header-caption">A SMALL EXPERIMENT IN CONNECTION</span>
        <nav className="header-actions" aria-label="Habitat controls">
          <button
            className={`text-button ${lens ? 'is-active' : ''}`}
            onClick={() => {
              setLens(!lens);
              setSettings(false);
            }}
            aria-expanded={lens}
          >
            <Brain size={16} />
            <span>Neural lens</span>
            <span className={`status-light ${ready ? 'is-live' : ''}`} />
          </button>
          <span className="header-divider" />
          <button
            className="icon-button"
            onClick={toggleSound}
            aria-label={sound ? 'Mute sound' : 'Enable sound'}
            title={sound ? 'Mute sound' : 'Enable sound'}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            className="icon-button"
            onClick={() => setSettings(!settings)}
            aria-label="Display settings"
            aria-expanded={settings}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="icon-button"
            onClick={fullscreen}
            aria-label="Toggle fullscreen"
          >
            <Maximize size={16} />
          </button>
        </nav>
      </header>

      <div className="intro-copy hud">
        <span className="eyebrow">
          <span className="tiny-line" />
          MEET YOUR SMALLEST FRIEND
        </span>
        <h1>
          Small fly.
          <br />
          <em>Big personality.</em>
        </h1>
        <p>
          A gesture. A little curiosity.
          <br />
          An unlikely connection.
        </p>
        <button className="intro-cta" onClick={() => command('OFFER_NECTAR')}>
          <Droplets size={15} />
          Make the first move <ArrowUpRight size={15} />
        </button>
      </div>

      <div className="specimen hud">
        <span className="specimen-dot" />
        <span>
          DROSOPHILA
          <br />
          <strong>melanogaster</strong>
        </span>
        <span className="specimen-number">01</span>
      </div>

      <div
        ref={bubbleRef}
        className={`thought-bubble ${view.bubble ? 'is-visible' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="thought-label">A TINY THOUGHT</span>
        <p key={view.bubble?.id}>{view.bubble?.text ?? ''}</p>
        <i />
        <b />
      </div>

      <div className="camera-position hud">
        <GestureCamera
          onInteraction={onCamera}
          enabled
          suspended={view.demo}
          resetKey={inputReset}
        />
      </div>

      <div className="interaction-status" aria-live="polite">
        <span className={`mood-dot mood-${view.mood}`} />
        <span>{view.demo ? 'Demo playback' : PHASES[view.phase]}</span>
        <span className="status-separator">/</span>
        <small>{view.mood}</small>
      </div>
      {offering && (
        <div className="nectar-instruction">
          <Droplets size={17} />
          <span>
            {manualOffering
              ? 'Move the nectar. Click or Enter to feed.'
              : 'Move your hand. Open your fingers to feed.'}
            <small>
              {perchById(view.nectar!.perchId).label} is ready · Esc to cancel
            </small>
          </span>
        </div>
      )}

      <div className="bottom-interface hud">
        <div className="dock-caption">
          <span>MAKE A LITTLE CONVERSATION</span>
          <button onClick={() => setGuide(!guide)}>
            <CircleHelp size={13} />
            Gesture guide
          </button>
        </div>
        <div
          className="gesture-dock"
          role="toolbar"
          aria-label="Fly interactions"
        >
          {CONTROLS.map((c) => {
            return (
              <button
                key={c.intent}
                className={`gesture-control ${c.intent === 'OFFER_NECTAR' ? 'nectar-control' : ''} ${view.intent === c.intent && !['resting', 'hovering'].includes(view.phase) ? 'is-active' : ''}`}
                onClick={() => command(c.intent)}
                aria-label={`${c.label} (${c.key})`}
                title={`${c.hint} · ${c.key}`}
              >
                <span className="gesture-icon">
                  <HandGestureIcon intent={c.intent} title={c.hint} />
                </span>
                <span className="gesture-name">{c.label}</span>
                <kbd>{c.key}</kbd>
              </button>
            );
          })}
        </div>
        <div className="bottom-meta">
          <span>YOUR HANDS. ITS LITTLE WORLD.</span>
          <span className="orbit-hint">
            Drag to look around · Scroll to get closer
          </span>
          <button onClick={reset}>
            <RotateCcw size={12} />
            Start fresh <kbd>R</kbd>
          </button>
        </div>
      </div>

      <div className="showcase-controls hud">
        <button
          className={`showcase-button ${view.demo ? 'is-playing' : ''}`}
          onClick={demo}
        >
          {view.demo ? (
            <Pause size={14} />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          <span>{view.demo ? 'End demo' : 'Meet the fly'}</span>
          <small>35 SEC</small>
        </button>
        <button
          className="icon-button"
          onClick={() => setClean(true)}
          aria-label="Hide interface for recording"
          title="Clean view · H"
        >
          <EyeOff size={16} />
        </button>
      </div>
      {clean && (
        <button className="restore-interface" onClick={() => setClean(false)}>
          <Eye size={15} />
          Show controls <kbd>H</kbd>
        </button>
      )}
      {view.demo && (
        <div
          className="demo-progress"
          style={{ width: `${Math.min(100, view.time / 350)}%` }}
        />
      )}

      {settings && (
        <div className="popover settings-popover hud">
          <div className="popover-title">
            Make yourself comfortable
            <button
              className="icon-button"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X size={15} />
            </button>
          </div>
          <label>
            Visual quality
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
            >
              <option value="auto">Adaptive</option>
              <option value="high">High</option>
              <option value="low">Light</option>
            </select>
          </label>
          <label className="toggle-row">
            Gentler motion
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
          </label>
          <button
            className="text-button"
            onClick={() => setCameraKey((n) => n + 1)}
          >
            <RotateCcw size={14} />
            Reset view
          </button>
          <small>
            {metrics.fps || '—'} fps · {metrics.calls} draw calls ·{' '}
            {metrics.low ? 'light' : 'high'} detail
          </small>
        </div>
      )}
      {guide && (
        <section
          className="gesture-guide popover hud"
          aria-label="Gesture guide"
        >
          <div className="popover-title">
            Say it with a gesture
            <button
              className="icon-button"
              onClick={() => setGuide(false)}
              aria-label="Close gesture guide"
            >
              <X size={17} />
            </button>
          </div>
          <p>
            Hold a pose briefly. Switch straight to another pose; close your
            hand briefly to repeat the same one. Follow the green tracking
            outline.
          </p>
          <div className="guide-steps">
            <span>
              <b>01</b>Pinch to offer
            </span>
            <ChevronRight size={14} />
            <span>
              <b>02</b>Move the nectar
            </span>
            <ChevronRight size={14} />
            <span>
              <b>03</b>Open to feed
            </span>
          </div>
          <div className="guide-grid">
            {CONTROLS.map((c) => (
              <div key={c.intent}>
                <HandGestureIcon intent={c.intent} title={c.hint} />
                <kbd>{c.key}</kbd>
                <span>
                  <strong>{c.label}</strong>
                  <small>{c.hint}</small>
                </span>
              </div>
            ))}
          </div>
          <p className="guide-note">
            Camera processing stays on your device. Every action also works with
            the controls and keyboard. These are hand gestures, not
            sign-language translation.
          </p>
        </section>
      )}
      {lens && (
        <NeuralLens
          snapshot={snapshot}
          manifest={manifest}
          error={error}
          retry={retry}
          close={() => setLens(false)}
          metrics={metrics}
        />
      )}
      {notice && (
        <output className="notice">
          {notice}
          <button onClick={() => setNotice('')} aria-label="Dismiss notice">
            <X size={15} />
          </button>
        </output>
      )}
      <output className="sr-only" data-testid="render-metrics">
        {metrics.fps} fps, {metrics.calls} draw calls
      </output>
    </main>
  );
}
