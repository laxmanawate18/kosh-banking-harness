import React from 'react';
import { useI18n } from '../../i18n';
import { humanizeCode } from './Formatters';

interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  status?: string;
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export const Badge: React.FC<BadgeProps> = ({ children, variant, status }) => {
  const { t } = useI18n();
  // Backend status codes shown to the user; anything else falls back to humanize().
  const labels: Record<string, string> = {
    ACTIVE: t('Active'),
    VERIFIED: t('Verified'),
    COMPLETED: t('Completed'),
    APPROVED: t('Approved'),
    EXECUTED: t('Executed'),
    SUCCESS: t('Success'),
    PAID: t('Paid'),
    OPEN: t('Unresolved'),
    CLOSED: t('Closed'),
    DRAFT: t('Draft'),
    FAILED: t('Failed'),
    OVERDUE: t('Overdue'),
    DENY: t('Denied'),
    DENIED: t('Denied'),
    REJECTED: t('Rejected'),
    BLOCKED_MULE: t('Blocked'),
    LOCKED: t('Locked'),
    PENDING_APPROVAL: t('Pending approval'),
    MORE_INFO_REQUIRED: t('More information needed'),
    ESCALATED: t('Escalated'),
    CHALLENGE: t('Verification needed'),
    CHALLENGE_REQUIRED: t('Verification needed'),
    FROZEN: t('Frozen'),
    NEW: t('New'),
    DUE: t('Due'),
    IN_REVIEW: t('In review'),
    PENDING: t('Pending'),
    CANCELLED: t('Cancelled'),
    SUBMITTED: t('Submitted'),
    SUBMITTED_FOR_REVIEW: t('Submitted for review'),
    NOT_DONE: t('Not done'),
    PENDING_RE_KYC: t('Re-KYC pending'),
    UNKNOWN: t('Unknown'),
  };
  // Codes ("PENDING_APPROVAL") become words; text that is already words ("In Kosh") is shown as written.
  const label = (text: string) => labels[text] ?? (/^[A-Z0-9_]+$/.test(text) ? humanizeCode(text === 'BLOCKED_MULE' ? 'BLOCKED' : text) : text);

  const targetStatus = (status || (typeof children === 'string' ? children : '')).toUpperCase();
  // One status -> tone map for customers, officers and the admin. Unknown statuses are neutral, never "success".
  const TONES: Record<Tone, string[]> = {
    danger: ['DENY', 'DENIED', 'REJECTED', 'BLOCKED_MULE', 'BLOCKED', 'LOCKED', 'FAILED', 'OVERDUE', 'NOT_DONE', 'ERROR', 'BROKEN',
      'RPA_FAILED', 'UNREACHABLE', 'HIGH', 'CRITICAL'],
    warning: ['PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED', 'CHALLENGE', 'CHALLENGE_REQUIRED', 'FROZEN', 'DUE', 'IN_REVIEW',
      'PENDING', 'PENDING_RE_KYC', 'OPEN', 'IN_PROGRESS', 'SANDBOX', 'MEDIUM', 'WARNING', 'NOT_CLEARED', 'PARTIAL'],
    info: ['NEW', 'QUALIFIED', 'APPLIED', 'CONTACTED', 'CONFIGURED', 'QUEUED_FOR_CBS', 'RPA_EXECUTING', 'SUBMITTED', 'SUBMITTED_FOR_REVIEW',
      'RUNNING', 'SHOWN', 'CLICKED'],
    success: ['ACTIVE', 'VERIFIED', 'COMPLETED', 'APPROVED', 'EXECUTED', 'SUCCESS', 'PAID', 'CONVERTED', 'CONNECTED', 'ON', 'PASSES',
      'INTACT', 'CLEARED', 'IMPLEMENTED', 'RESOLVED', 'LOW', 'SETTLED', 'POSTED'],
    neutral: [],
  };
  // An explicit variant always wins; otherwise derive the tone from the status code.
  const v: Tone = variant || (Object.keys(TONES) as Tone[]).find(k => TONES[k].includes(targetStatus)) || 'neutral';

  const displayContent =
    typeof children === 'string'
      ? label(children)
      : status
      ? label(status)
      : children;

  // The dot repeats the tone in shape, and the label says it in words: status never relies on colour alone.
  return <span className={`badge ${v}`}><i className="badge-dot" aria-hidden="true" />{displayContent}</span>;
};
