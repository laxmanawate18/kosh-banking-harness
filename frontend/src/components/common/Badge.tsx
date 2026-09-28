import React from 'react';
import { useI18n } from '../../i18n';

interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  status?: string;
}

function humanize(text: string): string {
  if (text === 'BLOCKED_MULE') return 'Blocked';
  const clean = text.replaceAll('_', ' ').toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

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
  const label = (text: string) => labels[text] ?? humanize(text);

  const targetStatus = status || (typeof children === 'string' ? children : '');
  const DANGER = ['DENY', 'DENIED', 'REJECTED', 'BLOCKED_MULE', 'LOCKED', 'FAILED', 'OVERDUE', 'NOT_DONE'];
  const WARNING = ['PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED', 'CHALLENGE', 'CHALLENGE_REQUIRED', 'FROZEN', 'NEW', 'DUE', 'IN_REVIEW', 'PENDING', 'PENDING_RE_KYC', 'OPEN'];
  const NEUTRAL = ['CANCELLED', 'SUBMITTED', 'SUBMITTED_FOR_REVIEW', 'DRAFT', 'CLOSED', 'UNKNOWN'];
  // An explicit variant always wins; otherwise derive the colour from the status code.
  const v = variant
    || (DANGER.includes(targetStatus) ? 'danger'
      : WARNING.includes(targetStatus) ? 'warning'
        : NEUTRAL.includes(targetStatus) ? 'neutral' : 'success');

  const variantClass = v === 'danger' ? 'danger' : v === 'warning' ? 'warning' : v === 'neutral' ? 'neutral' : '';

  const displayContent =
    typeof children === 'string'
      ? label(children)
      : status
      ? label(status)
      : children;

  return <span className={`badge ${variantClass}`}>{displayContent}</span>;
};
