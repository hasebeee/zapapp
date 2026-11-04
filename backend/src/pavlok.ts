const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendStimulus(pavlokToken: string, type: 'zap' | 'beep' | 'vibration'): Promise<Response> {
  return fetch('https://api.pavlok.com/api/v5/stimulus/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pavlokToken}`,
    },
    body: JSON.stringify({ stimulus: { stimulusType: type, stimulusValue: 100 } }),
  });
}

/**
 * Pavlok に beep×1 → vibe×3 → zap×1 のシーケンスを送信する。
 * zap が成功したら true を返す。
 */
export async function sendZapSequence(pavlokToken: string): Promise<boolean> {
  // beep × 1
  await sendStimulus(pavlokToken, 'beep');
  await sleep(1000);

  // vibration × 3
  for (let i = 0; i < 3; i++) {
    await sendStimulus(pavlokToken, 'vibration');
    await sleep(1000);
  }

  // zap × 1
  const zapRes = await sendStimulus(pavlokToken, 'zap');
  if (!zapRes.ok) {
    const errText = await zapRes.text();
    console.warn(`[pavlok] zap failed: ${zapRes.status} ${errText}`);
  }
  return zapRes.ok;
}
