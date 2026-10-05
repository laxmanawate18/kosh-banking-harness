import React, { useState } from 'react';
import { post } from '../../services/api';

type Turn = { role: 'officer' | 'copilot'; text: string };

/** The officer copilot: reads the queue and drafts recommendations. It never decides; the officer does. */
export const OfficerCopilot: React.FC<{ requestId?: string }> = ({ requestId }) => {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    setTurns((t) => [...t, { role: 'officer', text }]);
    try {
      const res = await post<{ reply: string }>('/api/officer/copilot', {
        message: text, history: turns.slice(-10), ...(requestId ? { request_id: requestId } : {}),
      });
      setTurns((t) => [...t, { role: 'copilot', text: res.reply || 'No answer.' }]);
    } catch (err: any) {
      setError(err?.message || 'The copilot could not answer right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel-pad" aria-label="Officer copilot">
      <div className="panel-head" style={{ padding: 0 }}>
        <div>
          <h2>Officer copilot</h2>
          <p>Summaries, checks and draft recommendations. It never approves or rejects; you decide.</p>
        </div>
        <button type="button" className="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide' : 'Ask the copilot'}
        </button>
      </div>
      {open && (
        <>
          {turns.map((turn, i) => (
            <p key={i} className={turn.role === 'copilot' ? '' : 'muted'} style={{ whiteSpace: 'pre-wrap', margin: '10px 0' }}>
              <strong>{turn.role === 'copilot' ? 'Copilot' : 'You'}:</strong> {turn.text}
            </p>
          ))}
          {error && <p className="form-error" role="alert">{error}</p>}
          <form onSubmit={ask} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={requestId ? `Ask about ${requestId}…` : 'e.g. Which requests need me first, and why?'}
              aria-label="Question for the copilot"
            />
            <button type="submit" className="button primary" disabled={busy || !message.trim()}>
              {busy ? 'Thinking…' : 'Ask'}
            </button>
          </form>
        </>
      )}
    </section>
  );
};
