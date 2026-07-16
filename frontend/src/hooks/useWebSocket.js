import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(url) {
  const [data, setData]               = useState(null);
  const [orderFlowData, setOrderFlowData] = useState(null);
  const [intradayData, setIntradayData]   = useState(null);
  const [indexData, setIndexData]         = useState(null);
  const [optionSignals, setOptionSignals] = useState(null);
  const [foSignals, setFoSignals]         = useState(null);
  const [dominanceData, setDominanceData] = useState(null);
  const [status, setStatus]           = useState('connecting');
  const [statusMsg, setStatusMsg]     = useState('');
  const [progress, setProgress]       = useState(null);
  const wsRef          = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen  = () => setStatus('connected');
    ws.onclose = () => { setStatus('disconnected'); reconnectTimer.current = setTimeout(connect, 3000); };
    ws.onerror = () => setStatus('error');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if      (msg.type === 'screener_update')  { setData(msg); setStatus('connected'); setStatusMsg(''); setProgress(null); }
      else if (msg.type === 'orderflow_update') { setOrderFlowData(msg.data); }
      else if (msg.type === 'intraday_update')  { setIntradayData(msg.data); }
      else if (msg.type === 'index_update')     { setIndexData(msg.data); }
      else if (msg.type === 'options_update')   { setOptionSignals(msg.data); }
      else if (msg.type === 'fo_update')        { setFoSignals(msg.data); }
      else if (msg.type === 'dominance_update') { setDominanceData(msg.data); }
      else if (['status','orderflow_status','intraday_status','index_status','fo_status'].includes(msg.type)) {
        setStatusMsg(msg.message);
      }
      else if (['progress','orderflow_progress','intraday_progress','index_progress','fo_progress'].includes(msg.type)) {
        setProgress(msg);
        if (msg.type === 'progress') setStatusMsg(`${msg.phase} (${msg.pct || 0}%)`);
      }
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [connect]);

  const refresh = useCallback(() => wsRef.current?.send(JSON.stringify({ action: 'refresh' })), []);

  return { data, orderFlowData, intradayData, indexData, optionSignals, foSignals, dominanceData, status, statusMsg, progress, refresh };
}
