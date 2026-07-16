// index analyzer

const { detect15mPatterns } = require('./intradayPatterns');

// Re-use the same 45-pattern engine but adapted for index candles
// Indices don't have "volume" in the traditional sense — use tick volume from Yahoo

function calcEMA(data, period) {
  if (!data || data.length < period) return data?.[data.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) e = data[i] * k + e * (1 - k);
  return e;
}

function calcSMA(data, period) {
  if (data.length < period) return data[data.length - 1];
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

function calcMACD(closes) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const line = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = closes.slice(0, i);
    line.push(calcEMA(s, 12) - calcEMA(s, 26));
  }
  const sig = line.length >= 9 ? calcEMA(line, 9) : line[line.length - 1];
  const val = line[line.length - 1];
  return { macd: parseFloat(val.toFixed(2)), signal: parseFloat(sig.toFixed(2)), histogram: parseFloat((val - sig).toFixed(2)) };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  const trs = candles.slice(1).map((c, i) => {
    const p = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  });
  return parseFloat((trs.slice(-period).reduce((a, b) => a + b, 0) / period).toFixed(2));
}

function calcBB(closes, period = 20) {
  if (closes.length < period) return null;
  const sl = closes.slice(-period);
  const mid = sl.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(sl.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
  return { upper: parseFloat((mid + 2 * std).toFixed(2)), middle: parseFloat(mid.toFixed(2)), lower: parseFloat((mid - 2 * std).toFixed(2)), std: parseFloat(std.toFixed(2)) };
}

function calcStoch(candles, period = 14) {
  if (candles.length < period) return 50;
  const sl = candles.slice(-period);
  const hi = Math.max(...sl.map(c => c.high));
  const lo = Math.min(...sl.map(c => c.low));
  const cl = candles[candles.length - 1].close;
  return hi === lo ? 50 : parseFloat(((cl - lo) / (hi - lo) * 100).toFixed(2));
}

// --- All 45 patterns for a single timeframe ----------------------------------
function detectIndexPatterns(candles, tf) {
  if (!candles || candles.length < 20) return [];
  const patterns = [];
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume || 0);
  const n       = closes.length - 1;
  const cur     = closes[n];

  const ema9   = calcEMA(closes, 9);
  const ema20  = calcEMA(closes, 20);
  const ema21  = calcEMA(closes, 21);
  const ema50  = calcEMA(closes, 50);
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200) : null;
  const rsiVal = calcRSI(closes, tf === '15m' ? 9 : 14);
  const macdVal= calcMACD(closes);
  const atrVal = calcATR(candles, tf === '15m' ? 10 : 14);
  const bbVal  = calcBB(closes, 20);
  const stochV = calcStoch(candles, tf === '15m' ? 9 : 14);

  const avgVol  = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
  const lastVol = volumes[n];
  const volR    = avgVol > 0 ? parseFloat((lastVol / avgVol).toFixed(2)) : 1;

  const inUp    = tf === '15m' ? ema9 > ema21 : ema20 > ema50;
  const above200= ema200 ? cur > ema200 : true;

  const push = (name, strength, category, desc, entry, target, sl) => {
    const rr = (target && sl && entry && entry !== sl)
      ? parseFloat(((target - entry) / Math.abs(entry - sl)).toFixed(2)) : null;
    patterns.push({ name, strength, signal: 'BUY', category, desc, tf,
      entry: parseFloat(entry.toFixed(2)),
      target: parseFloat(target.toFixed(2)),
      stopLoss: parseFloat(sl.toFixed(2)),
      rr });
  };

  const highN = Math.max(...highs.slice(-Math.min(252, highs.length)));
  if (cur >= highN * 0.999 && volR >= 1.5) push('High Breakout', 92, 'Breakout', 'Breaking recent high with volume on '+tf, cur, cur+atrVal*2, highN*0.995);

  if (closes.length >= 51) {
    const e1=tf==='15m'?ema9:ema20, e2=tf==='15m'?ema21:ema50;
    const ep=calcEMA(closes.slice(0,-1),tf==='15m'?9:20), ep2=calcEMA(closes.slice(0,-1),tf==='15m'?21:50);
    if (e1>e2&&ep<=ep2) push('Golden Cross EMA', 85, 'Trend', 'EMA bullish cross on '+tf, cur, cur+atrVal*2, cur-atrVal);
  }

  if (closes.length>=201&&ema200) {
    const e50p=calcEMA(closes.slice(0,-1),50),e200p=calcEMA(closes.slice(0,-1),200);
    if (ema50>ema200&&e50p<=e200p) push('Major Golden Cross EMA50/200', 95, 'Trend', 'EMA50 crossed EMA200 on '+tf, cur, cur+atrVal*3, cur-atrVal*1.5);
  }

  if (n>=12&&inUp) {
    const pH=Math.max(...highs.slice(-12,-4)),pL=Math.min(...lows.slice(-12,-4));
    const fH=Math.max(...highs.slice(-4)),fL=Math.min(...lows.slice(-4)),pm=pH-pL,fr=fH-fL;
    if (pm>0&&fr<pm*0.4&&fL>pL&&cur>=fH*0.999&&volR>=1.3) push('Bull Flag', 88, 'Continuation', 'Tight flag breakout on '+tf, cur, cur+pm*0.8, fL-atrVal*0.5);
  }

  if (closes.length>=60) {
    const cL=Math.max(...highs.slice(-60,-40)),cB=Math.min(...lows.slice(-40,-20)),cR=Math.max(...highs.slice(-20,-5)),hL=Math.min(...lows.slice(-5));
    if (cR>=cL*0.95&&cB<cL*0.85&&hL>cB*1.02&&cur>=cR*0.98&&volR>=1.2) push('Cup & Handle', 93, 'Continuation', 'Cup & handle breakout on '+tf, cur, cur+(cR-cB), hL-atrVal*0.5);
  }

  const r6=Math.max(...highs.slice(-6))-Math.min(...lows.slice(-6));
  const r20=Math.max(...highs.slice(-20))-Math.min(...lows.slice(-20));
  if (r20>0&&r6<r20*0.25&&volR>=2.0&&inUp) push('Consolidation Breakout', 88, 'Breakout', 'Tight range breakout 2x vol on '+tf, cur, cur+r20*0.5, Math.min(...lows.slice(-6))-atrVal*0.3);

  if (n>=16) {
    const rH=highs.slice(-16),rL=lows.slice(-16),mxH=Math.max(...rH),mnH=Math.min(...rH);
    if ((mxH-mnH)/mxH<0.015&&rL[rL.length-1]>rL[0]*1.01&&cur>=mxH*0.999&&volR>=1.5) push('Ascending Triangle', 86, 'Reversal', 'Flat resistance + rising lows on '+tf, cur, mxH+(mxH-Math.min(...rL)), rL[rL.length-1]-atrVal*0.3);
  }

  if (n>=20) {
    const l1=Math.min(...lows.slice(-20,-10)),l2=Math.min(...lows.slice(-10)),neck=Math.max(...closes.slice(-20));
    if (Math.abs(l1-l2)/l1<0.025&&cur>=neck*0.998&&volR>=1.3) push('Double Bottom', 84, 'Reversal', 'W-pattern neckline breakout on '+tf, cur, cur+(neck-l1), l2-atrVal*0.3);
  }

  if (n>=60) {
    const lS=Math.min(...lows.slice(-60,-40)),hd=Math.min(...lows.slice(-40,-20)),rS=Math.min(...lows.slice(-20)),neck=Math.max(...closes.slice(-60));
    if (hd<lS*0.97&&hd<rS*0.97&&Math.abs(lS-rS)/lS<0.04&&cur>=neck*0.98&&volR>=1.2) push('Inverse Head & Shoulders', 91, 'Reversal', 'IH&S neckline confirmed on '+tf, cur, cur+(neck-hd), rS-atrVal*0.3);
  }

  if (bbVal) {
    const bw=(bbVal.upper-bbVal.lower)/bbVal.middle;
    if (bw<0.03&&cur>bbVal.upper&&volR>=1.5) push('BB Squeeze Breakout', 89, 'Breakout', 'BB squeeze releasing upward on '+tf, cur, cur+bbVal.std*3, bbVal.middle);
  }

  if (closes.length>=35) {
    const mp=calcMACD(closes.slice(0,-1));
    if (macdVal.macd>macdVal.signal&&mp.macd<=mp.signal&&macdVal.histogram>0) push('MACD Bullish Cross', 82, 'Momentum', 'MACD crossed signal on '+tf, cur, cur+atrVal*1.5, cur-atrVal);
  }

  if (closes.length>=15) {
    const rp=calcRSI(closes.slice(0,-1),tf==='15m'?9:14);
    if (rp<35&&rsiVal>=35&&rsiVal<55&&inUp) push('RSI Oversold Recovery', 80, 'Momentum', 'RSI bouncing from oversold on '+tf, cur, cur+atrVal*1.5, cur-atrVal*0.8);
  }

  const sup=Math.min(...lows.slice(-20,-1));
  if (cur>=sup*0.998&&cur<=sup*1.005&&closes[n]>closes[n-1]&&volR>=1.2&&inUp) push('Support Bounce', 77, 'Support/Resistance', 'Bouncing off support on '+tf, cur, cur+atrVal*2, sup-atrVal*0.5);

  if (stochV>20&&stochV<45&&inUp) {
    const sp=calcStoch(candles.slice(0,-1),tf==='15m'?9:14);
    if (sp<20&&stochV>=20) push('Stochastic Cross', 76, 'Momentum', 'Stoch out of oversold on '+tf, cur, cur+atrVal*1.5, cur-atrVal*0.8);
  }

  if (inUp&&above200&&cur>ema20&&cur>(ema200||0)) push('Strong Uptrend All EMAs', 82, 'Trend', 'Price above all EMAs on '+tf, cur, cur+atrVal*2, ema20-atrVal*0.3);
  if (volR>=3.0&&cur>closes[n-1]&&inUp) push('Volume Climax Breakout', 86, 'Breakout', volR+'x volume surge on '+tf, cur, cur+atrVal*2, cur-atrVal);

  if (n>=20&&inUp) {
    const pH2=highs.slice(-10),pL2=lows.slice(-10),hS=(pH2[9]-pH2[0])/10,lS2=(pL2[9]-pL2[0])/10;
    if (hS<0&&lS2>0&&Math.abs(hS)<atrVal*0.3&&volR>=1.5) push('Pennant Breakout', 81, 'Continuation', 'Converging pennant on '+tf, cur, cur+atrVal*2.5, Math.min(...pL2)-atrVal*0.3);
  }

  if (n>=2) {
    const c1=candles[n-2],c2=candles[n-1],c3=candles[n];
    if (c1.close<c1.open&&(c1.open-c1.close)>atrVal*0.6&&Math.abs(c2.close-c2.open)<atrVal*0.25&&c3.close>c3.open&&(c3.close-c3.open)>atrVal*0.6&&volR>=1.2) push('Morning Star', 81, 'Candlestick', '3-candle reversal on '+tf, cur, cur+atrVal*2, c1.low-atrVal*0.2);
  }

  if (n>=1) {
    const c=candles[n],body=Math.abs(c.close-c.open),lw=Math.min(c.open,c.close)-c.low,uw=c.high-Math.max(c.open,c.close);
    if (lw>=body*2.5&&uw<body*0.5&&c.close>c.open&&inUp) push('Hammer / Pin Bar', 78, 'Candlestick', 'Long lower wick rejection on '+tf, cur, cur+atrVal*1.5, c.low-atrVal*0.2);
  }

  if (n>=8) {
    const h1=Math.max(...highs.slice(-8,-4)),h2=Math.max(...highs.slice(-4)),l1=Math.min(...lows.slice(-8,-4)),l2=Math.min(...lows.slice(-4));
    if (h2>h1*1.002&&l2>l1*1.002) push('HH-HL Structure', 79, 'Trend', 'Higher highs & lows on '+tf, cur, cur+atrVal*1.5, l2-atrVal*0.3);
  }

  if (n>=1) {
    const pv=candles[n-1],cv=candles[n];
    if (pv.close<pv.open&&cv.close>cv.open&&cv.open<=pv.close&&cv.close>=pv.open&&volR>=1.3) push('Bullish Engulfing', 83, 'Candlestick', 'Engulfing on '+tf, cur, cur+atrVal*1.5, pv.low-atrVal*0.3);
  }

  if (n>=2) {
    const c1=candles[n-2],c2=candles[n-1],c3=candles[n];
    if (c1.close>c1.open&&c2.close>c2.open&&c3.close>c3.open&&c2.close>c1.close&&c3.close>c2.close&&c2.open>=c1.open&&c2.open<=c1.close&&c3.open>=c2.open&&c3.open<=c2.close) push('Three White Soldiers', 85, 'Candlestick', '3 green candles on '+tf, cur, cur+atrVal*2, candles[n-2].open-atrVal*0.3);
  }

  if (n>=1) {
    const pv=candles[n-1],cv=candles[n],mid=(pv.open+pv.close)/2;
    if (pv.close<pv.open&&cv.close>cv.open&&cv.open<pv.low&&cv.close>mid&&cv.close<pv.open) push('Piercing Line', 76, 'Candlestick', 'Piercing line on '+tf, cur, cur+atrVal*1.5, pv.low-atrVal*0.2);
  }

  if (n>=1) {
    const pv=candles[n-1],cv=candles[n];
    if (pv.close<pv.open&&cv.close>cv.open&&cv.open>=pv.close&&cv.close<=pv.open&&(cv.close-cv.open)<(pv.open-pv.close)*0.5) push('Bullish Harami', 72, 'Candlestick', 'Inside bar reversal on '+tf, cur, cur+atrVal*1.2, pv.low-atrVal*0.2);
  }

  if (n>=1) {
    const c=candles[n],body=Math.abs(c.close-c.open),lw=Math.min(c.open,c.close)-c.low,uw=c.high-Math.max(c.open,c.close);
    if (body<atrVal*0.2&&lw>body*3&&uw<body*0.5&&cur<=Math.min(...lows.slice(-12,-1))*1.02) push('Dragonfly Doji', 74, 'Candlestick', 'Doji at support on '+tf, cur, cur+atrVal*1.5, c.low-atrVal*0.2);
  }

  if (n>=1) {
    const pv=candles[n-1],cv=candles[n];
    if (Math.abs(pv.low-cv.low)/(pv.low||1)<0.003&&cv.close>cv.open) push('Tweezer Bottom', 71, 'Candlestick', 'Double low rejection on '+tf, cur, cur+atrVal*1.5, cv.low-atrVal*0.2);
  }

  if (n>=2) {
    const c1=candles[n-2],c2=candles[n-1],c3=candles[n];
    if (c1.close<c1.open&&(c1.open-c1.close)>atrVal*0.6&&c2.close>c2.open&&c2.open>=c1.close&&c2.close<=c1.open&&c3.close>c3.open&&c3.close>c1.open) push('Three Inside Up', 80, 'Candlestick', 'Bearish harami confirm on '+tf, cur, cur+atrVal*2, c1.low-atrVal*0.2);
  }

  if (n>=4) {
    const c0=candles[n-4],c1=candles[n-3],c2=candles[n-2],c3=candles[n-1],c4=candles[n];
    if (c0.close>c0.open&&(c0.close-c0.open)>atrVal*0.8&&[c1,c2,c3].every(c=>c.close<c.open&&c.low>=c0.low&&c.high<=c0.high)&&c4.close>c4.open&&c4.close>c0.close&&volR>=1.3) push('Rising Three Methods', 83, 'Continuation', 'Long green 3 reds breakout on '+tf, cur, cur+atrVal*2, c0.open-atrVal*0.3);
  }

  if (n>=1) {
    const pv=candles[n-1],cv=candles[n];
    if (pv.close<pv.open&&cv.close>cv.open&&cv.open>pv.open&&volR>=1.3) push('Bullish Kicker', 87, 'Continuation', 'Gap up kicker on '+tf, cur, cur+atrVal*2, pv.open-atrVal*0.3);
  }

  if (n>=30) {
    const l1=Math.min(...lows.slice(-30,-20)),l2=Math.min(...lows.slice(-20,-10)),l3=Math.min(...lows.slice(-10)),neck=Math.max(...closes.slice(-30));
    if (Math.abs(l1-l2)/l1<0.025&&Math.abs(l2-l3)/l2<0.025&&cur>=neck*0.998&&volR>=1.4) push('Triple Bottom', 88, 'Reversal', 'Three lows neckline break on '+tf, cur, cur+(neck-l1), l3-atrVal*0.3);
  }

  if (closes.length>=24) {
    const sl=closes.slice(-24),la=sl.slice(0,6).reduce((a,b)=>a+b,0)/6,ba=sl.slice(9,15).reduce((a,b)=>a+b,0)/6,ra=sl.slice(18,24).reduce((a,b)=>a+b,0)/6;
    if (ba<la*0.98&&ra>=la*0.96&&inUp) push('Rounding Bottom', 79, 'Reversal', 'U-shape accumulation on '+tf, cur, cur+atrVal*2, ba-atrVal*0.5);
  }

  if (n>=8) {
    const rl=Math.min(...lows.slice(-8)),drop=(closes[n-8]-rl)/closes[n-8],rec=(cur-rl)/rl;
    if (drop>0.015&&rec>0.01&&cur>ema20) push('V-Bottom Recovery', 80, 'Reversal', 'Sharp drop then recovery on '+tf, cur, cur+atrVal*1.5, rl-atrVal*0.3);
  }

  if (n>=5) {
    if (candles[n-4].open<candles[n-5].close&&candles[n].open>candles[n-1].close&&cur>closes[n-5]*0.99) push('Island Reversal Bottom', 86, 'Reversal', 'Gap down then gap up on '+tf, cur, cur+atrVal*2, candles[n-1].low-atrVal*0.3);
  }

  if (n>=12) {
    const wH=highs.slice(-12),wL=lows.slice(-12),hS=(wH[11]-wH[0])/12,lS=(wL[11]-wL[0])/12;
    if (hS<0&&lS<0&&Math.abs(lS)<Math.abs(hS)&&cur>wH[0]+hS*11&&volR>=1.4) push('Falling Wedge Breakout', 85, 'Reversal', 'Converging wedge breakout on '+tf, cur, cur+atrVal*2, (wH[0]+hS*11)-atrVal*0.5);
  }

  if (n>=20) {
    const f=lows.slice(-20,-10),s=lows.slice(-10),aL=Math.min(...f),eL=Math.min(...s);
    if (f.filter(l=>l<aL*1.015).length<=2&&s.filter(l=>l<eL*1.03).length>=3&&Math.abs(aL-eL)/aL<0.03&&cur>=Math.max(...closes.slice(-20))*0.998&&volR>=1.2) push('Adam & Eve Double Bottom', 87, 'Reversal', 'Sharp+rounded double bottom on '+tf, cur, cur+(Math.max(...closes.slice(-20))-aL), eL-atrVal*0.3);
  }

  if (closes.length>=30) {
    const m2=calcMACD(closes.slice(0,-2)),m1=calcMACD(closes.slice(0,-1));
    if (macdVal.histogram>0&&macdVal.histogram>m1.histogram&&m1.histogram>m2.histogram) push('MACD Histogram Expansion', 81, 'Momentum', 'MACD histogram growing 3 candles on '+tf, cur, cur+atrVal*1.5, cur-atrVal);
  }

  if (closes.length>=13) {
    const e13=calcEMA(closes,13),e13p=calcEMA(closes.slice(0,-1),13);
    if (e13>e13p&&candles[n].high>e13) push('Elder Ray Bull Power', 76, 'Momentum', 'EMA13 rising + high above EMA13 on '+tf, cur, cur+atrVal*1.5, e13-atrVal*0.5);
  }

  if (closes.length>=26) {
    const e9=calcEMA(closes,9),e26=calcEMA(closes,26),e9p=calcEMA(closes.slice(0,-1),9),e26p=calcEMA(closes.slice(0,-1),26);
    if (closes[n-1]<e9p&&closes[n-1]<e26p&&cur>e9&&cur>e26) push('Ichimoku Cloud Breakout', 84, 'Momentum', 'Price breaks above cloud on '+tf, cur, cur+atrVal*2, Math.min(e9,e26)-atrVal*0.3);
  }

  if (closes.length>=16) {
    const bH=Math.max(...highs.slice(-16,-1));
    if (cur>bH&&volR>=1.5) push('Darvas Box Breakout', 86, 'Breakout', 'Breaking Darvas box on '+tf, cur, cur+(bH-Math.min(...lows.slice(-16,-1))), bH*0.997);
  }

  if (closes.length>=20) {
    const s20=calcSMA(closes,20),s20p=calcSMA(closes.slice(0,-1),20);
    if (cur>s20&&s20>s20p&&volR>=1.2&&inUp) push('Weinstein Stage 2', 80, 'Trend', 'Above rising SMA20 on '+tf, cur, cur+atrVal*2, s20-atrVal*0.5);
  }

  if (n>=2) {
    const c1=candles[n-2],c2=candles[n-1],c3=candles[n];
    if (c2.open>c1.close&&c1.close>c1.open&&c2.close>c2.open&&c3.close<c3.open&&c3.close>c1.close) push('Upside Tasuki Gap', 78, 'Continuation', 'Gap up red fails to fill on '+tf, cur, cur+atrVal*1.5, c1.close-atrVal*0.3);
  }

  if (n>=4) {
    const c0=candles[n-4],c1=candles[n-3],c2=candles[n-2],c3=candles[n-1],c4=candles[n],mid=(c0.open+c0.close)/2;
    if (c0.close>c0.open&&(c0.close-c0.open)>atrVal*0.8&&[c1,c2,c3].every(c=>c.low>mid)&&c4.close>c4.open&&c4.close>c0.close) push('Mat Hold', 81, 'Continuation', 'Strong green pullback breakout on '+tf, cur, cur+atrVal*2, mid-atrVal*0.3);
  }

  if (closes.length>=20) {
    const vwap=closes.slice(-20).reduce((a,b)=>a+b,0)/20;
    if (closes[n-1]<vwap&&cur>=vwap&&volR>=1.3) push('VWAP Reclaim', 82, 'Support/Resistance', 'Price reclaimed VWAP on '+tf, cur, cur+atrVal*1.5, vwap-atrVal*0.5);
  }

  if (n>=2) {
    const m=candles[n-1],p2=candles[n-2];
    if (!(candles[n].high<=m.high&&candles[n].low>=m.low)&&m.high<=p2.high&&m.low>=p2.low&&cur>p2.high&&volR>=1.5) push('Inside Bar Breakout', 83, 'Breakout', 'Inside bar breaking out on '+tf, cur, cur+(p2.high-p2.low), p2.low);
  }

  if (n>=2&&atrVal>0) {
    const chk=i=>candles[i].close>(candles[i].high+candles[i].low)/2+1.5*atrVal;
    if (chk(n)&&chk(n-1)&&chk(n-2)) push('Supertrend Buy', 82, 'Trend', 'Price above Supertrend 3 candles on '+tf, cur, cur+atrVal*2, cur-atrVal*1.5);
  }

  return patterns;
}

