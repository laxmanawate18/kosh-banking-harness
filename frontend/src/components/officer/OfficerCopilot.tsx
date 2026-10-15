import React, { useState } from 'react';
import { post, postStream } from '../../services/api';
import { Icon } from '../common/Icon';
import { AnimatePresence, motion, DUR, EASE } from '../common/Animate';
import { Panel, errorText } from './StaffKit';

type Turn = { role: 'officer' | 'copilot'; text: string };
const SUGGESTIONS = ['Which requests need me first, and why?', 'Summarise the overdue care cases', 'Is the audit trail intact?'];

/** The officer copilot: reads the queue and drafts recommendations. It never decides; the officer does. */
export const OfficerCopilot: React.FC<{ requestId?: string }> = ({ requestId }) => {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    setBusy(true); setError(''); setMessage('');
    setTurns(t => [...t, { role: 'officer', text }]);
    let currentReply = '';
    let copilotTurnIndex = -1;

    try {
      const res = await postStream(
        '/api/officer/copilot',
        {
          message: text,
          history: turns.slice(-10),
          ...(requestId ? { request_id: requestId } : {}),
        },
        (delta: string) => {
          currentReply += delta;
          setTurns(t => {
            if (copilotTurnIndex === -1) {
              copilotTurnIndex = t.length;
              return [...t, { role: 'copilot', text: currentReply }];
            }
            return t.map((turn, i) => (i === copilotTurnIndex ? { ...turn, text: currentReply } : turn));
          });
        }
      );
      if (res.reply) {
        setTurns(t => {
          if (copilotTurnIndex >= 0 && copilotTurnIndex < t.length) {
            return t.map((turn, i) => (i === copilotTurnIndex ? { ...turn, text: res.reply } : turn));
          }
          return [...t, { role: 'copilot', text: res.reply }];
        });
      }
    } catch (err) {
      try {
        const fallback = await post<{ reply: string }>('/api/officer/copilot', {
          message: text,
          history: turns.slice(-10),
          ...(requestId ? { request_id: requestId } : {}),
          stream: false,
        });
        setTurns(t => {
          if (copilotTurnIndex >= 0 && copilotTurnIndex < t.length) {
            return t.map((turn, i) => (i === copilotTurnIndex ? { ...turn, text: fallback.reply } : turn));
          }
          return [...t, { role: 'copilot', text: fallback.reply || 'No answer.' }];
        });
      } catch (fallbackErr) {
        setError(errorText(fallbackErr, 'The copilot could not answer right now.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={<><Icon name="ai-banker" /> Officer copilot</>} label="Officer copilot"
      sub="Summaries, checks and draft recommendations. It never approves or rejects; you decide."
      actions={<button type="button" className="k-btn outline sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? 'Hide' : 'Ask the copilot'}</button>}>
      <AnimatePresence initial={false}>{open && (
        <motion.div className="st-copilot-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }} transition={{ duration: DUR.slow, ease: EASE }}>
          <div className="panel-body st-copilot">
            {turns.length === 0 && <div className="st-suggest">{SUGGESTIONS.map(s =>
              <button key={s} type="button" className="k-chip-btn" onClick={() => ask(s)} disabled={busy}>{s}</button>)}</div>}
            {turns.length > 0 && <ol className="st-chat" aria-live="polite">
              {turns.map((t, i) => (
                <motion.li key={i} className={t.role} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <span className="st-chat-who">{t.role === 'copilot' ? 'Copilot' : 'You'}</span>{t.text}
                </motion.li>))}
              {busy && <li className="copilot st-typing">Thinking…</li>}
            </ol>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <form className="st-ask" onSubmit={e => { e.preventDefault(); ask(message); }}>
              <input value={message} maxLength={2000} onChange={e => setMessage(e.target.value)} aria-label="Question for the copilot"
                placeholder={requestId ? `Ask about ${requestId}…` : 'e.g. Which requests need me first, and why?'} />
              <button type="submit" className="k-btn primary sm" disabled={busy || !message.trim()}>{busy ? 'Thinking…' : 'Ask'}</button>
            </form>
          </div>
        </motion.div>)}
      </AnimatePresence>
    </Panel>
  );
};
