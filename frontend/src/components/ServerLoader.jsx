import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import { API_BASE } from '../config';

export default function ServerLoader({ onReady }) {
  const [elapsed, setElapsed] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);

  // Track elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${API_BASE}/api/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        if (isMountedRef.current) {
          onReady();
        }
        return true;
      }
    } catch {
      // Backend starting up or unreachable
    }
    return false;
  }, [onReady]);

  useEffect(() => {
    isMountedRef.current = true;
    let pollTimeout = null;

    const poll = async () => {
      const ok = await checkHealth();
      if (!ok && isMountedRef.current) {
        pollTimeout = setTimeout(poll, 2500);
      }
    };

    poll();

    return () => {
      isMountedRef.current = false;
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [checkHealth, retryCount]);

  const handleRetry = () => {
    setElapsed(0);
    setRetryCount((prev) => prev + 1);
  };

  const getStatusText = () => {
    if (elapsed > 90) return 'Server taking longer than usual...';
    if (elapsed > 8) return 'Waking up server...';
    return 'Connecting to server...';
  };

  return (
    <div className="server-loader-container">
      <div className="server-loader-card">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20
        }}>
          <div style={{
            width: 26,
            height: 26,
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 700,
            fontSize: '0.8rem'
          }}>
            DW
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            DepthWizard
          </span>
        </div>

        <div className="server-spinner" />

        <div className="server-loader-status">
          {getStatusText()}
        </div>

        {elapsed > 60 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRetry}
            style={{ marginTop: 16, fontSize: '0.75rem', padding: '4px 10px' }}
          >
            <RotateCw size={12} />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}