// --- Multi-timeframe analysis for one index -----------------------------------
function analyzeIndex(indexKey, candles15m, candles1h, candles1d, optionChain) {
  const meta = require('../scrapers/indexData').INDICES[indexKey];
  const spot = candles15m?.length ? candles15m[candles15m.length - 1].close
             : candles1d?.length  ? candles1d[candles1d.length - 1].close : 0;

  // Run all 45 patterns on each timeframe
  const p15m = candles15m ? detectIndexPatterns(candles15m, '15m') : [];
  const p1h  = candles1h  ? detectIndexPatterns(candles1h,  '1h')  : [];
  const p1d  = candles1d  ? detectIndexPatterns(candles1d,  '1d')  : [];

  // MTF confluence: patterns appearing on 2+ timeframes get bonus
  const allPatternNames = [...new Set([...p15m, ...p1h, ...p1d].map(p => p.name))];
  const confluenceMap = {};
  allPatternNames.forEach(name => {
    const tfs = [];
    if (p15m.find(p => p.name === name)) tfs.push('15m');
    if (p1h.find(p => p.name === name))  tfs.push('1h');
    if (p1d.find(p => p.name === name))  tfs.push('1d');
    if (tfs.length >= 2) confluenceMap[name] = tfs;
  });

  // Indicators per timeframe
  const ind = (candles) => {
    if (!candles || candles.length < 20) return {};
    const closes = candles.map(c => c.close);
    return {
      ema9:  parseFloat(calcEMA(closes, 9).toFixed(2)),
      ema20: parseFloat(calcEMA(closes, 20).toFixed(2)),
      ema50: parseFloat(calcEMA(closes, 50).toFixed(2)),
      rsi:   calcRSI(closes, 14),
      macd:  calcMACD(closes),
      atr:   calcATR(candles, 14),
      bb:    calcBB(closes, 20),
    };
  };

  // Composite score: weighted by timeframe importance
  const score15m = p15m.length ? Math.min(p15m.reduce((s,p)=>s+p.strength,0)/p15m.length + Math.min((p15m.length-1)*3,15), 100) : 0;
  const score1h  = p1h.length  ? Math.min(p1h.reduce((s,p)=>s+p.strength,0)/p1h.length  + Math.min((p1h.length-1)*3,15),  100) : 0;
  const score1d  = p1d.length  ? Math.min(p1d.reduce((s,p)=>s+p.strength,0)/p1d.length  + Math.min((p1d.length-1)*3,15),  100) : 0;
  const confluenceBonus = Object.keys(confluenceMap).length * 5;
  const composite = Math.min(score15m*0.35 + score1h*0.35 + score1d*0.30 + confluenceBonus, 100);

  // Best setup from highest-strength pattern across all TFs
  const allPatterns = [...p15m, ...p1h, ...p1d].sort((a,b) => b.strength - a.strength);
  const bestSetup = allPatterns[0] || null;

  // Key levels from option chain
  const levels = buildKeyLevels(spot, optionChain, candles1d, meta);

  return {
    indexKey,
    label: meta?.label || indexKey,
    spot: parseFloat(spot.toFixed(2)),
    composite: Math.round(composite),
    patterns: { '15m': p15m, '1h': p1h, '1d': p1d },
    patternCount: { '15m': p15m.length, '1h': p1h.length, '1d': p1d.length, total: p15m.length+p1h.length+p1d.length },
    confluence: confluenceMap,
    confluenceCount: Object.keys(confluenceMap).length,
    indicators: { '15m': ind(candles15m), '1h': ind(candles1h), '1d': ind(candles1d) },
    bestSetup,
    levels,
    optionChain,
    recommendation: getIndexRec(composite, p15m.length+p1h.length+p1d.length),
  };
}

