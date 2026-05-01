import React, { useEffect, useRef, useState } from 'react';

/**
 * Live/idle indicator shown in the dashboard header.
 *
 * Renders:
 *  - a colored dot (green when live, grey when idle/connecting)
 *  - a text label ("live" / "idle" / "connecting")
 *  - a slim live-bar below the header that fills left→right on each new event
 *
 * @param {{ lastEventAt: number|null, isIdle: boolean }} props
 */
export default function LiveIndicator({ lastEventAt, isIdle }) {
  // Track the fill animation trigger: bump a key on every new lastEventAt
  const [barKey, setBarKey] = useState(0);
  const prevEventAt = useRef(lastEventAt);

  useEffect(() => {
    if (lastEventAt != null && lastEventAt !== prevEventAt.current) {
      prevEventAt.current = lastEventAt;
      setBarKey(k => k + 1);
    }
  }, [lastEventAt]);

  const isConnecting = lastEventAt == null;
  const dotClass = isConnecting || isIdle ? 'live-dot' : 'live-dot live-dot--active';
  const labelClass = isConnecting
    ? 'live-label live-label--connecting'
    : isIdle
      ? 'live-label live-label--idle'
      : 'live-label live-label--active';
  const label = isConnecting ? 'connecting' : isIdle ? 'idle' : 'live';

  return (
    <div className="live-indicator" aria-label={`connection status: ${label}`}>
      <span className={dotClass} />
      <span className={labelClass}>{label}</span>
      {!isConnecting && (
        <div className="live-bar" role="presentation">
          <div
            key={barKey}
            className={barKey > 0 ? 'live-bar__fill live-bar__fill--animate' : 'live-bar__fill'}
          />
        </div>
      )}
    </div>
  );
}
