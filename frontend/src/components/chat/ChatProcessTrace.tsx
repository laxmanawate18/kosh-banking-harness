import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Code2,
  Cpu,
} from 'lucide-react';
import type { ExecutionStep } from '../../types/chat';
import { useI18n } from '../../i18n';

interface ChatProcessTraceProps {
  steps?: ExecutionStep[];
  isStreaming?: boolean;
  durationMs?: number;
}

export const ChatProcessTrace: React.FC<ChatProcessTraceProps> = ({
  steps = [],
  isStreaming = false,
  durationMs,
}) => {
  const { t } = useI18n();
  // If streaming and user hasn't toggled yet, default to open.
  // When finished streaming, keep open if there are steps or allow toggling.
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [userToggled, setUserToggled] = useState<boolean>(false);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  // When streaming finishes, if the user didn't explicitly toggle, collapse cleanly to keep chat uncluttered
  useEffect(() => {
    if (!isStreaming && !userToggled) {
      // Auto-collapse after turn completes to keep clean chat UI
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, userToggled]);

  if (!steps || steps.length === 0) {
    if (isStreaming) {
      return (
        <div className="chat-trace-container">
          <div className="chat-trace-header live">
            <div className="chat-trace-title">
              <Loader2 className="trace-spinner" size={13} />
              <span>{t('Understanding your request…')}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleToggleOpen = () => {
    setUserToggled(true);
    setIsOpen(prev => !prev);
  };

  const toggleDetail = (stepId: string) => {
    setExpandedDetails(prev => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const formatDuration = (ms?: number) => {
    if (!ms && ms !== 0) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const totalDuration = durationMs ?? (
    steps.length > 0
      ? Math.max(0, steps[steps.length - 1].timestamp - steps[0].timestamp)
      : undefined
  );

  const getStepIcon = (step: ExecutionStep) => {
    if (step.status === 'running') {
      return <Loader2 className="trace-spinner" size={13} />;
    }
    switch (step.type) {
      case 'skill':
        return <BookOpen size={13} className="text-skill" />;
      case 'tool_call':
        return <Wrench size={13} className="text-tool" />;
      case 'policy':
        return <ShieldCheck size={13} className="text-policy" />;
      case 'intent':
      default:
        return <Cpu size={13} className="text-intent" />;
    }
  };

  const getStepBadgeClass = (step: ExecutionStep) => {
    switch (step.type) {
      case 'skill':
        return 'badge-skill';
      case 'tool_call':
        return 'badge-tool';
      case 'policy':
        return 'badge-policy';
      case 'intent':
      default:
        return 'badge-intent';
    }
  };

  return (
    <div className={`chat-trace-container ${isOpen ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="chat-trace-header"
        onClick={handleToggleOpen}
        aria-expanded={isOpen}
        title={isOpen ? t('Hide the steps Mitra took') : t('Show the steps Mitra took')}
      >
        <div className="chat-trace-title">
          {isStreaming ? (
            <Loader2 className="trace-spinner text-brand" size={13} />
          ) : (
            <Sparkles size={13} className="trace-sparkle" />
          )}
          <strong>{t('Steps')}</strong>
          <span className="trace-count-pill">
            {steps.length === 1 ? t('1 step') : t('{count} steps', { count: steps.length })}
          </span>
          {totalDuration != null && totalDuration > 0 && (
            <span className="trace-dur-pill">{formatDuration(totalDuration)}</span>
          )}
          {isStreaming && (
            <span className="trace-live-indicator">
              <span className="trace-live-pulse" />
              {t('Running')}
            </span>
          )}
        </div>
        <div className="chat-trace-action">
          <span className="trace-toggle-label">{isOpen ? t('Hide') : t('View')}</span>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {isOpen && (
        <div className="chat-trace-body">
          <div className="chat-trace-timeline">
            {steps.map((step, idx) => {
              const hasArgs = step.args && Object.keys(step.args).length > 0;
              const hasResult = step.result !== undefined && step.result !== null;
              const hasInspector = hasArgs || hasResult;
              const isDetailOpen = !!expandedDetails[step.id];

              return (
                <div
                  key={step.id || idx}
                  className={`chat-trace-step ${step.status} ${getStepBadgeClass(step)}`}
                >
                  <div className="trace-node-track">
                    <div className="trace-node-icon">
                      {getStepIcon(step)}
                    </div>
                    {idx < steps.length - 1 && <div className="trace-node-line" />}
                  </div>

                  <div className="trace-step-content">
                    <div className="trace-step-top">
                      <span className="trace-step-label">{step.label}</span>
                      <div className="trace-step-meta">
                        {step.duration_ms != null && step.duration_ms > 0 && (
                          <span className="trace-step-time">{formatDuration(step.duration_ms)}</span>
                        )}
                        {step.status === 'completed' && (
                          <span className="trace-step-status ok">
                            <CheckCircle2 size={11} />
                          </span>
                        )}
                        {step.status === 'running' && (
                          <span className="trace-step-status running">{t('in progress')}</span>
                        )}
                      </div>
                    </div>

                    {step.detail && (
                      <p className="trace-step-detail">{step.detail}</p>
                    )}

                    {hasInspector && (
                      <div className="trace-inspector-wrap">
                        <button
                          type="button"
                          className="trace-inspector-toggle"
                          onClick={() => toggleDetail(step.id)}
                        >
                          <Code2 size={11} />
                          <span>
                            {isDetailOpen ? t('Hide details') : t('Inspect details')}
                            {hasArgs && ` ${t('({count} fields)', { count: Object.keys(step.args!).length })}`}
                          </span>
                          {isDetailOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        </button>

                        {isDetailOpen && (
                          <div className="trace-payload-viewer">
                            {hasArgs && (
                              <div className="trace-payload-section">
                                <span className="trace-payload-title">{t('Arguments:')}</span>
                                <pre>{JSON.stringify(step.args, null, 2)}</pre>
                              </div>
                            )}
                            {hasResult && (
                              <div className="trace-payload-section">
                                <span className="trace-payload-title">{t('Result:')}</span>
                                <pre>
                                  {typeof step.result === 'string'
                                    ? step.result
                                    : JSON.stringify(step.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