function buildKeyLevels(spot, oc, candles1d, meta) {
  const levels = [];
  const gap = meta?.strikeGap || 50;

  // ATM and nearby strikes
  if (spot > 0) {
    const atm = Math.round(spot / gap) * gap;
    for (let i = -4; i <= 4; i++) {
      const strike = atm + i * gap;
      const label = i === 0 ? 'ATM' : i > 0 ? `ATM+${i}` : `ATM${i}`;
      levels.push({ price: strike, label, type: 'strike', atm: i === 0 });
    }
  }

  // Option chain walls
  if (oc) {
    if (oc.ceWall?.strike) levels.push({ price: oc.ceWall.strike, label: `CE Wall (OI: ${(oc.ceWall.oi/1000).toFixed(0)}K)`, type: 'resistance', oi: oc.ceWall.oi });
    if (oc.peWall?.strike) levels.push({ price: oc.peWall.strike, label: `PE Wall (OI: ${(oc.peWall.oi/1000).toFixed(0)}K)`, type: 'support', oi: oc.peWall.oi });
    if (oc.maxPain)        levels.push({ price: oc.maxPain, label: 'Max Pain', type: 'maxpain' });
  }

  // Technical S/R from daily candles
  if (candles1d && candles1d.length >= 20) {
    const highs = candles1d.map(c => c.high);
    const lows  = candles1d.map(c => c.low);
    levels.push({ price: parseFloat(Math.max(...highs.slice(-52)).toFixed(2)), label: '52W High', type: 'resistance' });
    levels.push({ price: parseFloat(Math.min(...lows.slice(-52)).toFixed(2)),  label: '52W Low',  type: 'support' });
    levels.push({ price: parseFloat(Math.max(...highs.slice(-5)).toFixed(2)),  label: 'Week High', type: 'resistance' });
    levels.push({ price: parseFloat(Math.min(...lows.slice(-5)).toFixed(2)),   label: 'Week Low',  type: 'support' });
  }

  return levels.sort((a, b) => a.price - b.price);
}

function getIndexRec(score, patternCount) {
  if (score >= 75 && patternCount >= 3) return { action: 'STRONG BUY', color: '#00c853' };
  if (score >= 60 && patternCount >= 2) return { action: 'BUY',         color: '#69f0ae' };
  if (score >= 45)                      return { action: 'WATCH',       color: '#ffd740' };
  if (score >= 30)                      return { action: 'NEUTRAL',     color: '#90a4ae' };
  return                                       { action: 'AVOID',       color: '#ff5252' };
}

module.exports = { analyzeIndex, detectIndexPatterns };
