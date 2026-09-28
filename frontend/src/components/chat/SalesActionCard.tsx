import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import type { SalesAction } from '../../types/chat';

interface SalesActionCardProps {
  salesAction: SalesAction;
  onQueryClick: (q: string) => void;
  onApplyProduct?: (productId: string) => void;
}

export const SalesActionCard: React.FC<SalesActionCardProps> = ({
  salesAction,
  onQueryClick,
  onApplyProduct,
}) => {
  const { isConnected, isStreaming } = useChat();
  const queries = salesAction.suggested_queries || [];
  const nextAction = salesAction.next_action;

  if (!queries.length && !nextAction?.label) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {nextAction?.label && onApplyProduct && nextAction.product_id && (
        <div className="pt-1">
          <button
            onClick={() => onApplyProduct(nextAction.product_id!)}
            className="button primary"
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            {nextAction.label} <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {queries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {queries.map((q, idx) => (
            <button
              key={idx}
              onClick={() => onQueryClick(q)}
              disabled={!isConnected || isStreaming}
              className="ai-prompt-chip ai-suggestion"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

